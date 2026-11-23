<?php
/**
 * Pusher Service
 * Sends realtime events to frontend through Pusher Channels HTTP API.
 */
class PusherService {
    public static function triggerPaymentStatus($bookingId, $transactionCode, $status, $gateway) {
        return self::trigger('booking.' . (int)$bookingId, 'payment-status-updated', [
            'booking_id' => (int)$bookingId,
            'transaction_code' => (string)$transactionCode,
            'status' => (string)$status,
            'gateway' => (string)$gateway,
            'updated_at' => date('c'),
        ], 8);
    }

    /**
     * Báo cho mọi client đang mở sơ đồ ghế của suất chiếu rằng trạng thái ghế đã đổi.
     * Payload không chứa thông tin người dùng; client tự tải lại sơ đồ ghế.
     */
    public static function triggerSeatsUpdated($showtimeId, $reason) {
        $showtimeId = (int)$showtimeId;
        if ($showtimeId <= 0) {
            return false;
        }
        return self::trigger('showtime.' . $showtimeId, 'seats-updated', [
            'showtime_id' => $showtimeId,
            'reason' => (string)$reason,
            'updated_at' => date('c'),
        ], 3);
    }

    /**
     * Báo có thông báo mới. $userId = null: thông báo chung (kênh "notifications");
     * có $userId: thông báo riêng (kênh "user-notifications.{id}").
     * Payload không chứa nội dung; client tự tải lại danh sách qua API có xác thực.
     */
    public static function triggerNotificationsUpdated($userId = null) {
        $channel = $userId ? 'user-notifications.' . (int) $userId : 'notifications';
        return self::trigger($channel, 'notifications-updated', [
            'scope' => $userId ? 'user' : 'broadcast',
            'updated_at' => date('c'),
        ], 3);
    }

    /**
     * Như triggerSeatsUpdated nhưng tra suất chiếu từ mã đơn đặt vé.
     */
    public static function triggerSeatsUpdatedForBooking($db, $bookingId, $reason) {
        if (!self::isConfigured()) {
            return false;
        }
        try {
            $stmt = $db->prepare("SELECT showtime_id FROM bookings WHERE id = :id LIMIT 1");
            $stmt->execute([':id' => (int)$bookingId]);
            $showtimeId = (int)$stmt->fetchColumn();
        } catch (Exception $e) {
            error_log('Pusher seat lookup failed: ' . $e->getMessage());
            return false;
        }
        return self::triggerSeatsUpdated($showtimeId, $reason);
    }

    private static function isConfigured() {
        return (getenv('PUSHER_APP_ID') ?: '') !== ''
            && (getenv('PUSHER_KEY') ?: '') !== ''
            && (getenv('PUSHER_SECRET') ?: '') !== '';
    }

    private static function trigger($channel, $event, array $data, $timeoutSeconds) {
        if (!self::isConfigured()) {
            // Realtime is optional. Skip silently when not configured.
            return false;
        }

        if (!function_exists('curl_init')) {
            error_log('Pusher trigger skipped: cURL extension is not enabled.');
            return false;
        }

        $appId = getenv('PUSHER_APP_ID');
        $key = getenv('PUSHER_KEY');
        $secret = getenv('PUSHER_SECRET');
        $cluster = getenv('PUSHER_CLUSTER') ?: 'ap1';

        $host = 'api-' . $cluster . '.pusher.com';
        $path = '/apps/' . $appId . '/events';
        $body = json_encode([
            'name' => $event,
            'channels' => [$channel],
            'data' => json_encode($data, JSON_UNESCAPED_UNICODE),
        ], JSON_UNESCAPED_UNICODE);

        if ($body === false) {
            return false;
        }

        $queryParams = [
            'auth_key' => $key,
            'auth_timestamp' => (string)time(),
            'auth_version' => '1.0',
            'body_md5' => md5($body),
        ];
        ksort($queryParams);
        $query = http_build_query($queryParams);

        $stringToSign = "POST\n" . $path . "\n" . $query;
        $signature = hash_hmac('sha256', $stringToSign, $secret);
        $url = 'https://' . $host . $path . '?' . $query . '&auth_signature=' . $signature;

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_TIMEOUT => (int)$timeoutSeconds,
        ]);

        $response = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        if ($response === false || $httpCode < 200 || $httpCode >= 300) {
            $error = curl_error($ch);
            curl_close($ch);
            error_log('Pusher trigger failed: ' . ($error ?: ('HTTP ' . $httpCode)));
            return false;
        }

        curl_close($ch);
        return true;
    }
}
