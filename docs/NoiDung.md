# 🚀 GalaxyCinema - Modern Cinema Management System

> **Hệ thống đặt vé và quản trị rạp chiếu phim toàn diện, hiệu năng cao.**

---

## 📖 Tổng quan dự án (Overview)

Quản lý một chuỗi rạp chiếu phim đòi hỏi việc xử lý dữ liệu đồng thời với độ chính xác tuyệt đối: từ việc sắp xếp suất chiếu, giữ chỗ realtime tránh trùng lặp (double-booking), cho đến đối soát giao dịch trực tuyến. **GalaxyCinema** được phát triển nhằm giải quyết triệt để bài toán này.

Hệ thống cung cấp một giải pháp công nghệ end-to-end, bao gồm giao diện người dùng hiện đại, tốc độ cao để khách hàng dễ dàng tra cứu và mua vé; kết hợp cùng một Dashboard quản trị mạnh mẽ dành cho doanh nghiệp. Thay vì phụ thuộc vào các framework Backend cồng kềnh, dự án sử dụng kiến trúc MVC thuần túy (Custom PHP Framework) để tối ưu hóa hiệu năng, kết hợp cùng cơ sở dữ liệu MySQL cấu trúc chặt chẽ bằng các triggers/constraints, đảm bảo tính toàn vẹn dữ liệu ngay từ tầng thấp nhất.

---

## 💻 Tech Stack

Hệ thống được phát triển dựa trên triết lý **Decoupled Architecture** (Kiến trúc phân tách), phân tách hoàn toàn giữa Frontend và Backend.

### 🎨 Frontend

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![React Query](https://img.shields.io/badge/-React%20Query-FF4154?style=for-the-badge&logo=react%20query&logoColor=white)

- **Framework:** ReactJS (Vite compiler) + TypeScript
- **UI/UX:** Tailwind CSS & Shadcn/UI (Radix UI primitives)
- **State Management:** React Query (để xử lý caching & server state)

### ⚙️ Backend

![PHP](https://img.shields.io/badge/PHP-777BB4?style=for-the-badge&logo=php&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-black?style=for-the-badge&logo=JSON%20web%20tokens)

- **Core:** PHP 8.x (Custom MVC Framework)
- **Authentication:** Stateless JSON Web Tokens (JWT)
- **Routing:** Custom HTTP Router với hơn 50+ API endpoints.

### 🗄️ Database

![MySQL](https://img.shields.io/badge/MySQL-00000F?style=for-the-badge&logo=mysql&logoColor=white)

- **RDBMS:** MySQL 8.0 (23+ bảng dữ liệu)
- **Logic toàn vẹn:** Raw SQL scripts, Triggers & Foreign Key Constraints.

### 🛠️ Tools & DevOps

![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)
![Bash](https://img.shields.io/badge/GNU%20Bash-4EAA25?style=for-the-badge&logo=GNU%20Bash&logoColor=white)

- **Containerization:** Docker & Docker Compose
- **Chạy cục bộ:** Docker Compose và Ollama; `start-chatbot.ps1` mở website cùng chatbot đã tune.
- **CI/CD:** Bash scripts kiểm tra & tự động hóa (`check_deployment.sh`).

---

## ✨ Tính năng nổi bật (Key Features)

- **🎬 Thuật toán Xếp lịch chiếu Tự động:** Xử lý logic khởi tạo suất chiếu thông minh dựa trên thời lượng phim, thời gian dọn dẹp rạp, tự động kiểm tra xung đột phòng chiếu (conflict resolution).
- **💳 Tích hợp Thanh toán Điện tử (MoMo & VNPay):** Chế lý webhook bất đồng bộ để xác nhận giao dịch. Hỗ trợ hệ thống giữ ghế (seat hold) bị timeout qua Cron Jobs (hoàn trả ghế nếu user không thanh toán đúng hạn).
- **🛡️ Phân quyền RBAC (Role-Based Access Control) Đa tầng:** Hệ thống matrix quyền hạn chặt chẽ (Admin, Manager, Staff). Phân quyền linh hoạt trực tiếp từ DB lên tới UI Frontend, ẩn/hiện logic động dựa trên roles.
- **🎁 Marketing & Voucher Engine:** Hệ thống cấu hình chiến dịch khuyến mãi phức tạp (Birthday Voucher, discount theo phần trăm/số tiền thực, schema điều kiện sử dụng chặt chẽ).
- **📍 Geolocation & Mapping:** Tích hợp MapTiler/OpenRouteService hiển thị bản đồ trực quan, giúp người dùng định vị và tìm các rạp chiếu phim gần nhất.

---

## ⚙️ Kiến trúc & Logic nghiệp vụ (Architecture & Business Logic)

Dự án áp dụng mô hình **MVC (Model-View-Controller)** truyền thống trên backend nhưng được cải tiến để phục vụ thiết kế dạng **RESTful API**:

> _"Luồng dữ liệu: `Client (React) -> .htaccess -> index.php -> Custom Router -> AuthMiddleware -> Controller -> Model -> MySQL`"_

- **Stateless API & Middleware:** Không sử dụng session của PHP. Mọi request đều đi qua `AuthMiddleware` để parse Bearer Token, kiểm định tính hợp lệ chữ ký kỹ thuật số, qua đó đảm bảo tính Stateless và khả năng scale-out của server.
- **Database Driven Integrity:** Rất nhiều nghiệp vụ thay vì tin tưởng 100% vào code Backend, đã được đẩy xuống tầng CSDL thông qua MySQL Triggers và quy tắc dữ liệu chặt chẽ (Schema constraints). Tránh tuyệt đối trường hợp race-condition khi có lượng lớn người dùng cùng book 1 ghế.
- **Bóc tách Controller nghiệp vụ:** Backend không sử dụng bất kì code "vạn năng" nào. Các tiến trình xử lý vé (`booking`), voucher, authentication đều được gom nhóm thành các Controller với chức năng hạt nhân rõ ràng (Single Responsibility Principle).

---

## 🛠️ Hướng dẫn cài đặt & Khởi chạy (Getting Started)

Dự án đã được đóng gói hoàn chỉnh bằng Docker. Bạn chỉ cần làm theo các bước dưới đây để chạy dự án tại local.

### Yêu cầu hệ thống (Prerequisites)

- [Docker](https://www.docker.com/) & Docker Compose (v2.x+)
- Môi trường bash shell (Git Bash, WSL cho Windows hoặc Terminal của macOS/Linux)

### Các bước cài đặt (Quick Setup)

**Bước 1: Clone kho lưu trữ**

```bash
git clone https://github.com/your-username/GalaxyCinema_Project.git
cd GalaxyCinema_Project

```

Bước 2: Cấu hình biến môi trường (Environment Variables)
Tạo các tệp .env dựa trên file mẫu có sẵn. Quan trọng nhất là nhập chính xác thông tin cấu hình JWT và Database.

# Setup env cho thư mục gốc

cp .env.deploy.example .env

# Setup env cho backend

cd backend
cp .env.example .env
cd ..

Bước 3: Kiểm tra tính toàn vẹn (Pre-flight Check)
Chạy script kiểm tra xem hệ thống đã sẵn sàng cho quá trình build docker chưa:
./check_deployment.sh

Bước 4: Khởi chạy dự án bằng Docker
Chạy ứng dụng trong chế độ nền (detached):
docker-compose -f docker-compose.deploy.yml up -d --build

Bước 5: Truy cập hệ thống
Đợi khoảng 1-2 phút để Database khởi tạo xong dữ liệu mẫu (Seed data). Sau đó bạn có thể truy cập:

🌐 Frontend (Web App): http://localhost:8080
⚙️ Backend (API Base URL): http://localhost:8000
Tài khoản Admin nội bộ mặc định:

Email: admin@galaxy.vn
Password: password
