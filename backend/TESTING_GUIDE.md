# 📧 HƯỚNG DẪN TEST CHỨC NĂNG ĐĂNG KÝ VỚI XÁC MINH EMAIL

## 🎯 Tính năng đã thực hiện:

### Backend (PHP):
- ✅ **AuthController.php** - Xử lý authentication
  - `POST /api/auth/send-verification` - Gửi mã xác minh
  - `POST /api/auth/verify-email` - Xác minh mã và tạo tài khoản
  - `POST /api/auth/login` - Đăng nhập
  - `GET /api/auth/me` - Lấy thông tin user

- ✅ **User.php Model** - Quản lý users table
- ✅ **UserProfile.php Model** - Quản lý user_profiles table
- ✅ **EmailService.php** - Gửi email xác minh

### Frontend (React + TypeScript):
- ✅ **RegisterPage.tsx** - Form đăng ký 2 step
  - Step 1: Nhập thông tin cá nhân
  - Step 2: Xác minh mã email với countdown 60s
  - Validation đầy đủ
  - UI/UX chuyên nghiệp

## 🚀 Cách Test:

### 1. Setup Database:
```bash
# Import schema và seed data
mysql -u root -p < backend/database/schema.sql
mysql -u root -p < backend/database/seed_data.sql
```

### 2. Chạy Backend (PHP):
```bash
# Đảm bảo Apache/Nginx + PHP đang chạy
# Hoặc dùng PHP built-in server:
cd backend
php -S localhost:8000
```

### 3. Chạy Frontend (React):
```bash
cd source-code/galaxy-cinema-hub-main
npm install  # hoặc bun install
npm run dev  # hoặc bun dev
```

### 4. Test Flow Đăng Ký:

1. **Mở browser**: http://localhost:5173/register

2. **Điền form đăng ký**:
   - Họ tên: Nguyễn Văn Test
   - Email: test@gmail.com
   - Số điện thoại: 0912345678
   - Ngày sinh: 01/01/2000
   - Mật khẩu: 123456
   - Xác nhận mật khẩu: 123456
   - ✓ Đồng ý điều khoản

3. **Click "Tiếp Theo"**:
   - Backend sẽ gửi mã 6 số về email
   - UI chuyển sang bước xác minh
   - Countdown 60s bắt đầu

4. **Nhập mã xác minh**:
   - Kiểm tra console log (do test nên mã được log)
   - Hoặc kiểm tra email thật nếu cấu hình SMTP
   - Nhập mã 6 số

5. **Click "Xác Nhận"**:
   - Backend xác minh mã
   - Tạo user mới trong database
   - Hash password bằng bcrypt
   - Tạo user profile
   - Chuyển về trang login

6. **Đăng nhập**:
   - Dùng email và password vừa đăng ký
   - Test xem có đăng nhập được không

## 🔍 Kiểm tra Database:

```sql
-- Xem user vừa tạo
SELECT u.*, up.full_name, up.phone 
FROM users u 
LEFT JOIN user_profiles up ON u.id = up.user_id 
WHERE u.email = 'test@gmail.com';

-- Kiểm tra password đã được hash
SELECT id, email, password_hash FROM users WHERE email = 'test@gmail.com';
```

## 📝 Notes quan trọng:

### Email Service:
- Hiện tại **EmailService.php** đang **log** mã xác minh vào error_log thay vì gửi email thật
- Để xem mã xác minh:
  - Check PHP error log
  - Hoặc check console của PHP server
  - Mã sẽ hiển thị dạng: `Code: 123456`

### Production Setup:
Để deploy production, cần cấu hình SMTP:

1. **Cài PHPMailer**:
```bash
composer require phpmailer/phpmailer
```

2. **Cấu hình SMTP** trong `EmailService.php`:
```php
// Gmail SMTP
$host = 'smtp.gmail.com';
$port = 587;
$username = 'your_email@gmail.com';
$password = 'your_app_password';
```

3. **Hoặc dùng service**:
   - SendGrid
   - Mailgun
   - Postmark

## 🔐 Security Features:

- ✅ Password hashing với bcrypt (cost 10)
- ✅ Validation đầy đủ input
- ✅ Verification code expire sau 5 phút
- ✅ CORS headers đã cấu hình
- ✅ SQL injection protection (PDO prepared statements)
- ✅ XSS protection (sanitize input)

## 🐛 Troubleshooting:

### Lỗi CORS:
```php
// Đã cấu hình trong backend/index.php
header('Access-Control-Allow-Origin: *');
```

### Lỗi kết nối database:
```php
// Kiểm tra config trong backend/config/Database.php
private $host = 'localhost';
private $username = 'root';
private $password = '12345678';
```

### Frontend không gọi được API:
```typescript
// Kiểm tra URL trong RegisterPage.tsx
const API_URL = "http://localhost/Cinema-Booking-System/backend";
// Hoặc: http://localhost:8000 nếu dùng PHP built-in server
```

## 📊 API Endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/send-verification` | Gửi mã xác minh |
| POST | `/api/auth/verify-email` | Xác minh và tạo tài khoản |
| POST | `/api/auth/login` | Đăng nhập |
| POST | `/api/auth/logout` | Đăng xuất |
| GET | `/api/auth/me` | Lấy thông tin user (JWT) |

## ✅ Test Cases:

- [ ] Đăng ký với email mới → Success
- [ ] Đăng ký với email đã tồn tại → Error
- [ ] Email không hợp lệ → Error
- [ ] SĐT không đúng định dạng → Error
- [ ] Tuổi < 13 → Error
- [ ] Password < 6 ký tự → Error
- [ ] Password không khớp → Error
- [ ] Không đồng ý điều khoản → Error
- [ ] Mã xác minh sai → Error
- [ ] Mã xác minh hết hạn → Error
- [ ] Resend code sau 60s → Success
- [ ] Đăng nhập sau đăng ký → Success

## 🎬 Ready to Test!

Chúc bạn test thành công! 🚀
