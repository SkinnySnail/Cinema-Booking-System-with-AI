-- ============================================
-- Galaxy Cinema Database Schema
-- Theo ERD đã cập nhật (Đã thêm SEAT_HOLDS, LOYALTY_HISTORY, USER_VOUCHERS, CINEMA_CONCESSION_INVENTORY)
-- ============================================

-- XÓA DATABASE CŨ (NẾU CÓ)
DROP DATABASE IF EXISTS galaxy_cinema;

-- TẠO DATABASE MỚI
CREATE DATABASE galaxy_cinema CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- SỬ DỤNG DATABASE
USE galaxy_cinema;

-- ============================================
-- NHÓM 1: NGƯỜI DÙNG, ĐỊNH DANH & LOYALTY
-- ============================================

-- Bảng Vai Trò (Hỗ trợ Dynamic RBAC)
CREATE TABLE roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE COMMENT 'Tên vai trò / Mã hệ thống',
    code VARCHAR(50) NULL UNIQUE COMMENT 'Mã định danh vai trò (vd: SYSTEM_ADMIN, STAFF_TICKET)',
    display_name VARCHAR(100) NOT NULL COMMENT 'Tên hiển thị tiếng Việt',
    description TEXT NULL COMMENT 'Mô tả trách nhiệm của vai trò',
    base_role ENUM('admin', 'manager', 'staff', 'member', 'guest') NOT NULL DEFAULT 'staff' COMMENT 'Nhóm tài khoản tương thích',
    is_system TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=Vai trò hệ thống mặc định (Chỉ đọc), 0=Vai trò tùy chỉnh',
    is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Đang kích hoạt, 0=Tạm khóa',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_base_role (base_role),
    INDEX idx_is_system (is_system),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Quyền Hạn Hệ Thống
CREATE TABLE permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE COMMENT 'Tên permission (vd: movies.create, users.delete)',
    display_name VARCHAR(255) NOT NULL COMMENT 'Tên hiển thị',
    description TEXT COMMENT 'Mô tả chi tiết',
    module VARCHAR(50) NOT NULL COMMENT 'Module/nhóm (movies, users, bookings, etc)',
    is_active TINYINT NOT NULL DEFAULT 1 COMMENT 'Trạng thái: 1=Hoạt động, 0=Đã khóa',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_module (module)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Mapping giữa Role và Permission
CREATE TABLE role_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role_id INT NOT NULL,
    permission_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
    UNIQUE KEY unique_role_permission (role_id, permission_id),
    INDEX idx_role (role_id),
    INDEX idx_permission (permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Hạng Thành Viên
CREATE TABLE memberships (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rank_name VARCHAR(50) NOT NULL UNIQUE COMMENT 'Bronze/Silver/Gold/Platinum',
    min_points_required INT NOT NULL DEFAULT 0,
    discount_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT 'Tỷ lệ giảm giá (%)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Người Dùng
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role_id INT NOT NULL DEFAULT 2 COMMENT 'Default: Member',
    status ENUM('Active', 'Banned') DEFAULT 'Active',
    current_points INT NOT NULL DEFAULT 0 COMMENT 'Tổng điểm loyalty hiện tại',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
    INDEX idx_email (email),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Hồ Sơ Người Dùng
CREATE TABLE user_profiles (
    user_id INT PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(15),
    dob DATE COMMENT 'Ngày sinh để kiểm tra tuổi & tự động voucher sinh nhật',
    avatar VARCHAR(500),
    membership_id INT DEFAULT 1 COMMENT 'Default: Bronze',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE SET NULL,
    INDEX idx_dob (dob),
    INDEX idx_membership (membership_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Phân Bổ Đa Vai Trò Cho Người Dùng (Multi-Role Mapping)
CREATE TABLE user_roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT 'ID người dùng',
    role_id INT NOT NULL COMMENT 'ID vai trò được gán',
    is_primary TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=Vai trò cơ sở mặc định, 0=Vai trò bổ sung',
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by INT NULL COMMENT 'ID admin thực hiện gán vai trò',
    reason VARCHAR(255) NULL COMMENT 'Lý do phân bổ vai trò (bắt buộc cho audit)',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_role (user_id, role_id),
    INDEX idx_user_id (user_id),
    INDEX idx_role_id (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Nhật Ký Kiểm Toán Phân Quyền (Append-Only Audit Trail)
CREATE TABLE permission_audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    actor_id INT NULL COMMENT 'ID người thực hiện',
    actor_name VARCHAR(255) NULL COMMENT 'Tên/Email người thực hiện',
    action VARCHAR(50) NOT NULL COMMENT 'ROLE_CREATE, ROLE_UPDATE, ROLE_DELETE, ROLE_PERMISSIONS_SYNC, USER_ROLES_ASSIGN',
    target_type VARCHAR(50) NOT NULL COMMENT 'ROLE hoặc USER',
    target_id INT NULL COMMENT 'ID của vai trò hoặc người dùng đích',
    target_name VARCHAR(255) NULL COMMENT 'Tên đối tượng bị tác động',
    reason TEXT NULL COMMENT 'Lý do thay đổi',
    old_value JSON NULL COMMENT 'Dữ liệu trước thay đổi',
    new_value JSON NULL COMMENT 'Dữ liệu sau thay đổi',
    ip_address VARCHAR(45) NULL COMMENT 'Địa chỉ IP',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_action (action),
    INDEX idx_created_at (created_at),
    INDEX idx_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Lịch Sử Tích Điểm (MỚI - Audit Trail)
CREATE TABLE loyalty_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    points_change INT NOT NULL COMMENT '+ (Earn) hoặc - (Redeem)',
    type ENUM('PURCHASE', 'REDEEM', 'EVENT', 'ADMIN_ADJUST') NOT NULL,
    description TEXT,
    related_booking_id INT NULL COMMENT 'Nếu liên quan đến booking',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_type (user_id, type),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Khách Hàng Vãng Lai (POS)
CREATE TABLE pos_customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL COMMENT 'Số điện thoại khách',
    name VARCHAR(255) COMMENT 'Tên khách (tuỳ chọn)',
    guest_customer_code VARCHAR(50) UNIQUE COMMENT 'Mã khách vãng lai (GUEST-...)',
    total_bookings INT DEFAULT 0 COMMENT 'Số lần mua vé',
    first_visit_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by_staff_id INT NULL COMMENT 'Staff tạo bản ghi này',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by_staff_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_phone (phone),
    INDEX idx_guest_code (guest_customer_code),
    INDEX idx_first_visit (first_visit_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- NHÓM 2: PHIM & HẠ TẦNG RẠP
-- ============================================

-- Bảng Phim
CREATE TABLE movies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    duration_minutes INT NOT NULL,
    age_rating ENUM('P', 'K', 'T13', 'T16', 'T18', 'C') NOT NULL COMMENT 'Phân loại độ tuổi VN',
    origin ENUM('Vietnam', 'International') NOT NULL,
    poster_url VARCHAR(500),
    trailer_url VARCHAR(500),
    description TEXT,
    director VARCHAR(255) NULL COMMENT 'Movie director(s)',
    cast TEXT NULL COMMENT 'Movie cast (comma-separated names)',
    release_date DATE,
    status ENUM('Coming Soon', 'Now Showing', 'Ended') DEFAULT 'Coming Soon',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_origin (origin),
    INDEX idx_release_date (release_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Thể Loại
CREATE TABLE genres (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Phim - Thể Loại (Many-to-Many)
CREATE TABLE movie_genres (
    movie_id INT NOT NULL,
    genre_id INT NOT NULL,
    PRIMARY KEY (movie_id, genre_id),
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
    FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Poster Trang Chủ (Hero Banner)
CREATE TABLE home_posters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NULL COMMENT 'Tên chiến dịch/banner (tùy chọn)',
    image_url VARCHAR(500) NOT NULL COMMENT 'Đường dẫn ảnh đã upload lên Cloudinary',
    target_url VARCHAR(500) NULL COMMENT 'Link điều hướng khi user click',
    display_order INT DEFAULT 0 COMMENT 'Thứ tự ưu tiên hiển thị (số lớn hiển thị trước hoặc sau tùy chuẩn)',
    is_active BOOLEAN DEFAULT TRUE COMMENT 'Mở/tắt banner',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_active_order (is_active, display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Cụm Rạp
CREATE TABLE cinemas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    street VARCHAR(255) DEFAULT NULL COMMENT 'Địa chỉ chi tiết',
    district VARCHAR(100) DEFAULT NULL COMMENT 'Quận/Huyện',
    city VARCHAR(100) DEFAULT NULL COMMENT 'Thành phố/Tỉnh',
    lat DECIMAL(10, 8) DEFAULT NULL COMMENT 'Vĩ độ',
    lng DECIMAL(11, 8) DEFAULT NULL COMMENT 'Kinh độ',
    hotline VARCHAR(20) DEFAULT NULL COMMENT 'Số hotline của rạp',
    status ENUM('active', 'maintenance', 'closed') DEFAULT 'active' COMMENT 'Trạng thái hoạt động',
    manager_id INT NULL COMMENT 'FK -> users (role Manager)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_manager (manager_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Liên Kết Nhân Viên ↔ Rạp
-- Manager được gán qua cinemas.manager_id (1 manager/rạp)
-- Staff (role_id=3) được gán qua bảng này (nhiều staff/rạp)
CREATE TABLE cinema_staff (
    cinema_id  INT NOT NULL,
    user_id    INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT NOW(),
    PRIMARY KEY (cinema_id, user_id),
    CONSTRAINT fk_cs_cinema FOREIGN KEY (cinema_id) REFERENCES cinemas(id) ON DELETE CASCADE,
    CONSTRAINT fk_cs_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
    INDEX idx_cs_cinema (cinema_id),
    INDEX idx_cs_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Phòng Chiếu
CREATE TABLE cinema_halls (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cinema_id INT NOT NULL,
    name VARCHAR(100) NOT NULL COMMENT 'Room 1/IMAX/4DX',
    total_seats INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cinema_id) REFERENCES cinemas(id) ON DELETE CASCADE,
    INDEX idx_cinema (cinema_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Loại Ghế
CREATE TABLE seat_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE COMMENT 'Standard/VIP/Sweetbox',
    price_multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.00 COMMENT 'Hệ số nhân giá',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Ghế Ngồi
CREATE TABLE seats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cinema_hall_id INT NOT NULL,
    row_code VARCHAR(5) NOT NULL COMMENT 'A/B/C/D',
    number INT NOT NULL COMMENT 'Số ghế trong hàng',
    seat_type_id INT NOT NULL,
    status ENUM('Active', 'Broken', 'Inactive') DEFAULT 'Active' COMMENT 'Active: Hoạt động, Broken: Hỏng, Inactive: Khu vực không ngồi',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cinema_hall_id) REFERENCES cinema_halls(id) ON DELETE CASCADE,
    FOREIGN KEY (seat_type_id) REFERENCES seat_types(id) ON DELETE RESTRICT,
    UNIQUE KEY unique_seat (cinema_hall_id, row_code, number),
    INDEX idx_hall_status (cinema_hall_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- NHÓM 3: LỊCH CHIẾU & ĐẶT VÉ
-- ============================================

-- Bảng Lịch Chiếu
CREATE TABLE showtimes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    movie_id INT NOT NULL,
    cinema_hall_id INT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL COMMENT 'Thời gian kết thúc (start_time + duration + cleanup)',
    base_price DECIMAL(10,2) NOT NULL DEFAULT 90000 COMMENT 'Giá vé cơ sở',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
    FOREIGN KEY (cinema_hall_id) REFERENCES cinema_halls(id) ON DELETE CASCADE,
    INDEX idx_movie_time (movie_id, start_time),
    INDEX idx_hall_time (cinema_hall_id, start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Giữ Ghế Tạm Thời
CREATE TABLE seat_holds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    showtime_id INT NOT NULL,
    seat_id INT NOT NULL,
    user_id INT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_showtime_seat (showtime_id, seat_id),
    KEY idx_expires (expires_at),
    KEY idx_user (user_id, showtime_id),
    FOREIGN KEY (showtime_id) REFERENCES showtimes(id) ON DELETE CASCADE,
    FOREIGN KEY (seat_id) REFERENCES seats(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Quy Tắc Giá
CREATE TABLE pricing_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    condition_type VARCHAR(100) NOT NULL COMMENT 'Weekend/Before10AM/Holiday',
    adjustment_amount DECIMAL(10,2) NOT NULL COMMENT 'Số tiền tăng/giảm',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Khuyến Mãi
CREATE TABLE promotions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE COMMENT 'Mã public',
    description TEXT,
    discount_amount DECIMAL(10,2) NOT NULL COMMENT 'Số tiền giảm cố định hoặc %',
    discount_type ENUM('FIXED', 'PERCENT') DEFAULT 'FIXED',
    min_order_value DECIMAL(10,2) DEFAULT 0 COMMENT 'Giá trị đơn hàng tối thiểu',
    max_discount DECIMAL(10,2) DEFAULT NULL COMMENT 'Số tiền giảm tối đa (chỉ áp dụng cho loại PERCENT)',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_auto_apply BOOLEAN DEFAULT FALSE COMMENT 'True cho sinh nhật/sự kiện hệ thống',
    usage_limit INT DEFAULT NULL COMMENT 'Giới hạn số lần dùng (NULL = unlimited)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_code (code),
    INDEX idx_dates (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Kho Voucher Người Dùng (MỚI)
CREATE TABLE user_vouchers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    promotion_id INT NOT NULL,
    code VARCHAR(50) NULL COMMENT 'Mã cụ thể cho user (nếu cần)',
    status ENUM('ACTIVE', 'USED', 'EXPIRED') DEFAULT 'ACTIVE',
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
    INDEX idx_user_status (user_id, status),
    INDEX idx_promotion (promotion_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Đơn Đặt Vé
CREATE TABLE bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL COMMENT 'FK -> users nếu user đã đăng nhập, NULL nếu khách vãng lai',
    guest_customer_id INT NULL COMMENT 'FK -> pos_customers nếu khách vãng lai, NULL nếu user đã đăng nhập',
    showtime_id INT NOT NULL,
    booking_code VARCHAR(20) UNIQUE NOT NULL COMMENT 'Mã đặt vé duy nhất (GXY-YYYY-XXXXX)',
    user_voucher_id INT NULL COMMENT 'FK -> user_vouchers nếu dùng voucher',
    total_price DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    final_price DECIMAL(10,2) NOT NULL,
    status ENUM('Pending', 'Paid', 'Cancelled', 'Expired') DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (guest_customer_id) REFERENCES pos_customers(id) ON DELETE CASCADE,
    FOREIGN KEY (showtime_id) REFERENCES showtimes(id) ON DELETE RESTRICT,
    FOREIGN KEY (user_voucher_id) REFERENCES user_vouchers(id) ON DELETE SET NULL,
    INDEX idx_user (user_id),
    INDEX idx_guest_customer (guest_customer_id),
    INDEX idx_showtime (showtime_id),
    INDEX idx_status (status),
    INDEX idx_created (created_at),
    INDEX idx_booking_code (booking_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Vé Xem Phim (CẬP NHẬT - Tích hợp logic HOLDING)
CREATE TABLE tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    seat_id INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    ticket_code VARCHAR(50) NOT NULL UNIQUE COMMENT 'QR Code unique',
    status ENUM('HOLDING', 'SOLD', 'USED', 'REFUNDED') DEFAULT 'HOLDING' COMMENT 'HOLDING = đang giữ chỗ',
    hold_expires_at DATETIME NULL COMMENT 'Thời gian hết hạn giữ ghế (10 phút)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (seat_id) REFERENCES seats(id) ON DELETE RESTRICT,
    INDEX idx_booking (booking_id),
    INDEX idx_seat_status (seat_id, status),
    INDEX idx_ticket_code (ticket_code),
    INDEX idx_hold_expires (hold_expires_at, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Lịch Sử Duyệt Vé Tại Cổng
CREATE TABLE ticket_scan_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    ticket_code_input VARCHAR(50) NOT NULL,
    scanned_by_user_id INT NULL COMMENT 'User staff duyệt vào cổng',
    scan_result ENUM('APPROVED') NOT NULL DEFAULT 'APPROVED',
    note VARCHAR(255) NULL,
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (scanned_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_booking_scan_time (booking_id, scanned_at),
    INDEX idx_scanned_by (scanned_by_user_id),
    INDEX idx_ticket_code_input (ticket_code_input)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Bắp Nước
CREATE TABLE concessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    image_url VARCHAR(500),
    category VARCHAR(100) COMMENT 'Popcorn/Drink/Combo',
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Tồn Kho Bắp Nước Theo Rạp
CREATE TABLE cinema_concession_inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cinema_id INT NOT NULL,
    concession_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cinema_concession (cinema_id, concession_id),
    CONSTRAINT fk_cci_cinema FOREIGN KEY (cinema_id) REFERENCES cinemas(id) ON DELETE CASCADE,
    CONSTRAINT fk_cci_concession FOREIGN KEY (concession_id) REFERENCES concessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Khởi tạo tồn kho mặc định cho tất cả rạp x sản phẩm hiện có
INSERT INTO cinema_concession_inventory (cinema_id, concession_id, quantity)
SELECT c.id, co.id, 100
FROM cinemas c
CROSS JOIN concessions co;

-- Bảng Chi Tiết Bắp Nước trong Booking
CREATE TABLE booking_concessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    concession_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    price DECIMAL(10,2) NOT NULL COMMENT 'Giá tại thời điểm đặt',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (concession_id) REFERENCES concessions(id) ON DELETE RESTRICT,
    INDEX idx_booking (booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- NHÓM 4: HỆ THỐNG & TƯƠNG TÁC
-- ============================================

-- Bảng Giao Dịch
CREATE TABLE transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    payment_method VARCHAR(50) NOT NULL COMMENT 'Momo/Card/Cash',
    amount DECIMAL(10,2) NOT NULL,
    transaction_code VARCHAR(100) UNIQUE,
    status ENUM('Pending', 'Success', 'Failed') DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    INDEX idx_booking (booking_id),
    INDEX idx_status (status),
    INDEX idx_transaction_code (transaction_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Đánh Giá
CREATE TABLE reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    movie_id INT NOT NULL,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending' COMMENT 'Review moderation status',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_movie (user_id, movie_id),
    INDEX idx_movie_rating (movie_id, rating),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Thông Báo
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) COMMENT 'BOOKING/PROMOTION/SYSTEM',
    target_audience ENUM('ALL', 'GUEST', 'USER', 'STAFF', 'ADMIN') NOT NULL DEFAULT 'ALL' COMMENT 'Nhóm nhận thông báo',
    target_user_id INT NULL COMMENT 'Chỉ định user nhận riêng (nếu có)',
    status ENUM('SCHEDULED', 'SENT', 'CANCELLED') NOT NULL DEFAULT 'SENT' COMMENT 'Trạng thái gửi thông báo',
    scheduled_at DATETIME NULL COMMENT 'Thời điểm hẹn gửi',
    sent_at DATETIME NULL COMMENT 'Thời điểm đã phát hành',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by INT NULL COMMENT 'Admin/Manager tạo thông báo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_target (target_audience),
    INDEX idx_target_user (target_user_id),
    INDEX idx_type_target (type, target_audience),
    INDEX idx_status_schedule (status, scheduled_at),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Theo Dõi Trạng Thái Đọc Thông Báo
CREATE TABLE notification_reads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    notification_id INT NOT NULL,
    user_id INT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT TRUE,
    read_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_notification_user (notification_id, user_id),
    INDEX idx_user_read (user_id, is_read),
    INDEX idx_notification (notification_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng Cấu Hình Hệ Thống
CREATE TABLE system_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE COMMENT 'e.g., min_vietnamese_movie_rate',
    config_value TEXT NOT NULL COMMENT 'e.g., 15',
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- DỮ LIỆU MẶC ĐỊNH: ROLES, MEMBERSHIPS, PERMISSIONS
-- ============================================

INSERT INTO roles (id, name, code, display_name, description, base_role, is_system, is_active) VALUES
(1, 'Guest', 'SYSTEM_GUEST', 'Khách vãng lai', 'Khách vãng lai chưa đăng nhập, chỉ xem phim, lịch chiếu và thông tin công khai', 'guest', 1, 1),
(2, 'Member', 'SYSTEM_MEMBER', 'Thành viên', 'Khách hàng có tài khoản thành viên, đặt vé trực tuyến, tích điểm và nhận ưu đãi', 'member', 1, 1),
(3, 'Staff', 'SYSTEM_STAFF', 'Nhân viên quầy', 'Nhân viên vận hành tại cụm rạp: bán vé tại quầy, quét vé và quản lý bắp nước', 'staff', 1, 1),
(4, 'Manager', 'SYSTEM_MANAGER', 'Quản lý rạp', 'Quản lý cụm rạp: xếp lịch chiếu, quản lý phòng chiếu, thống kê doanh thu cơ sở', 'manager', 1, 1),
(5, 'Admin', 'SYSTEM_ADMIN', 'Quản trị viên tối cao', 'Quản trị viên toàn quyền hệ thống (Super Admin). Có quyền truy cập tất cả tính năng', 'admin', 1, 1);

INSERT INTO memberships (id, rank_name, min_points_required, discount_rate) VALUES
(1, 'Bronze', 0, 0.00),
(2, 'Silver', 1000, 3.00),
(3, 'Gold', 3000, 5.00),
(4, 'Platinum', 7000, 8.00);

-- MODULE: MOVIES
INSERT INTO permissions (name, display_name, description, module) VALUES
('movies.view', 'Xem danh sách phim', 'Xem danh sách và chi tiết phim', 'movies'),
('movies.create', 'Tạo phim', 'Thêm phim mới vào hệ thống', 'movies'),
('movies.update', 'Cập nhật phim', 'Chỉnh sửa thông tin phim', 'movies'),
('movies.delete', 'Xóa phim', 'Xóa phim khỏi hệ thống', 'movies'),
('movies.upload_poster', 'Upload poster', 'Upload/thay đổi poster phim', 'movies'),
('movies.import', 'Import phim hàng loạt', 'Import nhiều phim cùng lúc', 'movies');

-- MODULE: USERS
INSERT INTO permissions (name, display_name, description, module) VALUES
('users.view_all', 'Xem tất cả users', 'Xem danh sách tất cả người dùng', 'users'),
('users.create', 'Tạo user', 'Tạo tài khoản người dùng mới', 'users'),
('users.update_all', 'Cập nhật tất cả users', 'Chỉnh sửa thông tin bất kỳ user nào', 'users'),
('users.delete', 'Xóa user', 'Xóa tài khoản người dùng', 'users'),
('users.change_role', 'Thay đổi role', 'Thay đổi vai trò của user', 'users'),
('users.view_own', 'Xem profile cá nhân', 'Xem và chỉnh sửa profile của chính mình', 'users');

-- MODULE: CINEMAS
INSERT INTO permissions (name, display_name, description, module) VALUES
('cinemas.view', 'Xem danh sách rạp', 'Xem thông tin các rạp chiếu', 'cinemas'),
('cinemas.create', 'Tạo rạp', 'Thêm rạp chiếu mới', 'cinemas'),
('cinemas.update', 'Cập nhật rạp', 'Chỉnh sửa thông tin rạp', 'cinemas'),
('cinemas.delete', 'Xóa rạp', 'Xóa rạp khỏi hệ thống', 'cinemas');

-- MODULE: HALLS
INSERT INTO permissions (name, display_name, description, module) VALUES
('halls.view', 'Xem phòng chiếu', 'Xem thông tin phòng chiếu', 'halls'),
('halls.create', 'Tạo phòng chiếu', 'Thêm phòng chiếu mới', 'halls'),
('halls.update', 'Cập nhật phòng chiếu', 'Chỉnh sửa thông tin phòng', 'halls'),
('halls.delete', 'Xóa phòng chiếu', 'Xóa phòng chiếu', 'halls'),
('halls.manage_layout', 'Quản lý layout ghế', 'Thiết lập sơ đồ ghế ngồi', 'halls');

-- MODULE: SHOWTIMES
INSERT INTO permissions (name, display_name, description, module) VALUES
('showtimes.view', 'Xem suất chiếu', 'Xem lịch chiếu phim', 'showtimes'),
('showtimes.create', 'Tạo suất chiếu', 'Thêm suất chiếu mới', 'showtimes'),
('showtimes.update', 'Cập nhật suất chiếu', 'Chỉnh sửa lịch chiếu', 'showtimes'),
('showtimes.delete', 'Xóa suất chiếu', 'Xóa suất chiếu', 'showtimes'),
('showtimes.auto_generate', 'Tự động tạo suất chiếu', 'Tạo lịch chiếu tự động', 'showtimes');

-- MODULE: BOOKINGS
INSERT INTO permissions (name, display_name, description, module) VALUES
('bookings.view_own', 'Xem booking cá nhân', 'Xem các booking của chính mình', 'bookings'),
('bookings.view_all', 'Xem tất cả bookings', 'Xem tất cả bookings trong hệ thống', 'bookings'),
('bookings.create', 'Tạo booking', 'Đặt vé mới', 'bookings'),
('bookings.update', 'Cập nhật booking', 'Chỉnh sửa booking', 'bookings'),
('bookings.cancel', 'Hủy booking', 'Hủy đặt vé', 'bookings'),
('bookings.refund', 'Hoàn tiền', 'Hoàn tiền cho booking', 'bookings'),
('bookings.pos', 'Bán vé POS', 'Bán vé tại quầy', 'bookings');

-- MODULE: TICKETS
INSERT INTO permissions (name, display_name, description, module) VALUES
('tickets.view_own', 'Xem vé cá nhân', 'Xem vé của chính mình', 'tickets'),
('tickets.view_all', 'Xem tất cả vé', 'Xem tất cả vé trong hệ thống', 'tickets'),
('tickets.scan', 'Scan vé', 'Scan QR code vé tại cổng', 'tickets'),
('tickets.approve_entry', 'Duyệt vào cổng', 'Cho phép khách vào rạp', 'tickets');

-- MODULE: TRANSACTIONS
INSERT INTO permissions (name, display_name, description, module) VALUES
('transactions.view_own', 'Xem giao dịch cá nhân', 'Xem lịch sử giao dịch của mình', 'transactions'),
('transactions.view_all', 'Xem tất cả giao dịch', 'Xem tất cả giao dịch', 'transactions'),
('transactions.process', 'Xử lý thanh toán', 'Xử lý các giao dịch thanh toán', 'transactions');

-- MODULE: REPORTS
INSERT INTO permissions (name, display_name, description, module) VALUES
('reports.dashboard', 'Xem dashboard', 'Xem bảng điều khiển thống kê', 'reports'),
('reports.revenue', 'Báo cáo doanh thu', 'Xem báo cáo doanh thu', 'reports'),
('reports.occupancy', 'Báo cáo công suất', 'Xem báo cáo tỷ lệ lấp đầy', 'reports'),
('reports.export', 'Export báo cáo', 'Xuất báo cáo ra file', 'reports');

-- MODULE: PROMOTIONS
INSERT INTO permissions (name, display_name, description, module) VALUES
('promotions.view', 'Xem khuyến mãi', 'Xem danh sách khuyến mãi', 'promotions'),
('promotions.create', 'Tạo khuyến mãi', 'Tạo chương trình khuyến mãi', 'promotions'),
('promotions.update', 'Cập nhật khuyến mãi', 'Chỉnh sửa khuyến mãi', 'promotions'),
('promotions.delete', 'Xóa khuyến mãi', 'Xóa khuyến mãi', 'promotions');

-- MODULE: CONCESSIONS
INSERT INTO permissions (name, display_name, description, module) VALUES
('concessions.view', 'Xem đồ ăn/nước', 'Xem menu đồ ăn nước', 'concessions'),
('concessions.create', 'Tạo món mới', 'Thêm món ăn/nước mới', 'concessions'),
('concessions.update', 'Cập nhật món', 'Chỉnh sửa thông tin món', 'concessions'),
('concessions.delete', 'Xóa món', 'Xóa món khỏi menu', 'concessions'),
('concessions.import', 'Import hàng loạt', 'Import nhiều món cùng lúc', 'concessions');

-- MODULE: REVIEWS
INSERT INTO permissions (name, display_name, description, module) VALUES
('reviews.view', 'Xem đánh giá', 'Xem đánh giá phim', 'reviews'),
('reviews.view_all', 'Xem tất cả đánh giá', 'Xem tất cả đánh giá (Admin)', 'reviews'),
('reviews.create', 'Viết đánh giá', 'Viết đánh giá phim', 'reviews'),
('reviews.update_own', 'Sửa đánh giá của mình', 'Chỉnh sửa đánh giá đã viết', 'reviews'),
('reviews.delete_any', 'Xóa bất kỳ đánh giá', 'Xóa đánh giá của người khác', 'reviews'),
('reviews.delete_own', 'Xóa đánh giá của mình', 'Xóa đánh giá do chính mình viết', 'reviews'),
('reviews.approve', 'Duyệt đánh giá', 'Duyệt đánh giá phim', 'reviews'),
('reviews.reject', 'Từ chối đánh giá', 'Từ chối đánh giá phim', 'reviews'),
('reviews.report', 'Report đánh giá', 'Báo cáo đánh giá vi phạm', 'reviews');

-- MODULE: SYSTEM
INSERT INTO permissions (name, display_name, description, module) VALUES
('system.settings', 'Quản lý cấu hình', 'Thay đổi cấu hình hệ thống', 'system'),
('system.permissions', 'Quản lý quyền hạn', 'Quản lý permissions và gán cho roles', 'system'),
('system.roles', 'Quản lý roles', 'Tạo/sửa/xóa roles', 'system');

-- GÁN PERMISSIONS MẶC ĐỊNH CHO CÁC ROLES
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE name IN (
    'movies.view',
    'cinemas.view',
    'showtimes.view',
    'promotions.view',
    'concessions.view',
    'reviews.view'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE name IN (
    'movies.view',
    'cinemas.view',
    'showtimes.view',
    'promotions.view',
    'concessions.view',
    'reviews.view',
    'users.view_own',
    'bookings.view_own',
    'bookings.create',
    'bookings.cancel',
    'transactions.view_own',
    'transactions.process',
    'reviews.create',
    'reviews.update_own',
    'reviews.delete_own'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE name IN (
    'movies.view',
    'cinemas.view',
    'showtimes.view',
    'promotions.view',
    'concessions.view',
    'reviews.view',
    'users.view_own',
    'bookings.view_own',
    'bookings.create',
    'bookings.cancel',
    'tickets.view_own',
    'transactions.view_own',
    'bookings.view_all',
    'bookings.pos',
    'tickets.scan',
    'tickets.approve_entry',
    'transactions.process'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT 4, id FROM permissions WHERE name IN (
    'movies.view',
    'cinemas.view',
    'halls.view',
    'showtimes.view',
    'promotions.view',
    'concessions.view',
    'reviews.view',
    'users.view_own',
    'bookings.view_own',
    'bookings.view_all',
    'bookings.create',
    'bookings.cancel',
    'bookings.pos',
    'tickets.view_own',
    'tickets.scan',
    'tickets.approve_entry',
    'transactions.view_own',
    'transactions.view_all',
    'transactions.process',
    'movies.create',
    'movies.update',
    'showtimes.create',
    'showtimes.update',
    'showtimes.delete',
    'showtimes.auto_generate',
    'promotions.create',
    'promotions.update',
    'concessions.create',
    'concessions.update',
    'concessions.delete',
    'reports.dashboard',
    'reports.revenue',
    'reports.occupancy',
    'reports.export',
    'reviews.view_all',
    'reviews.delete_any',
    'reviews.approve',
    'reviews.reject'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT 5, id FROM permissions;

-- ============================================
-- VIEW HỖ TRỢ QUẢN LÝ PHÂN QUYỀN
-- ============================================

CREATE OR REPLACE VIEW vw_role_permissions AS
SELECT
    r.id AS role_id,
    r.name AS role_name,
    p.id AS permission_id,
    p.name AS permission_name,
    p.display_name AS permission_display_name,
    p.module AS permission_module
FROM roles r
LEFT JOIN role_permissions rp ON r.id = rp.role_id
LEFT JOIN permissions p ON rp.permission_id = p.id
ORDER BY r.id, p.module, p.name;

CREATE OR REPLACE VIEW vw_role_permission_count AS
SELECT
    r.id AS role_id,
    r.name AS role_name,
    COUNT(rp.permission_id) AS permission_count
FROM roles r
LEFT JOIN role_permissions rp ON r.id = rp.role_id
GROUP BY r.id, r.name
ORDER BY r.id;

-- ============================================
-- TRIGGER: Tự động cập nhật current_points khi có loyalty_history
-- ============================================
DELIMITER $$
CREATE TRIGGER after_loyalty_insert
AFTER INSERT ON loyalty_history
FOR EACH ROW
BEGIN
    UPDATE users 
    SET current_points = current_points + NEW.points_change
    WHERE id = NEW.user_id;
END$$
DELIMITER ;

-- ============================================
-- TRIGGER: Tự động hủy tickets HOLDING quá hạn
-- ============================================
DELIMITER $$
CREATE EVENT expire_holding_tickets
ON SCHEDULE EVERY 1 MINUTE
DO
BEGIN
    UPDATE tickets
    SET status = 'REFUNDED'
    WHERE status = 'HOLDING' 
    AND hold_expires_at < NOW();
    
    -- Update booking status nếu tất cả tickets đều REFUNDED
    UPDATE bookings b
    SET b.status = 'Expired'
    WHERE b.status = 'Pending'
    AND NOT EXISTS (
        SELECT 1 FROM tickets t 
        WHERE t.booking_id = b.id 
        AND t.status IN ('HOLDING', 'SOLD')
    );
END$$
DELIMITER ;

SET GLOBAL event_scheduler = ON;

-- ============================================
-- INDEX bổ sung cho performance
-- ============================================
CREATE INDEX idx_movies_showing ON movies(status, release_date);
CREATE INDEX idx_showtimes_datetime ON showtimes(start_time, end_time);
CREATE INDEX idx_bookings_user_date ON bookings(user_id, created_at DESC);

-- ============================================
-- CINEMA MANAGER MODULE - 2026-03-29
-- Ghi chú:
--   cinemas.manager_id (INT NULL FK -> users) đã tồn tại từ schema gốc
--   Manager được nhận dạng bằng role_id = 4 (Manager)
--   Cinema được tìm theo: SELECT * FROM cinemas WHERE manager_id = :user_id
--   JWT payload khi login sẽ có thêm cinema_id (nếu user là Manager)
-- Migration thêm: /database/migrations/add_manager_module.sql
-- ============================================

