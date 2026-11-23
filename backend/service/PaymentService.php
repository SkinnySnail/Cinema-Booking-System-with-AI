<?php
/**
 * Payment Service
 */

class PaymentService
{
    public static function createMoMoPayment($amount, $orderId, $orderInfo, $returnUrl, $notifyUrl)
    {
        $endpoint = 'https://test-payment.momo.vn/v2/gateway/api/create';

        $partnerCode = self::requiredConfig('MOMO_PARTNER_CODE');
        $accessKey   = self::requiredConfig('MOMO_ACCESS_KEY');
        $secretKey   = self::requiredConfig('MOMO_SECRET_KEY');

        $requestId = uniqid();
        // captureWallet returns qrCodeUrl for QR-based flow.
        $requestType = 'captureWallet';
        $extraData = '';

        $raw = "accessKey=$accessKey"
            . "&amount=$amount"
            . "&extraData=$extraData"
            . "&ipnUrl=$notifyUrl"
            . "&orderId=$orderId"
            . "&orderInfo=$orderInfo"
            . "&partnerCode=$partnerCode"
            . "&redirectUrl=$returnUrl"
            . "&requestId=$requestId"
            . "&requestType=$requestType";

        $signature = hash_hmac('sha256', $raw, $secretKey);

        $payload = [
            'partnerCode' => $partnerCode,
            'accessKey'   => $accessKey,
            'requestId'   => $requestId,
            'amount'      => $amount,
            'orderId'     => $orderId,
            'orderInfo'   => $orderInfo,
            'redirectUrl' => $returnUrl,
            'ipnUrl'      => $notifyUrl,
            'requestType' => $requestType,
            'extraData'   => $extraData,
            'signature'   => $signature
        ];

        $response = self::postJson($endpoint, $payload);
        if (!is_array($response)) {
            throw new Exception('MoMo response is invalid', 502);
        }
        if (!empty($response['qrCodeUrl']) || !empty($response['payUrl'])) {
            return [
                'pay_url' => $response['payUrl'] ?? null,
                'qr_code_url' => $response['qrCodeUrl'] ?? null,
            ];
        }

        $message = $response['message'] ?? 'MoMo did not return payment url';
        throw new Exception('MoMo error: ' . $message, 502);
    }

    private static function postJson($url, $data)
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS     => json_encode($data)
        ]);

        $result = curl_exec($ch);
        if ($result === false) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new Exception('Payment gateway request failed: ' . $error, 502);
        }
        curl_close($ch);

        return json_decode($result, true);
    }
    public static function createVNPayPayment($amount, $orderId, $orderInfo, $returnUrl, $notifyUrl = null, $bankCode = null)
    {
        $tmnCode = self::requiredConfig('VNP_TMNCODE');
        $hashSecret = self::requiredConfig('VNP_HASH_SECRET');
        $vnpUrl = self::requiredConfig('VNP_URL');

        $timeZone = new DateTimeZone('Asia/Ho_Chi_Minh');
        $now = new DateTime('now', $timeZone);
        $expire = new DateTime('+15 minutes', $timeZone);

        $params = [
            'vnp_Version'   => '2.1.0',
            'vnp_Command'   => 'pay',
            'vnp_TmnCode'   => $tmnCode,
            'vnp_Amount'    => (string) intval(round($amount * 100)),
            'vnp_CurrCode'  => 'VND',
            'vnp_TxnRef'    => $orderId,
            'vnp_OrderInfo' => $orderInfo,
            'vnp_OrderType' => 'billpayment',
            'vnp_Locale'    => 'vn',
            'vnp_ReturnUrl' => $returnUrl,
            'vnp_IpAddr'    => self::getClientIp(),
            'vnp_CreateDate'=> $now->format('YmdHis'),
            'vnp_ExpireDate'=> $expire->format('YmdHis')
        ];

        if (!empty($bankCode)) {
            $params['vnp_BankCode'] = $bankCode;
        }

        // Sort params and build hash and query strings according to VNPay v2.1.0 standard
        ksort($params);

        $hashDataArr = [];
        $queryArr = [];
        foreach ($params as $key => $value) {
            if ($value === null || $value === '') {
                continue;
            }
            $encodedKey   = urlencode($key);
            $encodedValue = urlencode($value);
            $hashDataArr[] = $encodedKey . '=' . $encodedValue;
            $queryArr[]    = $encodedKey . '=' . $encodedValue;
        }

        $hashData = implode('&', $hashDataArr);
        $query = implode('&', $queryArr);

        $secureHash = hash_hmac('sha512', $hashData, $hashSecret);

        return $vnpUrl . '?' . $query . '&vnp_SecureHash=' . $secureHash;
    }

    private static function getClientIp()
    {
        $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        if (strpos($ip, ',') !== false) {
            $ip = trim(explode(',', $ip)[0]);
        }
        if (strpos($ip, ':') !== false || $ip === '127.0.0.1' || !filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            $ip = '171.249.85.126'; // Valid public IP format for VNPay Sandbox
        }
        return $ip;
    }

    private static function requiredConfig($key)
    {
        $value = getenv($key);
        if ($value !== false && $value !== '') {
            return trim($value);
        }

        if (isset($_ENV[$key]) && $_ENV[$key] !== '') {
            return trim($_ENV[$key]);
        }

        if (defined($key)) {
            return constant($key);
        }

        throw new Exception('Missing payment config: ' . $key, 500);
    }

    public static function verifyMomoPayment($data) {
        $secretKey = self::requiredConfig('MOMO_SECRET_KEY');
        $accessKey = self::requiredConfig('MOMO_ACCESS_KEY');
        $requiredFields = [
            'amount', 'message', 'orderId', 'orderInfo',
            'orderType', 'partnerCode', 'requestId', 'responseTime',
            'resultCode', 'transId', 'signature'
        ];

        foreach ($requiredFields as $field) {
            if (!array_key_exists($field, $data)) {
                error_log('MoMo verify missing field: ' . $field);
                return false;
            }
        }

        // MoMo IPN signature must include accessKey and payType when payType exists in payload.
        $raw = "accessKey=" . $accessKey
            . "&amount=" . $data['amount']
            . "&extraData=" . ($data['extraData'] ?? "")
            . "&message=" . $data['message']
            . "&orderId=" . $data['orderId']
            . "&orderInfo=" . $data['orderInfo']
            . "&orderType=" . $data['orderType']
            . "&partnerCode=" . $data['partnerCode']
            . "&payType=" . ($data['payType'] ?? "")
            . "&requestId=" . $data['requestId']
            . "&responseTime=" . $data['responseTime']
            . "&resultCode=" . $data['resultCode']
            . "&transId=" . $data['transId'];

        $signature = hash_hmac('sha256', $raw, $secretKey);
        $isValid = hash_equals($signature, (string)$data['signature']);
        if (!$isValid) {
            error_log('MoMo signature verification failed for orderId=' . (string)($data['orderId'] ?? ''));
        }

        return $isValid;
    }

    public static function verifyVNPayPayment($data) {
        $hashSecret = self::requiredConfig('VNP_HASH_SECRET');
        $secureHash = $data['vnp_SecureHash'] ?? null;

        if (empty($secureHash)) {
            error_log('VNPay: missing vnp_SecureHash');
            return false;
        }

        $params = $data;
        unset($params['vnp_SecureHash'], $params['vnp_SecureHashType']);
        ksort($params);

        $hashDataArr1 = [];
        $hashDataArr2 = [];
        foreach ($params as $key => $value) {
            if ($value === null || $value === '') {
                continue;
            }
            $hashDataArr1[] = urlencode($key) . '=' . urlencode($value);
            $hashDataArr2[] = rawurlencode($key) . '=' . rawurlencode($value);
        }

        $hashData1 = implode('&', $hashDataArr1);
        $calc1 = hash_hmac('sha512', $hashData1, $hashSecret);

        $hashData2 = implode('&', $hashDataArr2);
        $calc2 = hash_hmac('sha512', $hashData2, $hashSecret);

        $isValid = hash_equals(strtolower($calc1), strtolower($secureHash)) ||
                   hash_equals(strtolower($calc2), strtolower($secureHash));

        if (!$isValid) {
            // Không ghi chữ ký tự tính vào log: nó đủ để giả mạo đúng thông điệp này.
            error_log('VNPay signature verification failed for vnp_TxnRef=' . (string) ($data['vnp_TxnRef'] ?? ''));
        }

        return $isValid;
    }

}
