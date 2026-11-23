<?php
// Simple API smoke test for Booking & Transaction flow

$baseUrl = getenv('API_BASE_URL') ?: 'http://localhost:8000';

require __DIR__ . '/../backend/config/Config.php';
require __DIR__ . '/../backend/utils/JWT.php';

$token = JWT::encode([
    'user_id' => 4,
    'role' => 'Member',
    'role_id' => 2,
    'exp' => time() + 3600,
], Config::$jwt_secret);

function request($method, $url, $data = null, $token = null) {
    $headers = [
        'Content-Type: application/json',
    ];
    if ($token) {
        $headers[] = 'Authorization: Bearer ' . $token;
    }

    $options = [
        'http' => [
            'method' => $method,
            'header' => implode("\r\n", $headers),
            'ignore_errors' => true,
            'timeout' => 10,
        ],
    ];

    if ($data !== null) {
        $options['http']['content'] = json_encode($data, JSON_UNESCAPED_UNICODE);
    }

    $context = stream_context_create($options);
    $response = @file_get_contents($url, false, $context);
    $status = 0;

    if (isset($http_response_header[0])) {
        if (preg_match('/\s(\d{3})\s/', $http_response_header[0], $matches)) {
            $status = (int)$matches[1];
        }
    }

    $json = null;
    if ($response !== false && $response !== '') {
        $json = json_decode($response, true);
    }

    return [
        'status' => $status,
        'body' => $response,
        'json' => $json,
    ];
}

function waitForHealth($baseUrl, $timeoutSeconds = 60) {
    $start = time();
    while ((time() - $start) < $timeoutSeconds) {
        $res = request('GET', rtrim($baseUrl, '/') . '/api/health');
        if ($res['status'] === 200 && isset($res['json']['success']) && $res['json']['success'] === true) {
            return true;
        }
        sleep(2);
    }
    return false;
}

function logLine($message) {
    echo $message . PHP_EOL;
}

logLine('Waiting for API health...');
if (!waitForHealth($baseUrl)) {
    logLine('API health check failed.');
    exit(1);
}
logLine('API is healthy.');
sleep(5);

$bookingId = null;
$finalPrice = null;
$seatPairFound = false;
$lastError = '';
$dbRetries = 0;
$maxDbRetries = 10;

for ($seat = 1; $seat <= 79; $seat += 2) {
    $payload = [
        'user_id' => 4,
        'showtime_id' => 1,
        'seat_ids' => [$seat, $seat + 1],
        'concessions' => [
            ['id' => 5, 'quantity' => 1],
        ],
    ];

    $res = request('POST', rtrim($baseUrl, '/') . '/api/bookings', $payload, $token);
    if (isset($res['json']['success']) && $res['json']['success'] === true) {
        $bookingId = $res['json']['data']['booking_id'] ?? null;
        $finalPrice = $res['json']['data']['final_price'] ?? null;
        $seatPairFound = true;
        logLine("Booking created with seats {$seat}-" . ($seat + 1) . ", booking_id={$bookingId}");
        break;
    }

    $lastError = $res['json']['message'] ?? 'Unknown error';
    if (str_contains($lastError, 'Database Connection Error')) {
        $dbRetries++;
        if ($dbRetries > $maxDbRetries) {
            break;
        }
        sleep(2);
        $seat -= 2;
        continue;
    }
    $normalizedError = function_exists('mb_strtolower')
        ? mb_strtolower($lastError, 'UTF-8')
        : strtolower($lastError);
    if (!str_contains($normalizedError, 'ghế') && !str_contains($normalizedError, 'seat')) {
        break;
    }
}

if (!$seatPairFound || !$bookingId) {
    logLine('Booking create failed: ' . $lastError);
    exit(1);
}

$cashRes = request(
    'POST',
    rtrim($baseUrl, '/') . '/api/transactions/cash',
    [
        'booking_id' => $bookingId,
    ],
    $token
);

if (!isset($cashRes['json']['success']) || $cashRes['json']['success'] !== true) {
    logLine('Cash payment failed: ' . ($cashRes['json']['message'] ?? 'Unknown error'));
    exit(1);
}
$transactionCode = $cashRes['json']['data']['transaction_code'] ?? null;
logLine("Payment completed: {$transactionCode}");

$bookingDetail = request('GET', rtrim($baseUrl, '/') . '/api/bookings/' . $bookingId, null, $token);
if (!isset($bookingDetail['json']['success']) || $bookingDetail['json']['success'] !== true) {
    logLine('Booking detail fetch failed: ' . ($bookingDetail['json']['message'] ?? 'Unknown error'));
    exit(1);
}
logLine('Booking detail OK.');

$historyRes = request('GET', rtrim($baseUrl, '/') . '/api/transactions/user/4?page=1&limit=5', null, $token);
if (!isset($historyRes['json']['success']) || $historyRes['json']['success'] !== true) {
    logLine('Transaction history fetch failed: ' . ($historyRes['json']['message'] ?? 'Unknown error'));
    exit(1);
}

logLine('Transaction history OK.');
logLine('API test completed successfully.');
