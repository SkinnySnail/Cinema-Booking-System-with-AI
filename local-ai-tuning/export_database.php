<?php
/** Read-only, consistent training snapshots. Never called by a public HTTP route. */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

function tuningCsv(string $path, array $columns, array $rows): void {
    $stream = fopen($path, 'x');
    if (!$stream) throw new RuntimeException('Cannot create export file');
    fputcsv($stream, $columns);
    foreach ($rows as $row) {
        fputcsv($stream, array_map(fn($key) => $row[$key] ?? '', $columns));
    }
    fclose($stream);
}

function tuningRedact(string $text): string {
    $text = preg_replace('/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu', '[email]', $text);
    $text = preg_replace('/(?<!\d)(?:\+?84|0)[\d .-]{8,13}(?!\d)/u', '[phone]', $text);
    // Prevent a review from becoming an Excel formula during manual annotation.
    return preg_match('/^\s*[=+@-]/u', $text) ? "'" . $text : $text;
}

try {
    $options = getopt('', ['out:', 'days:', 'cinema-id:', 'forecast-only']);
    $forecastOnly = isset($options['forecast-only']);
    $output = $options['out'] ?? '';
    if (!$output) throw new InvalidArgumentException('Usage: php local-ai-tuning/export_database.php --out=<new folder> [--days=180] [--cinema-id=1] [--forecast-only]');
    if (file_exists($output)) throw new InvalidArgumentException('Output folder already exists; choose a new folder');
    $days = (int)($options['days'] ?? 180);
    $cinemaId = (int)($options['cinema-id'] ?? 0);
    if ($days < 1 || $days > 730 || $cinemaId < 0) throw new InvalidArgumentException('Invalid days or cinema ID');
    $dsn = getenv('TUNING_DB_DSN') ?: '';
    $user = getenv('TUNING_DB_USER') ?: '';
    $key = getenv('TUNING_ANON_KEY') ?: '';
    if (!$dsn || !$user) throw new InvalidArgumentException('Set TUNING_DB_DSN, TUNING_DB_USER and TUNING_DB_PASSWORD');
    if (!$forecastOnly && strlen($key) < 32) throw new InvalidArgumentException('Set a private TUNING_ANON_KEY (32+ characters) for exporting interactions');
    $db = new PDO($dsn, $user, getenv('TUNING_DB_PASSWORD') ?: '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $db->exec("SET time_zone='+07:00'");
    $db->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    $db->exec('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    $cutoff = $db->query('SELECT NOW()')->fetchColumn();
    $start = (new DateTimeImmutable($cutoff, new DateTimeZone('Asia/Ho_Chi_Minh')))->modify("-$days days")->format('Y-m-d H:i:s');
    $statement = $db->prepare("SELECT s.id AS showtime_id,s.start_time AS timestamp,h.cinema_id,s.movie_id,
        (SELECT COUNT(*) FROM seats se WHERE se.cinema_hall_id=s.cinema_hall_id AND se.status<>'Inactive') AS capacity,
        (SELECT COUNT(*) FROM tickets t JOIN bookings b ON b.id=t.booking_id WHERE b.showtime_id=s.id AND b.status='Paid' AND t.status IN ('SOLD','USED')) AS sold
        FROM showtimes s JOIN cinema_halls h ON h.id=s.cinema_hall_id
        WHERE s.start_time>=? AND s.end_time<? AND (?=0 OR h.cinema_id=?) ORDER BY s.start_time LIMIT 100000");
    $statement->execute([$start, $cutoff, $cinemaId, $cinemaId]);
    $forecast = $statement->fetchAll();
    $forecastColumns = ['showtime_id','timestamp','cinema_id','movie_id','capacity','sold'];
    if ($forecastOnly) {
        $db->exec('COMMIT');
        if (!mkdir($output, 0700, true)) throw new RuntimeException('Cannot create output folder');
        tuningCsv($output . '/forecast.csv', $forecastColumns, $forecast);
        echo json_encode(['status'=>'exported','directory'=>realpath($output),'screenings'=>count($forecast)]) . PHP_EOL;
        exit;
    }
    // Movie metadata only; never select users, passwords, phone numbers or payment credentials.
    $movies = $db->query("SELECT m.id,m.title,m.description,m.director,m.cast,m.release_date,
        (SELECT GROUP_CONCAT(g.name SEPARATOR ' ') FROM genres g JOIN movie_genres mg ON mg.genre_id=g.id WHERE mg.movie_id=m.id) AS genres
        FROM movies m WHERE m.age_rating<>'C' ORDER BY m.id DESC LIMIT 500")->fetchAll();
    $ids = array_fill_keys(array_column($movies, 'id'), true);
    $statement = $db->prepare("SELECT b.user_id,s.movie_id,b.updated_at AS timestamp,COUNT(*) AS weight
        FROM bookings b JOIN showtimes s ON s.id=b.showtime_id JOIN tickets t ON t.booking_id=b.id
        JOIN cinema_halls h ON h.id=s.cinema_hall_id
        WHERE b.user_id IS NOT NULL AND b.status='Paid' AND t.status IN ('SOLD','USED') AND b.updated_at>=? AND b.updated_at<=?
        AND (?=0 OR h.cinema_id=?) GROUP BY b.user_id,s.movie_id,b.updated_at ORDER BY b.updated_at LIMIT 100000");
    $statement->execute([$start, $cutoff, $cinemaId, $cinemaId]);
    $interactions = [];
    foreach ($statement->fetchAll() as $row) {
        if (!isset($ids[$row['movie_id']])) continue;
        $row['user_id'] = hexdec(substr(hash_hmac('sha256', (string)$row['user_id'], $key), 0, 12)) + 1;
        $row['weight'] = min(100, (int)$row['weight']);
        $interactions[] = $row;
    }
    $statement = $db->prepare("SELECT r.id AS review_id,r.movie_id,r.comment AS text,r.rating FROM reviews r
        WHERE r.created_at>=? AND r.created_at<=? AND r.comment IS NOT NULL AND r.comment<>''
        AND (?=0 OR EXISTS(SELECT 1 FROM showtimes s JOIN cinema_halls h ON h.id=s.cinema_hall_id WHERE s.movie_id=r.movie_id AND h.cinema_id=?))
        ORDER BY r.id LIMIT 100000");
    $statement->execute([$start, $cutoff, $cinemaId, $cinemaId]);
    $reviews = [];
    foreach ($statement->fetchAll() as $row) {
        $reviews[] = ['review_id' => $row['review_id'], 'text' => tuningRedact($row['text']), 'label' => '',
            'group_id' => 'movie-' . $row['movie_id'], 'rating' => $row['rating'], 'source' => 'database-manual-label-required'];
    }
    $db->exec('COMMIT');
    if (!mkdir($output, 0700, true)) throw new RuntimeException('Cannot create output folder');
    tuningCsv($output . '/sentiment-unlabelled.csv', ['review_id','text','label','group_id','rating','source'], $reviews);
    tuningCsv($output . '/interactions.csv', ['user_id','movie_id','timestamp','weight'], $interactions);
    tuningCsv($output . '/forecast.csv', $forecastColumns, $forecast);
    file_put_contents($output . '/movies.json', json_encode($movies, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
    file_put_contents($output . '/provenance.json', json_encode([
        'provenance' => 'real', 'cutoff' => $cutoff, 'timezone' => 'Asia/Ho_Chi_Minh', 'days' => $days, 'cinema_id' => $cinemaId,
        'counts' => ['reviews' => count($reviews), 'interactions' => count($interactions), 'forecast' => count($forecast)],
        'notice' => 'Reviews require manual labels. Rating is not ground truth. Redaction is best effort; inspect text before sharing. IDs are pseudonymous, not guaranteed anonymous.',
    ], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
    echo json_encode(['status' => 'exported', 'directory' => realpath($output), 'manual_label_required' => true]) . PHP_EOL;
} catch (Throwable $error) {
    if (isset($db)) {
        try { $db->exec('ROLLBACK'); } catch (Throwable $ignored) {}
    }
    // Do not emit DSNs or database credentials in CLI errors.
    $message = $error instanceof PDOException ? 'Database export failed. Check connection/SELECT privileges and schema.' : $error->getMessage();
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}
