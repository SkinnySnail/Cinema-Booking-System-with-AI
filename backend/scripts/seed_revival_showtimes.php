<?php
/**
 * Add sample revival screenings without deleting existing data.
 * Preview: php backend/scripts/seed_revival_showtimes.php --until=2026-12-31
 * Apply:   php backend/scripts/seed_revival_showtimes.php --until=2026-12-31 --apply
 * Uses DB_HOST, DB_NAME, DB_USER (or DB_USERNAME), DB_PASSWORD, optional DB_PORT.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

date_default_timezone_set('Asia/Ho_Chi_Minh');
$db = null;
$locked = false;
try {
    $options = getopt('', ['from:', 'until:', 'apply']);
    $now = new DateTimeImmutable();
    $fromText = $options['from'] ?? $now->format('Y-m-d');
    $untilText = $options['until'] ?? $now->format('Y') . '-12-31';
    $parseDate = static function ($value) {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        if (!$date || $date->format('Y-m-d') !== $value) {
            throw new InvalidArgumentException('Dates must use YYYY-MM-DD.');
        }
        return $date;
    };
    $from = $parseDate($fromText);
    $until = $parseDate($untilText);
    if ($from < $now->setTime(0, 0) || $until < $from || $from->diff($until)->days > 365) {
        throw new InvalidArgumentException('Choose today or a future date, with a range of at most 366 days.');
    }
    $apply = array_key_exists('apply', $options);
    $host = getenv('DB_HOST') ?: '127.0.0.1';
    $database = getenv('DB_NAME') ?: 'galaxy_cinema';
    $user = getenv('DB_USER') ?: getenv('DB_USERNAME');
    if (!$user) {
        throw new RuntimeException('Set DB_USER or DB_USERNAME.');
    }
    $db = new PDO('mysql:host=' . $host . ';port=' . (getenv('DB_PORT') ?: '3306')
        . ';dbname=' . $database . ';charset=utf8mb4', $user, getenv('DB_PASSWORD') ?: '', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    $db->exec("SET time_zone = '+07:00'");
    $lock = $db->query("SELECT GET_LOCK('cinema_seed_revival_showtimes', 5)")->fetchColumn();
    if ((int)$lock !== 1) {
        throw new RuntimeException('Another revival seed is running.');
    }
    $locked = true;
    $db->beginTransaction();
    $halls = $db->query("SELECT h.id,h.cinema_id,h.name,c.name AS cinema_name
        FROM cinema_halls h JOIN cinemas c ON c.id=h.cinema_id
        WHERE LOWER(c.status)='active'
        AND EXISTS (SELECT 1 FROM seats se WHERE se.cinema_hall_id=h.id AND se.status='Active')
        ORDER BY h.id FOR UPDATE")->fetchAll();
    $movies = $db->query("SELECT id,title,duration_minutes,origin,release_date,status FROM movies
        WHERE age_rating<>'C' AND duration_minutes>0 ORDER BY id FOR UPDATE")->fetchAll();
    if (!$halls || !$movies) {
        throw new RuntimeException('Seed movies, active cinemas and seats first.');
    }
    $configs = $db->query("SELECT config_key,config_value FROM system_configs
        WHERE config_key IN ('cleanup_duration','min_vietnamese_quota','base_ticket_price')")
        ->fetchAll(PDO::FETCH_KEY_PAIR);
    $cleanup = max(1, (int)($configs['cleanup_duration'] ?? 15));
    $quota = max(0, min(100, (float)($configs['min_vietnamese_quota'] ?? 15)));
    $basePrice = max(1, (float)($configs['base_ticket_price'] ?? 90000));
    $existing = $db->prepare('SELECT s.*,h.cinema_id,m.origin FROM showtimes s
        JOIN cinema_halls h ON h.id=s.cinema_hall_id JOIN movies m ON m.id=s.movie_id
        WHERE s.end_time>? AND s.start_time<?');
    $existing->execute([$from->format('Y-m-d H:i:s'), $until->modify('+1 day')->format('Y-m-d H:i:s')]);
    $occupied = [];
    $daily = [];
    foreach ($existing as $show) {
        $occupied[$show['cinema_hall_id']][] = [$show['start_time'], $show['end_time']];
        $key = $show['cinema_id'] . '/' . substr($show['start_time'], 0, 10);
        $daily[$key]['total'] = ($daily[$key]['total'] ?? 0) + 1;
        $daily[$key]['vietnamese'] = ($daily[$key]['vietnamese'] ?? 0) + ($show['origin'] === 'Vietnam' ? 1 : 0);
    }
    $plan = [];
    $movieSummary = [];
    $cinemaSummary = [];
    $skipped = 0;
    $slots = ['09:00', '12:30', '16:00', '19:30'];
    for ($day = $from, $dayIndex = 0; $day <= $until; $day = $day->modify('+1 day'), $dayIndex++) {
        $date = $day->format('Y-m-d');
        foreach ($slots as $slotIndex => $slot) {
            $start = new DateTimeImmutable($date . ' ' . $slot);
            if ($start <= $now) {
                continue;
            }
            foreach ($halls as $hallIndex => $hall) {
                $key = $hall['cinema_id'] . '/' . $date;
                $stats = $daily[$key] ?? ['total' => 0, 'vietnamese' => 0];
                $needsVietnam = $stats['vietnamese'] < (int)ceil(($stats['total'] + 1) * $quota / 100);
                $selected = null;
                for ($attempt = 0; $attempt < count($movies); $attempt++) {
                    $movie = $movies[($dayIndex + $hallIndex + $slotIndex + $attempt) % count($movies)];
                    if (($movie['release_date'] && $movie['release_date'] > $date)
                        || ($needsVietnam && $movie['origin'] !== 'Vietnam')) {
                        continue;
                    }
                    $end = $start->modify('+' . ((int)$movie['duration_minutes'] + $cleanup) . ' minutes');
                    // Leave 30 minutes between slots, and close by 23:00 including cleanup.
                    $latestEnd = $slotIndex < count($slots) - 1
                        ? (new DateTimeImmutable($date . ' ' . $slots[$slotIndex + 1]))->modify('-30 minutes')
                        : new DateTimeImmutable($date . ' 23:00');
                    if ($end > $latestEnd) {
                        continue;
                    }
                    $startText = $start->format('Y-m-d H:i:s');
                    $endText = $end->format('Y-m-d H:i:s');
                    foreach ($occupied[$hall['id']] ?? [] as [$otherStart, $otherEnd]) {
                        if ($startText < $otherEnd && $endText > $otherStart) {
                            continue 2;
                        }
                    }
                    $selected = [$movie, $startText, $endText];
                    break;
                }
                if (!$selected) {
                    $skipped++;
                    continue;
                }
                [$movie, $startText, $endText] = $selected;
                $plan[] = [(int)$movie['id'], (int)$hall['id'], $startText, $endText, $basePrice];
                $occupied[$hall['id']][] = [$startText, $endText];
                $daily[$key] = ['total' => $stats['total'] + 1,
                    'vietnamese' => $stats['vietnamese'] + ($movie['origin'] === 'Vietnam' ? 1 : 0)];
                $movieSummary[$movie['id']] = ['title' => $movie['title'],
                    'screenings' => ($movieSummary[$movie['id']]['screenings'] ?? 0) + 1];
                $cinemaSummary[$hall['cinema_id']] = ['name' => $hall['cinema_name'],
                    'screenings' => ($cinemaSummary[$hall['cinema_id']]['screenings'] ?? 0) + 1];
            }
        }
    }
    if ($apply) {
        $insert = $db->prepare('INSERT INTO showtimes (movie_id,cinema_hall_id,start_time,end_time,base_price) VALUES (?,?,?,?,?)');
        foreach ($plan as $row) {
            $insert->execute($row);
        }
        $activate = $db->prepare("UPDATE movies SET status='Now Showing' WHERE id=? AND status<>'Now Showing'");
        foreach (array_keys($movieSummary) as $movieId) {
            $activate->execute([$movieId]);
        }
        $db->commit();
    } else {
        $db->rollBack();
    }
    echo json_encode(['mode' => $apply ? 'applied' : 'preview', 'from' => $fromText, 'until' => $untilText,
        'timezone' => 'Asia/Ho_Chi_Minh', 'slots' => $slots, 'cleanup_minutes' => $cleanup,
        'base_price' => $basePrice, 'added_screenings' => count($plan), 'skipped_slots' => $skipped,
        'first_start' => $plan[0][2] ?? null, 'last_start' => $plan[count($plan) - 1][2] ?? null,
        'movies' => $movieSummary, 'cinemas' => $cinemaSummary], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";
} catch (Throwable $error) {
    if ($db && $db->inTransaction()) {
        $db->rollBack();
    }
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
} finally {
    if ($db && $locked) {
        $db->query("SELECT RELEASE_LOCK('cinema_seed_revival_showtimes')");
    }
}
