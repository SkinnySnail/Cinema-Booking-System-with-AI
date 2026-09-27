-- Migration: Dynamic RBAC system (roles, user_roles, permission_audit_logs)
USE galaxy_cinema;

-- 1. Cập nhật bảng roles
ALTER TABLE roles 
    ADD COLUMN IF NOT EXISTS code VARCHAR(50) NULL AFTER name,
    ADD COLUMN IF NOT EXISTS display_name VARCHAR(100) NULL AFTER code,
    ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER display_name,
    ADD COLUMN IF NOT EXISTS base_role ENUM('admin', 'manager', 'staff', 'member', 'guest') NOT NULL DEFAULT 'staff' AFTER description,
    ADD COLUMN IF NOT EXISTS is_system TINYINT NOT NULL DEFAULT 0 AFTER base_role,
    ADD COLUMN IF NOT EXISTS is_active TINYINT NOT NULL DEFAULT 1 AFTER is_system,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER is_active;

-- Cập nhật dữ liệu cho 5 roles hệ thống mặc định
UPDATE roles SET 
    code = 'SYSTEM_GUEST', 
    display_name = 'Khách vãng lai', 
    description = 'Khách vãng lai chưa đăng nhập, chỉ có thể xem phim, lịch chiếu và thông tin công khai.',
    base_role = 'guest',
    is_system = 1,
    is_active = 1
WHERE id = 1;

UPDATE roles SET 
    code = 'SYSTEM_MEMBER', 
    display_name = 'Thành viên', 
    description = 'Khách hàng có tài khoản thành viên, đặt vé trực tuyến, tích điểm và nhận ưu đãi.',
    base_role = 'member',
    is_system = 1,
    is_active = 1
WHERE id = 2;

UPDATE roles SET 
    code = 'SYSTEM_STAFF', 
    display_name = 'Nhân viên quầy', 
    description = 'Nhân viên vận hành tại cụm rạp: bán vé tại quầy, quét mã vé, bán bắp nước.',
    base_role = 'staff',
    is_system = 1,
    is_active = 1
WHERE id = 3;

UPDATE roles SET 
    code = 'SYSTEM_MANAGER', 
    display_name = 'Quản lý rạp', 
    description = 'Quản lý cụm rạp: xếp lịch chiếu, quản lý phòng chiếu, theo dõi tồn kho bắp nước và báo cáo.',
    base_role = 'manager',
    is_system = 1,
    is_active = 1
WHERE id = 4;

UPDATE roles SET 
    code = 'SYSTEM_ADMIN', 
    display_name = 'Quản trị viên tối cao', 
    description = 'Quản trị viên toàn quyền hệ thống (Super Admin). Có toàn bộ quyền kiểm soát.',
    base_role = 'admin',
    is_system = 1,
    is_active = 1
WHERE id = 5;

-- 2. Tạo bảng user_roles (Many-to-Many cho phép 1 user có nhiều vai trò)
CREATE TABLE IF NOT EXISTS user_roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    role_id INT NOT NULL,
    is_primary TINYINT NOT NULL DEFAULT 0 COMMENT '1=Vai trò chính mặc định của tài khoản, 0=Vai trò phụ bổ sung',
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by INT NULL,
    reason TEXT NULL,
    UNIQUE KEY unique_user_role (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_role (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Di chuyển dữ liệu users.role_id hiện có sang user_roles
INSERT IGNORE INTO user_roles (user_id, role_id, is_primary, assigned_at)
SELECT id, role_id, 1, NOW() FROM users WHERE role_id IS NOT NULL;

-- 3. Tạo bảng permission_audit_logs (Ghi nhật ký kiểm toán phân quyền)
CREATE TABLE IF NOT EXISTS permission_audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    actor_id INT NULL COMMENT 'User ID người thực hiện',
    actor_name VARCHAR(100) NULL COMMENT 'Tên / Email người thực hiện',
    action VARCHAR(50) NOT NULL COMMENT 'ROLE_CREATE, ROLE_UPDATE, ROLE_DELETE, USER_ROLES_ASSIGN, PERMISSIONS_SYNC',
    target_type VARCHAR(30) NOT NULL COMMENT 'USER, ROLE, SYSTEM',
    target_id INT NULL,
    target_name VARCHAR(150) NULL,
    reason TEXT NULL,
    old_value JSON NULL,
    new_value JSON NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_actor (actor_id),
    INDEX idx_target (target_type, target_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
