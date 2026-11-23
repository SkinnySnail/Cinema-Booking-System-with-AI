<?php
/**
 * Payment Service
 */

class PaymentService
{
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
