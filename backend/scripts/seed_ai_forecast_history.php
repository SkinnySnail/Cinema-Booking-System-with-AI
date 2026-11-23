<?php
/**
 * Seed realistic past showtimes, paid bookings, and USED tickets so the AI
 * demand-forecast model (RandomForestRegressor) has enough varied attendance
 * history (>= 20 past showtimes per cinema) for testing AI scheduling & chat forecast.
 *
 * Usage:
 *   php backend/scripts/seed_ai_forecast_history.php          # idempotent insert
 *   php backend/scripts/seed_ai_forecast_history.php --reset  # delete previous AIF-* seed data and re-seed
 */

require_once __DIR__ . '/../config/Env.php';
Env::load(dirname(__DIR__, 2) . '/.env');
require_once __DIR__ . '/../config/Database.php';

$reset = in_array('--reset', $argv ?? [], true);
$db = Database::getInstance()->getConnection();

$existingCount = (int)$db->query("SELECT COUNT(*) FROM bookings WHERE booking_code LIKE 'AIF-%'")->fetchColumn();
if ($existingCount > 0 && !$reset) {
    echo "AI forecast history already seeded ({$existingCount} AIF-* bookings). Pass --reset to recreate.\n";
    exit(0);
}

$db->beginTransaction();
try {
    if ($reset && $existingCount > 0) {
        // Delete bookings (tickets cascade), then delete orphaned past showtimes created by this script.
        $showtimeIds = $db->query("SELECT DISTINCT showtime_id FROM bookings WHERE booking_code LIKE 'AIF-%'")
            ->fetchAll(PDO::FETCH_COLUMN);
        $db->exec("DELETE FROM bookings WHERE booking_code LIKE 'AIF-%'");
        if ($showtimeIds) {
            $placeholders = implode(',', array_fill(0, count($showtimeIds), '?'));
            $stmt = $db->prepare("DELETE FROM showtimes WHERE id IN ({$placeholders})
                AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.showtime_id = showtimes.id)");
            $stmt->execute($showtimeIds);
        }
        echo "Cleared previous AIF-* seed records.\n";
    }

    // Fetch active cinemas & one primary hall per cinema with its active seats.
    $cinemas = $db->query("SELECT id, name FROM cinemas WHERE LOWER(status) = 'active' ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
    $hallStmt = $db->prepare("SELECT id, name FROM cinema_halls WHERE cinema_id = ? ORDER BY id LIMIT 1");
    $seatStmt = $db->prepare("SELECT id FROM seats WHERE cinema_hall_id = ? AND status <> 'Inactive' ORDER BY id");

    $movies = $db->query("SELECT id, title, duration_minutes, age_rating FROM movies
        WHERE status = 'Now Showing' AND age_rating <> 'C' AND duration_minutes > 0 ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
    $movieById = [];
    foreach ($movies as $m) {
        $movieById[(int)$m['id']] = $m;
    }
    if (empty($movieById)) {
        throw new RuntimeException('No eligible Now Showing movies found.');
    }

    $memberIds = $db->query("SELECT id FROM users WHERE role_id = 2 AND status = 'Active' ORDER BY id")->fetchAll(PDO::FETCH_COLUMN);
    if (empty($memberIds)) {
        $memberIds = $db->query("SELECT id FROM users ORDER BY id LIMIT 3")->fetchAll(PDO::FETCH_COLUMN);
    }

    // Distinct demand profiles (target base occupancy ratio by movie & time slot) so RandomForest learns clear rankings.
    $movieProfiles = [
        7  => ['morning' => 0.30, 'afternoon' => 0.58, 'evening' => 0.88, 'late' => 0.80], // Blockbuster action/sci-fi
        8  => ['morning' => 0.25, 'afternoon' => 0.55, 'evening' => 0.85, 'late' => 0.78], // Godzilla
        1  => ['morning' => 0.28, 'afternoon' => 0.52, 'evening' => 0.82, 'late' => 0.72], // Bo Sua Bay
        9  => ['morning' => 0.84, 'afternoon' => 0.78, 'evening' => 0.38, 'late' => 0.14], // Kids animation
        2  => ['morning' => 0.22, 'afternoon' => 0.48, 'evening' => 0.68, 'late' => 0.50], // Drama
        3  => ['morning' => 0.20, 'afternoon' => 0.45, 'evening' => 0.64, 'late' => 0.48], // Drama/comedy
        4  => ['morning' => 0.18, 'afternoon' => 0.42, 'evening' => 0.60, 'late' => 0.52], // Drama
        6  => ['morning' => 0.12, 'afternoon' => 0.24, 'evening' => 0.36, 'late' => 0.30], // Lower demand
        10 => ['morning' => 0.10, 'afternoon' => 0.22, 'evening' => 0.34, 'late' => 0.32], // Niche horror
        11 => ['morning' => 0.15, 'afternoon' => 0.28, 'evening' => 0.38, 'late' => 0.25], // Niche
        12 => ['morning' => 0.14, 'afternoon' => 0.26, 'evening' => 0.40, 'late' => 0.28], // Niche
    ];

    $movieIds = array_values(array_filter(array_keys($movieProfiles), fn($id) => isset($movieById[$id])));
    if (empty($movieIds)) {
        $movieIds = array_keys($movieById);
    }

    $slotDefs = [
        ['hour' => 9,  'minute' => 0, 'bucket' => 'morning'],
        ['hour' => 15, 'minute' => 0, 'bucket' => 'afternoon'],
        ['hour' => 18, 'minute' => 0, 'bucket' => 'evening'],
        ['hour' => 21, 'minute' => 0, 'bucket' => 'late'],
    ];

    $conflictStmt = $db->prepare("SELECT COUNT(*) FROM showtimes WHERE cinema_hall_id = ? AND start_time < ? AND end_time > ?");
    $insertShow = $db->prepare("INSERT INTO showtimes (movie_id, cinema_hall_id, start_time, end_time, base_price) VALUES (?, ?, ?, ?, ?)");
    $insertBooking = $db->prepare("INSERT INTO bookings (user_id, guest_customer_id, showtime_id, booking_code, total_price, discount_amount, final_price, status, created_at)
        VALUES (?, NULL, ?, ?, ?, 0.00, ?, 'Paid', ?)");
    $insertTicket = $db->prepare("INSERT INTO tickets (booking_id, seat_id, price, ticket_code, status, hold_expires_at, created_at)
        VALUES (?, ?, ?, ?, 'USED', NULL, ?)");

    $now = new DateTimeImmutable('now');
    $bookingSeq = 1;
    $ticketSeq = 1;
    $summary = [];

    foreach ($cinemas as $cinema) {
        $cinemaId = (int)$cinema['id'];
        $hallStmt->execute([$cinemaId]);
        $hall = $hallStmt->fetch(PDO::FETCH_ASSOC);
        if (!$hall) continue;
        $hallId = (int)$hall['id'];

        $seatStmt->execute([$hallId]);
        $seatIds = $seatStmt->fetchAll(PDO::FETCH_COLUMN);
        $capacity = count($seatIds);
        if ($capacity < 10) continue;

        $showsAdded = 0;
        $ticketsAdded = 0;

        // Seed across days -28 .. -2 (strictly in the past, well inside 180-day forecast window).
        for ($daysAgo = 28; $daysAgo >= 2; $daysAgo--) {
            $day = $now->modify("-{$daysAgo} days");
            $weekday = (int)$day->format('N'); // 1=Mon..7=Sun
            $isWeekend = $weekday >= 6;

            // 2 slots per day -> 54 candidate shows per cinema across 27 days
            $daySlots = ($daysAgo % 2 === 0) ? [$slotDefs[0], $slotDefs[2]] : [$slotDefs[1], $slotDefs[3]];
            foreach ($daySlots as $slotIdx => $slot) {
                $movieId = $movieIds[($daysAgo * 3 + $slotIdx + $cinemaId) % count($movieIds)];
                $movie = $movieById[$movieId];
                $duration = (int)$movie['duration_minutes'];

                $startDt = $day->setTime($slot['hour'], $slot['minute'], 0);
                $endDt = $startDt->modify('+' . ($duration + 15) . ' minutes');
                if ($endDt >= $now) continue;

                $startStr = $startDt->format('Y-m-d H:i:s');
                $endStr = $endDt->format('Y-m-d H:i:s');

                $conflictStmt->execute([$hallId, $endStr, $startStr]);
                if ((int)$conflictStmt->fetchColumn() > 0) continue;

                $price = ($slot['hour'] >= 18 || $isWeekend) ? 105000.00 : 85000.00;
                $insertShow->execute([$movieId, $hallId, $startStr, $endStr, $price]);
                $showtimeId = (int)$db->lastInsertId();
                $showsAdded++;

                $profile = $movieProfiles[$movieId] ?? ['morning' => 0.25, 'afternoon' => 0.40, 'evening' => 0.55, 'late' => 0.45];
                $ratio = $profile[$slot['bucket']];
                if ($isWeekend) {
                    $ratio = min(0.95, $ratio + 0.12);
                }
                // Deterministic slight variation (+/- 4%)
                $jitter = ((($daysAgo * 17 + $movieId * 13 + $cinemaId * 7) % 9) - 4) * 0.01;
                $ratio = max(0.05, min(0.95, $ratio + $jitter));

                $soldTarget = max(2, (int)round($capacity * $ratio));
                $soldTarget = min($capacity, $soldTarget);

                // Split tickets across member users (e.g. up to 4 bookings per showtime).
                $remaining = $soldTarget;
                $seatOffset = 0;
                $bookingCount = min(4, max(1, (int)ceil($soldTarget / 25)));
                for ($bIdx = 0; $bIdx < $bookingCount && $remaining > 0; $bIdx++) {
                    $chunk = ($bIdx === $bookingCount - 1) ? $remaining : (int)ceil($remaining / ($bookingCount - $bIdx));
                    $remaining -= $chunk;

                    $userId = (int)$memberIds[($bookingSeq + $movieId) % count($memberIds)];
                    $code = sprintf('AIF-C%d-%05d', $cinemaId, $bookingSeq++);
                    $totalPrice = $chunk * $price;
                    $createdAt = $startDt->modify('-2 hours')->format('Y-m-d H:i:s');

                    $insertBooking->execute([$userId, $showtimeId, $code, $totalPrice, $totalPrice, $createdAt]);
                    $bookingId = (int)$db->lastInsertId();

                    for ($t = 0; $t < $chunk; $t++) {
                        $seatId = (int)$seatIds[$seatOffset++];
                        $tCode = sprintf('TKT-AIF-%d-%06d', $cinemaId, $ticketSeq++);
                        $insertTicket->execute([$bookingId, $seatId, $price, $tCode, $createdAt]);
                        $ticketsAdded++;
                    }
                }
            }
        }

        $summary[] = sprintf('Cinema #%d (%s): +%d past showtimes, +%d USED tickets (hall capacity %d)',
            $cinemaId, $cinema['name'], $showsAdded, $ticketsAdded, $capacity);
    }

    $db->commit();
    foreach ($summary as $line) {
        echo $line . "\n";
    }
    echo "Done seeding AI forecast history.\n";
} catch (Throwable $e) {
    $db->rollBack();
    fwrite(STDERR, 'Seed failed: ' . $e->getMessage() . "\n");
    exit(1);
}
