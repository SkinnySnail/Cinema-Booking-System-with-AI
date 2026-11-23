<?php
require_once __DIR__ . '/../config/Config.php';

/**
 * EmailService - Gửi email qua SMTP
 * Phụ trách: THỊNH
 * 
 * Hỗ trợ gửi email qua Gmail SMTP hoặc SMTP server khác
 * Không cần PHPMailer - sử dụng PHP native socket
 */
class EmailService {
    private $smtpHost;
    private $smtpPort;
    private $smtpUsername;
    private $smtpPassword;
    private $smtpEncryption;
    private $fromEmail;
    private $fromName;
    private $smtpEnabled;
    
    public function __construct() {
        $this->smtpHost = Config::$smtp_host;
        $this->smtpPort = Config::$smtp_port;
        $this->smtpUsername = Config::$smtp_username;
        $this->smtpPassword = Config::$smtp_password;
        $this->smtpEncryption = Config::$smtp_encryption;
        $this->fromEmail = Config::$smtp_from_email;
        $this->fromName = Config::$smtp_from_name;
        $this->smtpEnabled = Config::$smtp_enabled;
    }
    
    /**
     * Gửi mã xác minh email
     */
    public function sendVerificationCode($toEmail, $userName, $code) {
        $subject = 'Mã xác minh đăng ký tài khoản - Galaxy Cinema';
        
        $message = $this->getVerificationEmailTemplate($userName, $code);
        
        return $this->sendEmail($toEmail, $subject, $message);
    }
    
    /**
     * Template email xác minh
     */
    private function getVerificationEmailTemplate($userName, $code) {
        return "
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .code-box { background: white; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
        .code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>🎬 Galaxy Cinema</h1>
            <p>Xác Minh Tài Khoản</p>
        </div>
        <div class='content'>
            <h2>Xin chào {$userName}!</h2>
            <p>Cảm ơn bạn đã đăng ký tài khoản tại Galaxy Cinema. Để hoàn tất đăng ký, vui lòng sử dụng mã xác minh bên dưới:</p>
            
            <div class='code-box'>
                <p style='margin: 0; color: #666; font-size: 14px;'>MÃ XÁC MINH CỦA BẠN</p>
                <div class='code'>{$code}</div>
                <p style='margin: 10px 0 0 0; color: #666; font-size: 12px;'>Mã này có hiệu lực trong 5 phút</p>
            </div>
            
            <div class='warning'>
                <strong>⚠️ Lưu ý:</strong> Không chia sẻ mã này với bất kỳ ai. Galaxy Cinema sẽ không bao giờ yêu cầu mã xác minh qua điện thoại hoặc email.
            </div>
            
            <p>Nếu bạn không thực hiện đăng ký này, vui lòng bỏ qua email này.</p>
            
            <p style='margin-top: 30px;'>
                Trân trọng,<br>
                <strong>Đội ngũ Galaxy Cinema</strong>
            </p>
        </div>
        <div class='footer'>
            <p>© 2026 Galaxy Cinema. All rights reserved.</p>
            <p>Hotline: 1900 2224 | Email: support@galaxycinema.vn</p>
        </div>
    </div>
</body>
</html>
        ";
    }
    
    /**
     * Gửi email chung
     */
    private function sendEmail($to, $subject, $message) {
        // Nếu SMTP bị disabled hoặc chưa config, chỉ log
        if (!$this->smtpEnabled || empty($this->smtpUsername) || empty($this->smtpPassword)) {
            error_log("===== EMAIL LOG (SMTP DISABLED) =====");
            error_log("To: $to");
            error_log("Subject: $subject");
            error_log("Code: " . $this->extractCodeFromMessage($message));
            error_log("SMTP Enabled: " . ($this->smtpEnabled ? 'true' : 'false'));
            error_log("Username: " . ($this->smtpUsername ?: 'empty'));
            error_log("Password: " . (!empty($this->smtpPassword) ? 'set' : 'empty'));
            error_log("=====================================");
            return true;
        }
        
        try {
            error_log("===== ATTEMPTING SMTP EMAIL SEND =====");
            error_log("To: $to");
            error_log("SMTP Host: {$this->smtpHost}:{$this->smtpPort}");
            error_log("Username: {$this->smtpUsername}");
            
            $result = $this->sendViaSMTP($to, $subject, $message);
            
            if ($result) {
                error_log("✓ Email sent successfully!");
            }
            
            error_log("======================================");
            return $result;
            
        } catch (Exception $e) {
            error_log("✗ Email Send Error: " . $e->getMessage());
            error_log("======================================");
            return false;
        }
    }
    
    /**
     * Gửi email qua SMTP
     */
    private function sendViaSMTP($to, $subject, $htmlMessage) {
        error_log("Opening connection to {$this->smtpHost}:{$this->smtpPort}...");
        
        // Mở kết nối socket
        $socket = @fsockopen($this->smtpHost, $this->smtpPort, $errno, $errstr, 30);
        
        if (!$socket) {
            throw new Exception("Cannot connect to SMTP server: $errstr ($errno)");
        }
        
        error_log("Connected! Reading initial response...");
        
        // Đọc response từ server
        $response = $this->getResponse($socket);
        error_log("Server greeting: " . trim($response));
        
        // Gửi EHLO
        error_log("Sending EHLO...");
        fputs($socket, "EHLO " . $this->smtpHost . "\r\n");
        $response = $this->getResponse($socket);
        error_log("EHLO response: " . trim($response));
        
        // Start TLS nếu cần
        if ($this->smtpEncryption === 'tls') {
            error_log("Starting TLS...");
            fputs($socket, "STARTTLS\r\n");
            $response = $this->getResponse($socket);
            error_log("STARTTLS response: " . trim($response));
            
            // Tắt verify SSL (chỉ dùng cho môi trường dev localhost)
stream_context_set_option($socket, 'ssl', 'verify_peer', false);
stream_context_set_option($socket, 'ssl', 'verify_peer_name', false);
stream_context_set_option($socket, 'ssl', 'allow_self_signed', true);

if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
    fclose($socket);
    throw new Exception("TLS encryption failed");
}
            
            error_log("TLS enabled successfully");
        }
        
        // Xác thực
        error_log("Authenticating...");
        fputs($socket, "AUTH LOGIN\r\n");
        $response = $this->getResponse($socket);
        error_log("AUTH LOGIN response: " . trim($response));
        
        fputs($socket, base64_encode($this->smtpUsername) . "\r\n");
        $response = $this->getResponse($socket);
        error_log("Username response: " . trim($response));
        
        fputs($socket, base64_encode($this->smtpPassword) . "\r\n");
        $response = $this->getResponse($socket);
        error_log("Password response: " . trim($response));
        
        if (strpos($response, '235') === false) {
            fclose($socket);
            throw new Exception("SMTP Authentication failed. Response: " . trim($response));
        }
        
        error_log("Authentication successful!");
        
        // Gửi email
        error_log("Sending email...");
        fputs($socket, "MAIL FROM: <{$this->smtpUsername}>\r\n");
        $response = $this->getResponse($socket);
        error_log("MAIL FROM response: " . trim($response));
        
        fputs($socket, "RCPT TO: <{$to}>\r\n");
        $response = $this->getResponse($socket);
        error_log("RCPT TO response: " . trim($response));
        
        fputs($socket, "DATA\r\n");
        $response = $this->getResponse($socket);
        error_log("DATA response: " . trim($response));
        
        // Email headers và body
        $headers = "From: {$this->fromName} <{$this->smtpUsername}>\r\n";
        $headers .= "Reply-To: {$this->smtpUsername}\r\n";
        $headers .= "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        $headers .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
        $headers .= "To: {$to}\r\n";
        
        $emailContent = $headers . "\r\n" . $htmlMessage . "\r\n.\r\n";
        fputs($socket, $emailContent);
        $response = $this->getResponse($socket);
        error_log("Email content response: " . trim($response));
        
        // Đóng kết nối
        fputs($socket, "QUIT\r\n");
        $this->getResponse($socket);
        fclose($socket);
        
        error_log("Email sent successfully to: $to");
        return true;
    }
    
    /**
     * Đọc response từ SMTP server
     */
    private function getResponse($socket) {
        $response = '';
        while ($line = fgets($socket, 515)) {
            $response .= $line;
            if (substr($line, 3, 1) == ' ') {
                break;
            }
        }
        return $response;
    }
    
    /**
     * Extract code from message for logging
     */
    private function extractCodeFromMessage($message) {
        preg_match("/<div class='code'>(\d+)<\/div>/", $message, $matches);
        return $matches[1] ?? 'N/A';
    }
    
    /**
     * Gửi email chào mừng sau khi đăng ký thành công
     */
    public function sendWelcomeEmail($toEmail, $userName) {
        $subject = 'Chào mừng đến với Galaxy Cinema!';
        
        $message = "
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .benefits { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .benefit-item { display: flex; align-items: center; margin: 15px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>🎬 Welcome to Galaxy Cinema</h1>
        </div>
        <div class='content'>
            <h2>Xin chào {$userName}!</h2>
            <p>Chúc mừng bạn đã trở thành thành viên của Galaxy Cinema. Bạn đã sẵn sàng để khám phá thế giới điện ảnh rồi!</p>
            
            <div class='benefits'>
                <h3>Quyền lợi thành viên:</h3>
                <div class='benefit-item'>✓ Đặt vé online nhanh chóng, tiện lợi</div>
                <div class='benefit-item'>✓ Tích điểm và đổi quà hấp dẫn</div>
                <div class='benefit-item'>✓ Nhận thông báo về phim mới, ưu đãi đặc biệt</div>
                <div class='benefit-item'>✓ Nâng hạng thành viên Silver, Gold, Platinum</div>
            </div>
            
            <p>Hãy đăng nhập và bắt đầu trải nghiệm ngay hôm nay!</p>
            
            <p style='margin-top: 30px;'>
                Trân trọng,<br>
                <strong>Đội ngũ Galaxy Cinema</strong>
            </p>
        </div>
        <div class='footer'>
            <p>© 2026 Galaxy Cinema. All rights reserved.</p>
            <p>Hotline: 1900 2224 | Email: support@galaxycinema.vn</p>
        </div>
    </div>
</body>
</html>
        ";
        
        return $this->sendEmail($toEmail, $subject, $message);
    }
    
    /**
     * Gửi email thông báo đổi mật khẩu thành công
     */
    public function sendPasswordChangedNotification($toEmail, $userName) {
        $subject = 'Mật khẩu của bạn đã được thay đổi - Galaxy Cinema';
        
        $message = "
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .warning-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 20px 0; border-radius: 4px; }
        .info-box { background: #d1ecf1; border-left: 4px solid #0c5460; padding: 20px; margin: 20px 0; border-radius: 4px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .security-icon { font-size: 48px; text-align: center; margin: 20px 0; }
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>🎬 Galaxy Cinema</h1>
            <p>Thông Báo Bảo Mật</p>
        </div>
        <div class='content'>
            <div class='security-icon'>🔒</div>
            
            <h2>Xin chào {$userName}!</h2>
            <p>Chúng tôi xác nhận rằng mật khẩu tài khoản của bạn đã được <strong>thay đổi thành công</strong> vào lúc <strong>" . date('H:i:s d/m/Y') . "</strong>.</p>
            
            <div class='info-box'>
                <strong>✓ Mật khẩu mới đã được cập nhật</strong><br>
                Bạn có thể sử dụng mật khẩu mới để đăng nhập vào tài khoản ngay bây giờ.
            </div>
            
            <div class='warning-box'>
                <strong>⚠️ Bạn không phải người thực hiện thay đổi này?</strong><br><br>
                Nếu bạn không thực hiện thay đổi mật khẩu này, vui lòng liên hệ ngay với chúng tôi để bảo vệ tài khoản của bạn:
                <br><br>
                <strong>📞 Hotline:</strong> 1900 2224<br>
                <strong>✉️ Email:</strong> support@galaxycinema.vn<br>
                <strong>🕐 Thời gian hỗ trợ:</strong> 8:00 - 22:00 hàng ngày
            </div>
            
            <h3>💡 Lời khuyên bảo mật:</h3>
            <ul style='line-height: 1.8;'>
                <li>Không chia sẻ mật khẩu với bất kỳ ai</li>
                <li>Sử dụng mật khẩu mạnh (ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt)</li>
                <li>Thay đổi mật khẩu định kỳ (3-6 tháng/lần)</li>
                <li>Không sử dụng cùng một mật khẩu cho nhiều tài khoản</li>
                <li>Đăng xuất sau khi sử dụng trên thiết bị công cộng</li>
            </ul>
            
            <p style='margin-top: 30px;'>
                Cảm ơn bạn đã tin tưởng Galaxy Cinema!<br>
                <strong>Đội ngũ Galaxy Cinema</strong>
            </p>
        </div>
        <div class='footer'>
            <p>© 2026 Galaxy Cinema. All rights reserved.</p>
            <p>Hotline: 1900 2224 | Email: support@galaxycinema.vn</p>
            <p style='margin-top: 10px; color: #999; font-size: 11px;'>
                Email này được gửi tự động. Vui lòng không trả lời email này.
            </p>
        </div>
    </div>
</body>
</html>
        ";
        
        return $this->sendEmail($toEmail, $subject, $message);
    }
    
    /**
     * Gửi vé điện tử sau khi đơn được thanh toán.
     * $details là kết quả Booking::getDetails(): booking_code, movie_title, start_time,
     * cinema_name, hall_name, final_price, customer_name, customer_email, tickets[], concessions[].
     * Mã đơn dùng để soát vé (nhân viên quét QR trong mục Lịch sử đặt vé hoặc nhập tay mã đơn).
     */
    public function sendTicketEmail(array $details) {
        $to = trim((string) ($details['customer_email'] ?? ''));
        if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
            return false;
        }

        $e = function ($value) {
            return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
        };
        $code = $e($details['booking_code'] ?? '');
        $start = !empty($details['start_time']) ? date('H:i - d/m/Y', strtotime($details['start_time'])) : '';
        $seats = [];
        $ticketRows = '';
        foreach ($details['tickets'] ?? [] as $ticket) {
            $seat = ($ticket['row_code'] ?? '') . ($ticket['number'] ?? '');
            $seats[] = $seat;
            $ticketRows .= '<tr><td style="padding:6px 0;border-bottom:1px dashed #ddd;">' . $e($seat)
                . '</td><td style="padding:6px 0;border-bottom:1px dashed #ddd;font-family:monospace;">'
                . $e($ticket['ticket_code'] ?? '') . '</td></tr>';
        }
        $concessions = '';
        foreach ($details['concessions'] ?? [] as $item) {
            $concessions .= '<li>' . $e(($item['quantity'] ?? 1) . ' × ' . ($item['name'] ?? $item['concession_name'] ?? '')) . '</li>';
        }
        $frontendUrl = rtrim(getenv('FRONTEND_URL') ?: 'http://localhost:8080', '/');

        $subject = 'Vé xem phim ' . ($details['movie_title'] ?? '') . ' - Mã đơn ' . ($details['booking_code'] ?? '');
        $message = "
<!DOCTYPE html>
<html>
<head><meta charset='UTF-8'></head>
<body style='font-family:Arial,sans-serif;color:#333;line-height:1.5;'>
  <div style='max-width:600px;margin:0 auto;padding:20px;'>
    <div style='background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);color:#fff;padding:24px;border-radius:10px 10px 0 0;text-align:center;'>
      <h2 style='margin:0;'>Galaxy Cinema - Vé điện tử</h2>
    </div>
    <div style='background:#f9f9f9;padding:24px;border-radius:0 0 10px 10px;'>
      <p>Xin chào <strong>" . $e($details['customer_name'] ?? 'Quý khách') . "</strong>, đơn đặt vé của bạn đã được thanh toán.</p>
      <div style='text-align:center;background:#fff;border:2px dashed #f97316;border-radius:10px;padding:16px;margin:16px 0;'>
        <div style='font-size:13px;color:#666;'>Mã đơn (xuất trình tại cổng soát vé)</div>
        <div style='font-size:28px;font-weight:bold;letter-spacing:2px;font-family:monospace;'>{$code}</div>
      </div>
      <table style='width:100%;font-size:14px;'>
        <tr><td style='color:#666;width:35%;'>Phim</td><td><strong>" . $e($details['movie_title'] ?? '') . "</strong></td></tr>
        <tr><td style='color:#666;'>Suất chiếu</td><td>" . $e($start) . "</td></tr>
        <tr><td style='color:#666;'>Rạp / Phòng</td><td>" . $e(($details['cinema_name'] ?? '') . ' - ' . ($details['hall_name'] ?? '')) . "</td></tr>
        <tr><td style='color:#666;'>Ghế</td><td>" . $e(implode(', ', $seats)) . "</td></tr>
        <tr><td style='color:#666;'>Tổng thanh toán</td><td><strong>" . number_format((float) ($details['final_price'] ?? 0), 0, ',', '.') . " đ</strong></td></tr>
      </table>
      " . ($concessions !== '' ? "<p style='margin-bottom:4px;'>Bắp nước:</p><ul style='margin-top:0;'>{$concessions}</ul>" : '') . "
      <table style='width:100%;font-size:13px;margin-top:12px;'><tr><th align='left'>Ghế</th><th align='left'>Mã vé</th></tr>{$ticketRows}</table>
      <p style='margin-top:20px;'>Mở <a href='{$frontendUrl}/bookings'>Lịch sử đặt vé</a> để xem mã QR. Cổng mở từ 30 phút trước giờ chiếu.</p>
    </div>
    <p style='text-align:center;color:#999;font-size:12px;'>Email tự động từ Galaxy Cinema, vui lòng không trả lời.</p>
  </div>
</body>
</html>";

        return $this->sendEmail($to, $subject, $message);
    }

    /**
     * Gửi mã reset password qua email
     */
    public function sendPasswordResetCode($toEmail, $code, $userName) {
        $subject = 'Mã xác nhận đặt lại mật khẩu - Galaxy Cinema';
        
        $message = $this->getPasswordResetEmailTemplate($userName, $code);
        
        return $this->sendEmail($toEmail, $subject, $message);
    }
    
    /**
     * Template email reset password
     */
    private function getPasswordResetEmailTemplate($userName, $code) {
        return "
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <style>
        body { font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #FF6B35 0%, #F7931E 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; }
        .header p { margin: 10px 0 0 0; opacity: 0.95; }
        .content { padding: 40px 30px; }
        .code-box { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 10px; text-align: center; margin: 25px 0; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3); }
        .code { font-size: 36px; font-weight: bold; letter-spacing: 8px; margin: 10px 0; text-shadow: 2px 2px 4px rgba(0,0,0,0.2); }
        .warning-box { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .footer { background-color: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 13px; }
        ul { padding-left: 20px; line-height: 1.8; }
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>🔒 ĐẶT LẠI MẬT KHẨU</h1>
            <p>Galaxy Cinema</p>
        </div>
        <div class='content'>
            <p>Xin chào <strong>{$userName}</strong>,</p>
            
            <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn tại Galaxy Cinema.</p>
            
            <div class='code-box'>
                <p style='margin: 0; font-size: 14px; opacity: 0.9;'>MÃ XÁC NHẬN CỦA BẠN</p>
                <div class='code'>{$code}</div>
                <p style='margin: 10px 0 0 0; font-size: 13px; opacity: 0.9;'>⏰ Mã có hiệu lực trong <strong>15 phút</strong></p>
            </div>
            
            <h3>📋 Hướng dẫn đặt lại mật khẩu:</h3>
            <ol style='line-height: 1.8;'>
                <li>Nhập mã xác nhận <strong>{$code}</strong> vào trang đặt lại mật khẩu</li>
                <li>Nhập mật khẩu mới của bạn (ít nhất 6 ký tự)</li>
                <li>Xác nhận và hoàn tất</li>
            </ol>
            
            <div class='warning-box'>
                <strong>⚠️ Bạn không yêu cầu đặt lại mật khẩu?</strong><br><br>
                Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này. Mật khẩu của bạn sẽ không thay đổi.<br>
                Để bảo vệ tài khoản, vui lòng liên hệ với chúng tôi ngay:
                <br><br>
                <strong>📞 Hotline:</strong> 1900 2224<br>
                <strong>✉️ Email:</strong> support@galaxycinema.vn<br>
                <strong>🕐 Thời gian hỗ trợ:</strong> 8:00 - 22:00 hàng ngày
            </div>
            
            <h3>💡 Lời khuyên bảo mật:</h3>
            <ul style='line-height: 1.8;'>
                <li>Không chia sẻ mã xác nhận với bất kỳ ai</li>
                <li>Sử dụng mật khẩu mạnh và khác biệt</li>
                <li>Bật xác thực 2 bước nếu có thể</li>
                <li>Thay đổi mật khẩu định kỳ</li>
            </ul>
            
            <p style='margin-top: 30px;'>
                Cảm ơn bạn đã tin tưởng Galaxy Cinema!<br>
                <strong>Đội ngũ Galaxy Cinema</strong>
            </p>
        </div>
        <div class='footer'>
            <p>© 2026 Galaxy Cinema. All rights reserved.</p>
            <p>Hotline: 1900 2224 | Email: support@galaxycinema.vn</p>
            <p style='margin-top: 10px; color: #999; font-size: 11px;'>
                Email này được gửi tự động. Vui lòng không trả lời email này.
            </p>
        </div>
    </div>
</body>
</html>
        ";
    }
}
