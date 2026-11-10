# 📧 Hướng Dẫn Setup Gmail SMTP Để Gửi Email Xác Nhận

## 🎯 Tổng Quan

Hệ thống đã được cấu hình để gửi email xác nhận thật qua Gmail SMTP. Bạn cần:
1. Tạo **App Password** từ Google Account
2. Cập nhật cấu hình trong file `Config.php`

---

## ⚙️ Bước 1: Bật Xác Thực 2 Bước (2FA)

App Password chỉ hoạt động khi tài khoản Gmail đã bật xác thực 2 bước.

1. Truy cập: https://myaccount.google.com/security
2. Tìm mục **"2-Step Verification"** (Xác minh 2 bước)
3. Nhấn **"Get Started"** và làm theo hướng dẫn
4. Xác thực với số điện thoại của bạn

---

## 🔑 Bước 2: Tạo App Password

1. Sau khi bật 2FA, truy cập: https://myaccount.google.com/apppasswords
   
   **Hoặc:**
   - Vào https://myaccount.google.com/security
   - Tìm mục **"App passwords"**
   - Nhấn vào để truy cập

2. Đăng nhập lại nếu được yêu cầu

3. Tại trang **App passwords**:
   - **App name**: Nhập tên ứng dụng (ví dụ: "Cinema Booking System")
   - Nhấn **"Create"**

4. Google sẽ tạo mật khẩu **16 ký tự** (dạng: `xxxx xxxx xxxx xxxx`)

5. **⚠️ QUAN TRỌNG**: 
   - Copy mật khẩu này ngay (chỉ hiển thị 1 lần)
   - Bỏ khoảng trắng khi copy (hoặc giữ nguyên, code sẽ xử lý)

---

## 📝 Bước 3: Cấu Hình File Config.php

Mở file: `backend/config/Config.php`

Tìm phần cấu hình SMTP và điền thông tin:

```php
// SMTP Email Settings (Gmail)
public static $smtp_enabled = true; // Bật SMTP
public static $smtp_host = 'smtp.gmail.com';
public static $smtp_port = 587;
public static $smtp_encryption = 'tls';
public static $smtp_username = 'youremail@gmail.com'; // ← Thay bằng email của bạn
public static $smtp_password = 'xxxx xxxx xxxx xxxx'; // ← Thay bằng App Password
public static $smtp_from_email = 'noreply@galaxycinema.vn';
public static $smtp_from_name = 'Galaxy Cinema';
```

### 📋 Chi tiết cấu hình:

| Tham số | Giá trị | Mô tả |
|---------|---------|-------|
| `smtp_enabled` | `true` | Bật/tắt chức năng gửi email thật |
| `smtp_host` | `smtp.gmail.com` | SMTP server của Gmail |
| `smtp_port` | `587` | Port cho TLS (hoặc 465 cho SSL) |
| `smtp_encryption` | `tls` | Loại mã hóa (tls hoặc ssl) |
| `smtp_username` | Email của bạn | Gmail account để gửi email |
| `smtp_password` | App Password | Mật khẩu 16 ký tự từ bước 2 |
| `smtp_from_email` | Tùy chỉnh | Email hiển thị (có thể khác) |
| `smtp_from_name` | `Galaxy Cinema` | Tên người gửi |

---

## ✅ Bước 4: Test Gửi Email

1. **Khởi động backend server:**
   ```powershell
   cd backend
   php -S localhost:8000
   ```

2. **Test đăng ký tài khoản:**
   - Mở frontend: http://localhost:5173/register
   - Điền thông tin đăng ký với **email thật của bạn**
   - Nhấn "Gửi mã xác nhận"

3. **Kiểm tra inbox Gmail:**
   - Mở Gmail của bạn
   - Tìm email từ "Galaxy Cinema"
   - Copy mã xác nhận 6 số
   - Nhập vào trang đăng ký

4. **Nếu không thấy email:**
   - Kiểm tra thư mục **Spam/Junk**
   - Kiểm tra log backend có lỗi gì không

---

## 🔧 Troubleshooting (Xử Lý Lỗi)

### ❌ Lỗi: "SMTP Authentication failed"

**Nguyên nhân:**
- App Password không đúng
- Chưa bật 2FA
- Copy sai mật khẩu

**Giải pháp:**
1. Kiểm tra lại username và password trong Config.php
2. Đảm bảo đã bật 2FA
3. Tạo lại App Password mới

---

### ❌ Lỗi: "Cannot connect to SMTP server"

**Nguyên nhân:**
- Firewall chặn port 587
- Internet không kết nối
- Sai host hoặc port

**Giải pháp:**
1. Kiểm tra kết nối internet
2. Thử đổi port từ 587 → 465 và encryption từ tls → ssl:
   ```php
   public static $smtp_port = 465;
   public static $smtp_encryption = 'ssl';
   ```

---

### ❌ Email đi vào Spam

**Giải pháp:**
- Đánh dấu "Not Spam" trong Gmail
- Thêm `noreply@galaxycinema.vn` vào danh bạ
- Trong production, nên dùng domain thật và cấu hình SPF/DKIM

---

## 🚫 Tắt Chức Năng Gửi Email Thật

Nếu muốn quay lại chế độ test (chỉ log email):

```php
public static $smtp_enabled = false; // ← Đổi thành false
```

Email sẽ không được gửi thật, chỉ hiện trong PHP log.

---

## 📌 Lưu Ý Quan Trọng

### ⚠️ Bảo mật:
- **KHÔNG** commit file Config.php với password thật lên Git
- Nên dùng file `.env` cho production
- App Password chỉ dùng cho app này, không chia sẻ

### 📊 Giới hạn Gmail SMTP:
- **500 emails/ngày** cho Gmail thường
- **2000 emails/ngày** cho Google Workspace
- Nếu vượt quá → Tài khoản bị khóa tạm thời 24h

### 🎯 Khuyến nghị Production:
Đối với hệ thống thật, nên dùng:
- **SendGrid** (100 emails/day miễn phí)
- **Mailgun** (5000 emails/month miễn phí)
- **Mailjet**, **Postmark**, etc.

---

## ✨ Hoàn Thành!

Giờ hệ thống đã có thể gửi email xác nhận thật đến Gmail của người dùng! 🎉

**Luồng hoạt động:**
1. User đăng ký tài khoản
2. Backend gửi mã 6 số qua Gmail SMTP
3. User nhận email trong inbox
4. User nhập mã xác nhận
5. Tài khoản được tạo thành công

---

## 📞 Hỗ Trợ

Nếu gặp vấn đề:
1. Kiểm tra log PHP server
2. Kiểm tra lại từng bước setup
3. Thử tạo lại App Password mới

**Happy Coding! 🚀**
