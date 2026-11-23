<?php
/**
 * Cronjob: Tự động hết hạn booking Pending quá 10 phút
 * Chạy mỗi 5 phút trong Docker:
 *   docker exec galaxy_cinema_app php /app/backend/cron_expire_bookings.php
 */

require_once __DIR__ . '/config/Env.php';
Env::load(__DIR__ . '/.env');

require_once __DIR__ . '/config/Database.php';
require_once __DIR__ . '/service/PusherService.php';
require_once __DIR__ . '/models/Booking.php';

$db = Database::getInstance()->getConnection();
$bookingModel = new Booking($db);

$expireMinutes = 10; // Hết hạn sau 10 phút
$count = $bookingModel->expireStaleBookings($expireMinutes);

echo date('Y-m-d H:i:s') . " - Expired $count stale booking(s).\n";
