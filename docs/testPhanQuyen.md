# 🧪 Kịch Bản Kiểm Thử Phân Quyền Động (Dynamic RBAC Test Cases)

Tài liệu này hướng dẫn chi tiết các bước tạo vai trò tùy chỉnh (Custom Roles), gán vai trò và kiểm tra tính hợp lệ của hệ thống phân quyền Galaxy Cinema.

---

### 📋 Bảng tổng hợp các vai trò tùy chỉnh đề xuất

| Nhóm tài khoản (`base_role`) | Tên vai trò đề xuất | Mục đích vận hành thực tế | Quyền chính cần tick | Kịch bản kiểm tra (Test Case) |
| :--- | :--- | :--- | :--- | :--- |
| 👑 **Admin** | **Admin Cấp 2 (Vận hành & CSKH)** | Trưởng phòng nghiệp vụ / Vận hành; quản lý rạp, phim, khuyến mãi và chăm sóc khách hàng; không can thiệp hạ tầng hệ thống. | `movies.*`, `showtimes.*`, `cinemas.*`, `promotions.*`, `concessions.*`, `reviews.*`, `users.view_all`, `users.update_all`. *(Tắt sạch `system.*`)* | Không thể vào Cấu hình hệ thống, Phân quyền ma trận, hoặc đổi vai trò của người khác. |
| 🏢 **Manager** | **Quản lý Kỹ thuật & Suất chiếu** | Kỹ thuật viên / Quản lý vận hành phòng chiếu & lịch phim; chỉ chỉnh layout ghế và tạo lịch chiếu; không quản lý nhân sự hay doanh thu. | `halls.view`, `halls.manage_layout`, `showtimes.*`, `movies.view`. *(Tắt sạch `halls.create`, `halls.delete`, `users.*`, `reports.*`, `transactions.*`)* | Vào được trang xếp lịch chiếu, chỉnh layout sơ đồ ghế; menu Nhân Viên, Báo Cáo, Doanh Thu bị ẩn; không thể tạo hay xóa phòng chiếu. |
| 🏢 **Manager** | **Quản trị Nhân sự & Dịch vụ Rạp** | Quản lý phụ trách tuyển dụng, quản lý ca nhân viên và bắp nước tại cơ sở; không can thiệp lịch phim. | `users.view_all`, `users.create`, `users.update_all`, `concessions.*`. *(Tắt `showtimes.*`, `halls.*`)* | Quản lý nhân viên rạp, nhập hàng bắp nước; bị ẩn mục Quản lý Suất Chiếu và Chỗ Ngồi. |
| 🎫 **Staff** | **Thu ngân Quầy POS** | Nhân viên quầy vé: bán vé, thanh toán POS, xuất combo bắp nước; không có quyền soát vé vào phòng chiếu. | `bookings.pos`, `bookings.create`, `bookings.view_all`, `concessions.view`, `transactions.view_own`. *(Tắt sạch `tickets.scan`, `tickets.approve_entry`)* | Truy cập POS mượt mà, nhưng không thể vào màn hình Quét vé (Scanner). |
| 🎫 **Staff** | **Nhân viên Soát vé (Gate Controller)** | Nhân viên trực cửa rạp: quét QR vé, kiểm tra tình trạng vé và cho khách vào; không có quyền bán vé thu tiền. | `tickets.scan`, `tickets.approve_entry`, `tickets.view_all`, `showtimes.view`. *(Tắt `bookings.pos`, `bookings.create`)* | Mở được máy quét QR code, nhưng thanh điều hướng không có POS và bị chặn bán vé. |

---

### 📝 Chi tiết từng Test Case thực hiện

#### 1. 👑 Admin Cấp 2: *Quản trị viên Vận hành & CSKH*
* **Bước 1:** Tại **Tab 1: Ma trận vai trò**, bấm **Tạo vai trò mới** ➔ Nhập tên: `Quản trị viên Vận hành`, chọn nhóm tài khoản: **Quản trị viên (Admin)**.
* **Bước 2:** Tick bật các quyền:
  - **Quản lý Phim & Suất chiếu:** Bật tất cả.
  - **Khuyến mãi & Bắp nước:** Bật tất cả.
  - **Người dùng:** Bật `users.view_all`, `users.update_all` *(bỏ tick `users.change_role` và `users.delete`)*.
  - **Cấu hình hệ thống:** **Tắt toàn bộ** module `system.*` (`system.settings`, `system.roles`, `system.permissions`).
* **Kịch bản test:**
  1. Gán vai trò này cho một tài khoản trong nhóm Admin.
  2. Đăng nhập tài khoản đó: Thấy menu quản lý Phim, Suất chiếu, Khuyến mãi; nhưng mục **Phân Quyền** và **Cấu Hình** bị ẩn hoàn toàn khỏi thanh Sidebar.
  3. Cố tình gõ trực tiếp URL `/admin/role-permissions` hoặc `/admin/settings`: Hệ thống chuyển hướng hoặc chặn truy cập.

---

#### 2. 🏢 Manager: *Quản lý Kỹ thuật & Suất chiếu*
* **Bước 1:** Bấm **Tạo vai trò mới** ➔ Nhập tên: `Quản lý Kỹ thuật & Suất chiếu`, chọn nhóm tài khoản: **Quản lý rạp (Manager)**.
* **Bước 2:** Tick bật các quyền:
  - **Phòng chiếu & Ghế (`halls`):** `halls.view`, `halls.manage_layout` *(Lưu ý: Không tick `halls.create` và `halls.delete` vì việc tạo/xóa phòng là thẩm quyền hạ tầng của Admin/Tổng quản lý)*.
  - **Suất chiếu (`showtimes`):** `showtimes.view`, `showtimes.create`, `showtimes.update`, `showtimes.auto_generate`.
  - **Phim (`movies`):** `movies.view`.
  - **Báo cáo, Giao dịch & Nhân sự:** **Tắt sạch** `users.*`, `reports.*`, `transactions.*`, `reviews.*`.
* **Kịch bản test:**
  1. Gán vai trò này cho Manager cụm rạp tại **Tab 2: Phân bổ vai trò**.
  2. Đăng nhập tài khoản Manager đó:
     - **Thanh menu Sidebar:** Tự động ẩn các mục *Nhân Viên*, *Báo Cáo*, *Giao Dịch*, *Đánh Giá*. Chỉ hiển thị *Quản Lý Phim*, *Lịch Chiếu*, *Chỗ Ngồi*.
     - **Tại trang Quản lý chỗ ngồi (`/manager/seats`):**
       + Nút **+ Thêm phòng** và **Xóa phòng** bị ẩn do không có quyền `halls.create` / `halls.delete`.
       + Manager vẫn chọn được các phòng hiện có để **sơn ghế, đổi loại ghế và Lưu sơ đồ ghế** (`halls.manage_layout`).
     - **Bảo vệ URL:** Nếu cố tình gõ link `/manager/staff` trên thanh địa chỉ, giao diện lập tức hiển thị cảnh báo *"Truy Cập Bị Từ Chối - Cần quyền users.view_all"*; Backend chặn hoàn toàn với mã lỗi 403 Forbidden.

---

#### 3. 🎫 Staff: *Nhân viên Thu ngân POS (Bán vé thuần)*
* **Bước 1:** Bấm **Tạo vai trò mới** ➔ Nhập tên: `Thu ngân Quầy POS`, chọn nhóm tài khoản: **Nhân viên (Staff)**.
* **Bước 2:** Tick chọn:
  - **Đặt vé & POS:** `bookings.pos`, `bookings.create`, `bookings.view_all`.
  - **Bắp nước:** `concessions.view`.
  - **Giao dịch:** `transactions.process`, `transactions.view_own`.
  - **Soát vé:** **Tắt sạch** `tickets.scan`, `tickets.approve_entry`.
* **Kịch bản test:**
  1. Gán vai trò cho nhân viên quầy.
  2. Đăng nhập: Vào bán vé POS bình thường, xuất hóa đơn vé + bắp nước.
  3. Khi bấm vào mục Quét vé (Scanner): Bị chặn và thông báo không có quyền `tickets.scan`.

---

#### 4. 🎫 Staff: *Nhân viên Soát vé (Gate Controller)*
* **Bước 1:** Bấm **Tạo vai trò mới** ➔ Nhập tên: `Soát Vé & Vào Cổng`, chọn nhóm tài khoản: **Nhân viên (Staff)**.
* **Bước 2:** Tick chọn:
  - **Soát vé:** `tickets.scan`, `tickets.approve_entry`, `tickets.view_all`.
  - **Suất chiếu:** `showtimes.view`.
  - **POS:** **Tắt sạch** `bookings.pos`, `bookings.create`.
* **Kịch bản test:**
  1. Gán vai trò cho nhân viên soát vé.
  2. Đăng nhập: Màn hình camera quét QR hoạt động, kiểm tra vé hợp lệ / đã dùng.
  3. Bị ẩn menu Bán vé POS, không thể đặt vé hoặc thu tiền.
