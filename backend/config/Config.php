<?php

/**
 * Application Configuration
 */
class Config
{
    // JWT Settings — secret đọc từ JWT_SECRET (xem loadJwtSecret)
    public static $jwt_secret = '';
    public static $jwt_expiration = 86400; // 24 hours in seconds

    // Giá trị mẫu cũ đã bị công khai trong lịch sử Git: không bao giờ được dùng làm khóa ký.
    private const PUBLIC_JWT_PLACEHOLDER = 'galaxy_cinema_secret_key_2026_change_this_in_production';

    // App Settings
    public static $app_name = 'Galaxy Cinema';
    public static $app_version = '1.0.0';
    public static $timezone = 'Asia/Ho_Chi_Minh';

    // Pagination
    public static $items_per_page = 20;

    // Upload Settings
    public static $upload_path = __DIR__ . '/../uploads/';
    public static $allowed_image_types = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    public static $max_file_size = 5242880; // 5MB in bytes

    // Booking Settings
    public static $seat_hold_duration = 300; // 5 minutes in seconds
    public static $showtime_cleanup_minutes = 15; // phút dọn phòng giữa 2 suất
    public static $min_vietnamese_quota = 15; // 15% minimum Vietnamese movies

    // Loyalty Settings
    public static $points_per_vnd = 10000; // 10,000 VND = 1 point

    // Curfew Settings
    public static $curfew_u13 = '22:00:00';
    public static $curfew_u16 = '23:00:00';

    // API Rate Limiting
    public static $rate_limit_requests = 100;
    public static $rate_limit_window = 60; // seconds

    // SMTP Email Settings (Gmail) — tài khoản và App Password lấy từ SMTP_USERNAME / SMTP_PASSWORD.
    // Thiếu thông tin đăng nhập thì EmailService chỉ ghi log, không gửi mail.
    public static $smtp_enabled = true; // SMTP_ENABLED=false để tắt hẳn
    public static $smtp_host = 'smtp.gmail.com';
    public static $smtp_port = 587; // 587 for TLS, 465 for SSL
    public static $smtp_encryption = 'tls'; // 'tls' hoặc 'ssl'
    public static $smtp_username = '';
    public static $smtp_password = '';
    public static $smtp_from_email = 'noreply@galaxycinema.vn';
    public static $smtp_from_name = 'Galaxy Cinema';
    
    // REDIS Settings
    public static $redis_host = 'localhost';
    public static $redis_port = 6379;

    // Payment Gateway Settings — khóa lấy từ biến môi trường (MOMO_*, VNP_*).
    // Thiếu khóa thì PaymentService báo "Missing payment config" thay vì dùng khóa mặc định.
    public static $momo_partner_code = '';
    public static $momo_access_key = '';
    public static $momo_secret_key = '';

    public static $vnpay_tmncode = '';
    public static $vnpay_hash_secret = '';
    public static $vnpay_url = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
    // Optional: default return and IPN URLs (can be overridden by .env)
    public static $vnpay_return_url = '';
    public static $vnpay_notify_url = '';


    public static function init()
    {
        date_default_timezone_set(self::$timezone);

        // Create upload directory if not exists
        if (!file_exists(self::$upload_path)) {
            mkdir(self::$upload_path, 0777, true);
        }

        // Load SMTP config from environment if available
        if (getenv('SMTP_ENABLED') !== false) {
            self::$smtp_enabled = filter_var(getenv('SMTP_ENABLED'), FILTER_VALIDATE_BOOLEAN);
        }
        if (getenv('SMTP_HOST')) {
            self::$smtp_host = getenv('SMTP_HOST');
        }
        if (getenv('SMTP_PORT')) {
            self::$smtp_port = (int)getenv('SMTP_PORT');
        }
        if (getenv('SMTP_ENCRYPTION')) {
            self::$smtp_encryption = getenv('SMTP_ENCRYPTION');
        }
        if (getenv('SMTP_USERNAME')) {
            self::$smtp_username = getenv('SMTP_USERNAME');
        }
        if (getenv('SMTP_PASSWORD')) {
            self::$smtp_password = getenv('SMTP_PASSWORD');
        }
        if (getenv('SMTP_FROM_EMAIL')) {
            self::$smtp_from_email = getenv('SMTP_FROM_EMAIL');
        }
        if (getenv('SMTP_FROM_NAME')) {
            self::$smtp_from_name = getenv('SMTP_FROM_NAME');
        }

        // Load payment gateway config from environment if available
        if (getenv('MOMO_PARTNER_CODE')) {
            self::$momo_partner_code = getenv('MOMO_PARTNER_CODE');
        }
        if (getenv('MOMO_ACCESS_KEY')) {
            self::$momo_access_key = getenv('MOMO_ACCESS_KEY');
        }
        if (getenv('MOMO_SECRET_KEY')) {
            self::$momo_secret_key = getenv('MOMO_SECRET_KEY');
        }
        if (getenv('VNP_TMNCODE')) {
            self::$vnpay_tmncode = getenv('VNP_TMNCODE');
        }
        if (getenv('VNP_HASH_SECRET')) {
            self::$vnpay_hash_secret = getenv('VNP_HASH_SECRET');
        }
        if (getenv('VNP_URL')) {
            self::$vnpay_url = getenv('VNP_URL');
        }
        if (getenv('VNPAY_RETURN_URL')) {
            self::$vnpay_return_url = getenv('VNPAY_RETURN_URL');
        }
        if (getenv('VNPAY_NOTIFY_URL')) {
            self::$vnpay_notify_url = getenv('VNPAY_NOTIFY_URL');
        }
        
        // Define payment gateway constants for PaymentService.
        // Bỏ qua giá trị rỗng để PaymentService báo thiếu cấu hình thay vì ký bằng khóa rỗng.
        $paymentConstants = [
            'MOMO_PARTNER_CODE' => self::$momo_partner_code,
            'MOMO_ACCESS_KEY' => self::$momo_access_key,
            'MOMO_SECRET_KEY' => self::$momo_secret_key,
            'VNP_TMNCODE' => self::$vnpay_tmncode,
            'VNP_HASH_SECRET' => self::$vnpay_hash_secret,
            'VNP_URL' => self::$vnpay_url,
            'VNPAY_RETURN_URL' => self::$vnpay_return_url,
            'VNPAY_NOTIFY_URL' => self::$vnpay_notify_url,
        ];
        foreach ($paymentConstants as $name => $value) {
            if (!defined($name) && $value !== '') {
                define($name, $value);
            }
        }

        if (getenv('JWT_EXPIRATION') && (int)getenv('JWT_EXPIRATION') > 0) {
            self::$jwt_expiration = (int)getenv('JWT_EXPIRATION');
        }
        self::$jwt_secret = self::loadJwtSecret();
    }

    /**
     * Khóa ký JWT: ưu tiên JWT_SECRET. Nếu chưa cấu hình (hoặc vẫn là giá trị mẫu đã công khai),
     * tự sinh một khóa ngẫu nhiên và lưu vào backend/.jwt_secret (đã gitignore) để dùng ổn định
     * giữa các request trên máy phát triển. Production nên đặt JWT_SECRET trong backend/.env.
     */
    private static function loadJwtSecret()
    {
        $secret = trim((string)getenv('JWT_SECRET'));
        if (strlen($secret) >= 32 && !hash_equals(self::PUBLIC_JWT_PLACEHOLDER, $secret)) {
            return $secret;
        }
        if ($secret !== '') {
            error_log('JWT_SECRET is too short or is the published placeholder; using a generated local secret instead.');
        }

        $path = __DIR__ . '/../.jwt_secret';
        if (is_readable($path)) {
            $stored = trim((string)file_get_contents($path));
            if (strlen($stored) >= 32) {
                return $stored;
            }
        }

        $generated = bin2hex(random_bytes(32));
        $handle = @fopen($path, 'x');
        if ($handle !== false) {
            fwrite($handle, $generated);
            fclose($handle);
            @chmod($path, 0600);
            return $generated;
        }

        // Another request created the file first: use its value so all requests share one key.
        $stored = is_readable($path) ? trim((string)file_get_contents($path)) : '';
        if (strlen($stored) >= 32) {
            return $stored;
        }

        throw new RuntimeException('JWT_SECRET is not configured and backend/.jwt_secret cannot be written.');
    }
}

Config::init();
