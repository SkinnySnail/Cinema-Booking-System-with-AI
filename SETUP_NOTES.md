# 🔌 Kết nối Database & Đăng ký tài khoản — Ghi chú nhanh

## ⚠️ Máy này có HAI MySQL server

| | Host MySQL (cài trực tiếp) | Docker MySQL (dự án) |
|---|---|---|
| **Port** | `3306` | `3307` (host) → `3306` (container) |
| **PID** | 2040 | 48122 (container) |
| **Dùng bởi** | MySQL Workbench (mặc định) | **Ứng dụng đang chạy** |
| **Trạng thái `galaxy_cinema`** | ✅ 37 bảng + 2 view | ✅ 37 bảng + 2 view |

### Vì sao Workbench bạn thấy "không có bảng nào"?

Workbench mặc định kết nối `localhost:3306` → **host MySQL**, không phải Docker.
Trước đây host MySQL có database `galaxy_cinema` rỗng (0 bảng) nên Workbench
hiện schema nhưng không có tab Tables.

**Đã xử lý:** host MySQL `3306` đã được nạp đầy đủ schema + seed + lịch chiếu.

### Cách sửa trong MySQL Workbench

```
Connection Name : Galaxy Cinema (Docker)
Host            : 127.0.0.1
Port            : 3307        <-- 3307, KHÔNG phải 3306
Username        : root
Password        : 123456
Default Schema  : galaxy_cinema
```

> Hoặc dùng port **3306** với host MySQL cài trực tiếp — cũng đã có đầy đủ data.
> Hai bản này là hai DB **riêng biệt**; dữ liệu nhập vào một bên không tự xuất hiện ở bên kia.

---

## Cấu hình đã dùng

### Backend (trong Docker)
```yaml
DB_HOST: db          # tên service trong compose
DB_PORT: "3306"      # MySQL trong container nghe ở 3306
DB_NAME: galaxy_cinema
DB_USERNAME: root
DB_PASSWORD: "123456"
```

> **Lưu ý quan trọng:** `3307` là *mapping ra host*, KHÔNG phải port MySQL thật trong container.
> Đặt `DB_PORT=3307` trong container → `Connection refused`. Đã cố định bằng cách ghim
> `DB_PORT: "3306"` trong `docker.yml` và `docker-compose.deploy.yml`.

### Backend (chạy trực tiếp trên host, không Docker)
File `backend/.env`:
```
DB_HOST=127.0.0.1
DB_PORT=3307      # trỏ vào MySQL Docker
DB_NAME=galaxy_cinema
DB_USERNAME=root
DB_PASSWORD=123456
```

`backend/config/Database.php` đã được sửa để **hỗ trợ `DB_PORT`** (trước đó bỏ qua, luôn dùng 3306).

---

## Đăng ký tài khoảng — luồng 2 bước

Frontend **không** gọi `/api/auth/register`. Route đó không tồn tại trong `AuthController`
(sẽ trả `Handler not found`). Luồng đúng là:

```
POST /api/auth/send-verification   → gửi mã 6 chữ số qua Gmail, hết hạn 5 phút
POST /api/auth/verify-email        → xác minh mã + tạo user + gửi email chào mừng
```

Payload `send-verification` (tất cả field đều bắt buộc):
```json
{
  "email": "ban@example.com",
  "fullName": "Nguyễn Văn A",
  "phone": "0912345678",
  "dob": "1995-05-20",
  "password": "Test@12345"
}
```

### Gmail — đã bật

`backend/.env`:
```
SMTP_ENABLED=true          # TRƯỚC ĐÂY là false -> chỉ log, không gửi email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_ENCRYPTION=tls
SMTP_USERNAME=<email-gmail-cua-ban>
SMTP_PASSWORD=<app-password-16-ky-tu>   # Không commit giá trị thật
```

Log xác nhận gửi thành công:
```
STARTTLS response: 220 2.0.0 Ready to start TLS
TLS enabled successfully
Password response: 235 2.7.0 Accepted
Email sent successfully to: xxx@gmail.com
```

> Nếu muốn test không cần gửi mail thật: đặt `SMTP_ENABLED=false`.
> Mã xác minh vẫn được sinh và lưu vào `backend/uploads/verification_codes.json`.

### Xem mã xác minh khi SMTP tắt
```bash
docker exec galaxy_cinema_app php -r \
  '$c=json_decode(file_get_contents("/app/backend/uploads/verification_codes.json"),true);
   foreach($c as $e=>$v){echo "$e => ".$v["code"]."\n";}'
```

---

## 📽 Dữ liệu phim — lịch chiếu rạp thực tế tháng 11/2026

Đã cập nhật `backend/database/seed_data.sql` với **15 phim** đúng lịch chiếu rạp
(tính đến 21/11/2026), nguồn Moveek / FPTShop / MoMo.

### Đang chiếu (có lịch chiếu)

| # | Phim | Thời lượng | Đạo diễn | Khởi chiếu |
|---|---|---|---|---|
| 1 | Bò Sữa Bay | 108' | Nguyễn Phạm Thành Đạt | 06/11/2026 |
| 2 | Ngày Con Còn Mẹ | 118' | Vũ Ngọc Đãng | 11/11/2026 |
| 3 | Trại Giam Hạnh Phúc | 127' | Trung Lùn | 20/11/2026 |
| 4 | Chị Chị Em Em 3 | 122' | Nguyễn Hữu Hoàng | 30/10/2026 |
| 6 | Trại Buôn Người | 135' | Toni Dương Bảo Anh | 25/09/2026 |
| 7 | Đấu Trường Sinh Tử: Bình Minh Ngày Chiêu Quân | 158' | Francis Lawrence | 20/11/2026 |
| 8 | Godzilla Trừ Không | 135' | Takashi Yamazaki | 06/11/2026 |
| 9 | Chàng Mèo Mang Mũ | 108' | Eric Darnell | 06/11/2026 |
| 10 | Clayface | 109' | James Watkins | 23/10/2026 |
| 11 | Ebenezer: Phép Màu Đêm Giáng Sinh | 115' | Nabil Ayouch | 13/11/2026 |
| 12 | Ramayana: Khởi Nguồn Một Huyền Thoại | 195' | Sanjay Leela Bhansali | 06/11/2026 |

### Sắp chiếu (chưa có lịch)

| # | Phim | Thời lượng | Khởi chiếu |
|---|---|---|---|
| 5 | Án Mạng Karaoke | 96' | 30/10/2026 *(còn suất hạn chế)* |
| 13 | Mẹ Mìn: Giao Kèo Với Quỷ | 125' | 27/11/2026 |
| 14 | Kumanthong Quỷ Thắp Nhang | 110' | 27/11/2026 |
| 15 | Gặp Gỡ Thông Gia: Dâu Mới Trình Làng | 105' | 27/11/2026 |

### Files liên quan

| File | Vai trò |
|---|---|
| `backend/database/seed_data.sql` | Nguồn chính — phim, thể loại, suất chiếu, khuyến mãi, đánh giá |
| `backend/database/seed_movies_current.sql` | Bản riêng chỉ phim + thể loại (tham khảo) |
| `backend/database/auto_seed_current_showtimes.sql` | Dịch lịch chiếu sang ngày hiện tại (chạy tự động) |
| `backend/database/generate_posters.py` | Sinh 15 poster (gradient + typography, tránh bản quyền) |
| `backend/database/generate_concession_images.py` | Sinh 8 ảnh bắp nước (gradient + typography, tránh bản quyền) |

### Poster

Poster được **dựng bằng code** (gradient + typography), không dùng ảnh thật của phim
để tránh bản quyền. Muốn đổi ảnh thật: thay file trong `backend/uploads/posters/`
với đúng tên (`bo-sua-bay.jpg`, `hunger-games-sunrise.jpg`, ...) — frontend tự hiển thị.

```bash
python3 backend/database/generate_posters.py     # sinh lại poster
```

> Thư mục `backend/uploads/posters/` do container tạo (owner root). Nếu script báo
> `PermissionError`, copy qua container:
> ```bash
> docker cp /tmp/galaxy_posters/*.jpg galaxy_cinema_app:/app/backend/uploads/posters/
> ```

### Ảnh bắp nước

Ảnh bắp nước cũng được **dựng bằng code** (gradient + typography, vuông 600×600)
để tránh bản quyền, lưu ở `backend/uploads/concessions/`:

```bash
python3 backend/database/generate_concession_images.py     # sinh lại ảnh bắp nước
```

Muốn đổi ảnh thật: thay file trong `backend/uploads/concessions/` với đúng tên
(`popcorn-m.jpg`, `coke-l.jpg`, `combo1.jpg`, ...) — frontend tự hiển thị.

### Cập nhật lịch chiếu sang phim mới

1. Sửa `backend/database/seed_data.sql` (khối `INSERT INTO movies` + `showtimes`)
2. Chạy `python3 backend/database/generate_posters.py` để tạo poster mới
3. Reset DB:
   ```bash
   ./run-dev.sh reset && ./run-dev.sh start
   ```

---

## Chạy dự án

```bash
./run-dev.sh start     # khởi động db + app + frontend + ai
./run-dev.sh status
./run-dev.sh stop
./run-dev.sh reset     # xóa volume -> lần start sau tự seed lại từ đầu
```

> `run-dev.sh start` dùng `--force-recreate` cho `app` và `ai` để chắc chắn
> cả hai container nhận cùng `AI_SERVICE_KEY`. Nếu không, container giữ key cũ
> và chatbot trả *"Trợ lý tạm thời chưa kết nối được"* (`ai_available: false`).

| | |
|---|---|
| Frontend | http://localhost:8080 |
| API | http://localhost:8000/api/health |
| DB (Docker) | 127.0.0.1:**3307** · root / 123456 |
| DB (host) | 127.0.0.1:**3306** · root / 123456 |

**Tài khoản có sẵn:** `admin@galaxy.vn` · `manager@galaxy.vn` · `staff@galaxy.vn` — password `password`
