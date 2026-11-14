-- ============================================
-- Galaxy Cinema - Sample Data
-- Dữ liệu mẫu để test hệ thống
-- ============================================

USE galaxy_cinema;
SET NAMES utf8mb4;

-- ============================================
-- 1. ROLES & MEMBERSHIPS
-- ============================================
INSERT INTO roles (id, name, code, display_name, description, base_role, is_system, is_active) VALUES
(1, 'Guest', 'SYSTEM_GUEST', 'Khách vãng lai', 'Khách vãng lai chưa đăng nhập, chỉ xem phim, lịch chiếu và thông tin công khai', 'guest', 1, 1),
(2, 'Member', 'SYSTEM_MEMBER', 'Thành viên', 'Khách hàng có tài khoản thành viên, đặt vé trực tuyến, tích điểm và nhận ưu đãi', 'member', 1, 1),
(3, 'Staff', 'SYSTEM_STAFF', 'Nhân viên quầy', 'Nhân viên vận hành tại cụm rạp: bán vé tại quầy, quét vé và quản lý bắp nước', 'staff', 1, 1),
(4, 'Manager', 'SYSTEM_MANAGER', 'Quản lý rạp', 'Quản lý cụm rạp: xếp lịch chiếu, quản lý phòng chiếu, thống kê doanh thu cơ sở', 'manager', 1, 1),
(5, 'Admin', 'SYSTEM_ADMIN', 'Quản trị viên tối cao', 'Quản trị viên toàn quyền hệ thống (Super Admin). Có quyền truy cập tất cả tính năng', 'admin', 1, 1)
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), description = VALUES(description), base_role = VALUES(base_role);

INSERT IGNORE INTO memberships (rank_name, min_points_required, discount_rate) VALUES
('Bronze', 0, 0.00),
('Silver', 2000, 5.00),
('Gold', 5000, 10.00),
('Platinum', 10000, 15.00);

-- ============================================
-- 2. USERS & PROFILES
-- ============================================
INSERT INTO users (email, password_hash, role_id, status, current_points) VALUES
('admin@galaxy.vn', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 5, 'Active', 0), -- password: password
('manager@galaxy.vn', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 4, 'Active', 0),
('staff@galaxy.vn', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 3, 'Active', 0),
('nguyenvana@gmail.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 2, 'Active', 1500),
('tranthib@gmail.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 2, 'Active', 3500),
('levanc@gmail.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 2, 'Active', 12000);

INSERT INTO user_profiles (user_id, full_name, phone, dob, membership_id) VALUES
(1, 'Admin Galaxy', '0901234567', '1990-01-01', 4),
(2, 'Quản Lý Rạp', '0902345678', '1985-05-15', 3),
(3, 'Nhân Viên Quầy', '0903456789', '1995-08-20', 1),
(4, 'Nguyễn Văn A', '0904567890', '2000-03-10', 1),
(5, 'Trần Thị B', '0905678901', '1998-07-25', 2),
(6, 'Lê Văn C', '0906789012', '1988-12-05', 4);

-- Gán vai trò mặc định ban đầu cho các người dùng (user_roles)
INSERT IGNORE INTO user_roles (user_id, role_id, is_primary, reason) VALUES
(1, 5, 1, 'Vai trò quản trị viên tối cao mặc định'),
(2, 4, 1, 'Vai trò quản lý rạp mặc định'),
(3, 3, 1, 'Vai trò nhân viên quầy mặc định'),
(4, 2, 1, 'Vai trò thành viên mặc định'),
(5, 2, 1, 'Vai trò thành viên mặc định'),
(6, 2, 1, 'Vai trò thành viên mặc định');

-- ============================================
-- 3. GENRES & MOVIES
-- ============================================
INSERT INTO genres (name) VALUES
('Hành Động'),
('Hài'),
('Tình Cảm'),
('Kinh Dị'),
('Hoạt Hình'),
('Khoa Học Viễn Tưởng'),
('Tâm Lý'),
('Tài Liệu');

INSERT INTO movies (title, duration_minutes, age_rating, origin, poster_url, trailer_url, description, release_date, status) VALUES
('MAI', 135, 'T16', 'Vietnam', 'uploads/posters/MAI.jpg', 'https://youtube.com/watch?v=xyz', 'Câu chuyện về cuộc đời của Mai', '2026-02-10', 'Now Showing'),
('Đào, Phở và Piano', 110, 'K', 'Vietnam', 'uploads/posters/dao-pho-va-piano.jpg', 'https://youtube.com/watch?v=abc', 'Bối cảnh Hà Nội 1954', '2026-02-25', 'Now Showing'),
('Kung Fu Panda 4', 95, 'P', 'International', 'uploads/posters/kung-fu-panda-4.jpg', 'https://youtube.com/watch?v=def', 'Po trở lại với nhiệm vụ mới', '2026-03-08', 'Now Showing'),
('Dune: Part Two', 166, 'T13', 'International', 'uploads/posters/dune-part-two.jpg', 'https://youtube.com/watch?v=ghi', 'Hành trình báo thù của Paul Atreides', '2026-03-01', 'Now Showing'),
('Godzilla x Kong', 115, 'T13', 'International', 'uploads/posters/Godzilla_vs_Kong_VN_poster.jpg', 'https://youtube.com/watch?v=jkl', 'Hai titan đại chiến', '2026-03-29', 'Coming Soon'),
('Lật Mặt 7', 140, 'T16', 'Vietnam', 'uploads/posters/LatMat7.jpg', 'https://youtube.com/watch?v=mno', 'Phần tiếp theo của Lật Mặt', '2026-04-26', 'Coming Soon');

INSERT INTO movie_genres (movie_id, genre_id) VALUES
(1, 3), (1, 7), -- MAI: Tình cảm, Tâm lý
(2, 3), (2, 7), -- Đào Phở: Tình cảm, Tâm lý
(3, 1), (3, 5), (3, 2), -- Kung Fu Panda: Hành động, Hoạt hình, Hài
(4, 1), (4, 6), -- Dune: Hành động, Khoa học viễn tưởng
(5, 1), (5, 6), -- Godzilla: Hành động, Khoa học viễn tưởng
(6, 1), (6, 7); -- Lật Mặt: Hành động, Tâm lý

-- ============================================
-- 4. CINEMAS, HALLS, SEAT TYPES, SEATS
-- ============================================
INSERT INTO cinemas (name, address, street, district, city, lat, lng, hotline, manager_id) VALUES
('Galaxy Nguyễn Du', '116 Nguyễn Du, Q.1, TP.HCM', '116 Nguyễn Du', 'Quận 1', 'TP. Hồ Chí Minh', 10.77662000, 106.69322000, '1900 2224', 2),
('Galaxy Tân Bình', '246 Nguyễn Hồng Đào, Q.Tân Bình, TP.HCM', '246 Nguyễn Hồng Đào', 'Quận Tân Bình', 'TP. Hồ Chí Minh', 10.79365000, 106.64158000, '1900 2224', 2),
('Galaxy Kinh Dương Vương', '718bis Kinh Dương Vương, Q.6, TP.HCM', '718bis Kinh Dương Vương', 'Quận 6', 'TP. Hồ Chí Minh', 10.74850000, 106.62680000, '1900 2224', NULL);

INSERT INTO cinema_halls (cinema_id, name, total_seats) VALUES
(1, 'Phòng 1', 120),
(1, 'Phòng 2', 120),
(1, 'IMAX', 150),
(2, 'Phòng 1', 100),
(2, '4DX', 80),
(3, 'Phòng 1', 120);

INSERT INTO seat_types (name, price_multiplier) VALUES
('Standard', 1.00),
('VIP', 1.50),
('Sweetbox', 2.00);

-- ============================================
-- GENERATE SEATS FOR ALL HALLS
-- ============================================

-- Hall 1: Phòng 1 - Galaxy Nguyễn Du (120 seats: 12 rows x 10 seats)
INSERT INTO seats (cinema_hall_id, row_code, number, seat_type_id, status)
SELECT 
    1 as cinema_hall_id,
    row_code,
    number,
    CASE 
        WHEN row_code IN ('F', 'G') AND number BETWEEN 4 AND 7 THEN 2 -- VIP
        WHEN row_code = 'H' AND number BETWEEN 5 AND 6 THEN 3 -- Sweetbox
        ELSE 1 -- Standard
    END as seat_type_id,
    'Active' as status
FROM 
    (SELECT 'A' as row_code UNION SELECT 'B' UNION SELECT 'C' UNION SELECT 'D' 
     UNION SELECT 'E' UNION SELECT 'F' UNION SELECT 'G' UNION SELECT 'H'
     UNION SELECT 'I' UNION SELECT 'J' UNION SELECT 'K' UNION SELECT 'L') AS row_codes
CROSS JOIN
    (SELECT 1 as number UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
     UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10) AS seat_numbers
ORDER BY row_code, number;

-- Hall 2: Phòng 2 - Galaxy Nguyễn Du (120 seats: 12 rows x 10 seats)
INSERT INTO seats (cinema_hall_id, row_code, number, seat_type_id, status)
SELECT 
    2 as cinema_hall_id,
    row_code,
    number,
    CASE 
        WHEN row_code IN ('G', 'H') AND number BETWEEN 3 AND 8 THEN 2 -- VIP
        ELSE 1 -- Standard
    END as seat_type_id,
    'Active' as status
FROM 
    (SELECT 'A' as row_code UNION SELECT 'B' UNION SELECT 'C' UNION SELECT 'D' 
     UNION SELECT 'E' UNION SELECT 'F' UNION SELECT 'G' UNION SELECT 'H'
     UNION SELECT 'I' UNION SELECT 'J' UNION SELECT 'K' UNION SELECT 'L') AS row_codes
CROSS JOIN
    (SELECT 1 as number UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
     UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10) AS seat_numbers
ORDER BY row_code, number;

-- Hall 3: IMAX - Galaxy Nguyễn Du (150 seats: 15 rows x 10 seats)
INSERT INTO seats (cinema_hall_id, row_code, number, seat_type_id, status)
SELECT 
    3 as cinema_hall_id,
    row_code,
    number,
    CASE 
        WHEN row_code IN ('H', 'I', 'J', 'K') AND number BETWEEN 3 AND 8 THEN 2 -- VIP (IMAX Premium)
        ELSE 1 -- Standard
    END as seat_type_id,
    'Active' as status
FROM 
    (SELECT 'A' as row_code UNION SELECT 'B' UNION SELECT 'C' UNION SELECT 'D' 
     UNION SELECT 'E' UNION SELECT 'F' UNION SELECT 'G' UNION SELECT 'H'
     UNION SELECT 'I' UNION SELECT 'J' UNION SELECT 'K' UNION SELECT 'L'
     UNION SELECT 'M' UNION SELECT 'N' UNION SELECT 'O') AS row_codes
CROSS JOIN
    (SELECT 1 as number UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
     UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10) AS seat_numbers
ORDER BY row_code, number;

-- Hall 4: Phòng 1 - Galaxy Tân Bình (100 seats: 10 rows x 10 seats)
INSERT INTO seats (cinema_hall_id, row_code, number, seat_type_id, status)
SELECT 
    4 as cinema_hall_id,
    row_code,
    number,
    CASE 
        WHEN row_code IN ('E', 'F', 'G') AND number BETWEEN 4 AND 7 THEN 2 -- VIP
        ELSE 1 -- Standard
    END as seat_type_id,
    'Active' as status
FROM 
    (SELECT 'A' as row_code UNION SELECT 'B' UNION SELECT 'C' UNION SELECT 'D' 
     UNION SELECT 'E' UNION SELECT 'F' UNION SELECT 'G' UNION SELECT 'H'
     UNION SELECT 'I' UNION SELECT 'J') AS row_codes
CROSS JOIN
    (SELECT 1 as number UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
     UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10) AS seat_numbers
ORDER BY row_code, number;

-- Hall 5: 4DX - Galaxy Tân Bình (80 seats: 8 rows x 10 seats)
INSERT INTO seats (cinema_hall_id, row_code, number, seat_type_id, status)
SELECT 
    5 as cinema_hall_id,
    row_code,
    number,
    CASE 
        WHEN row_code IN ('E', 'F') AND number BETWEEN 3 AND 8 THEN 2 -- VIP (4DX Premium)
        ELSE 1 -- Standard
    END as seat_type_id,
    'Active' as status
FROM 
    (SELECT 'A' as row_code UNION SELECT 'B' UNION SELECT 'C' UNION SELECT 'D' 
     UNION SELECT 'E' UNION SELECT 'F' UNION SELECT 'G' UNION SELECT 'H') AS row_codes
CROSS JOIN
    (SELECT 1 as number UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
     UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10) AS seat_numbers
ORDER BY row_code, number;

-- Hall 6: Phòng 1 - Galaxy Kinh Dương Vương (120 seats: 12 rows x 10 seats)
INSERT INTO seats (cinema_hall_id, row_code, number, seat_type_id, status)
SELECT 
    6 as cinema_hall_id,
    row_code,
    number,
    CASE 
        WHEN row_code IN ('F', 'G', 'H') AND number BETWEEN 4 AND 7 THEN 2 -- VIP
        WHEN row_code = 'I' AND number BETWEEN 5 AND 6 THEN 3 -- Sweetbox
        ELSE 1 -- Standard
    END as seat_type_id,
    'Active' as status
FROM 
    (SELECT 'A' as row_code UNION SELECT 'B' UNION SELECT 'C' UNION SELECT 'D' 
     UNION SELECT 'E' UNION SELECT 'F' UNION SELECT 'G' UNION SELECT 'H'
     UNION SELECT 'I' UNION SELECT 'J' UNION SELECT 'K' UNION SELECT 'L') AS row_codes
CROSS JOIN
    (SELECT 1 as number UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
     UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10) AS seat_numbers
ORDER BY row_code, number;

-- ============================================
-- 5. SHOWTIMES
-- ============================================
INSERT INTO showtimes (movie_id, cinema_hall_id, start_time, end_time) VALUES
-- ===== GALAXY NGUYỄN DU (Cinema 1) =====
-- Phòng 1 (Hall 1)
-- MAI - Hôm nay (23/02/2026)
(1, 1, '2026-02-23 10:00:00', '2026-02-23 12:15:00'),
(1, 1, '2026-02-23 14:30:00', '2026-02-23 16:45:00'),
(1, 1, '2026-02-23 19:00:00', '2026-02-23 21:15:00'),
(1, 1, '2026-02-23 21:30:00', '2026-02-23 23:45:00'),

-- Kung Fu Panda 4 - Hôm nay
(3, 1, '2026-02-23 09:00:00', '2026-02-23 10:35:00'),
(3, 1, '2026-02-23 13:00:00', '2026-02-23 14:35:00'),
(3, 1, '2026-02-23 17:00:00', '2026-02-23 18:35:00'),

-- MAI - Ngày mai (24/02/2026)
(1, 1, '2026-02-24 10:30:00', '2026-02-24 12:45:00'),
(1, 1, '2026-02-24 15:00:00', '2026-02-24 17:15:00'),
(1, 1, '2026-02-24 20:00:00', '2026-02-24 22:15:00'),

-- Đào, Phở và Piano - Ngày mai
(2, 1, '2026-02-24 09:00:00', '2026-02-24 10:50:00'),
(2, 1, '2026-02-24 13:00:00', '2026-02-24 14:50:00'),
(2, 1, '2026-02-24 18:00:00', '2026-02-24 19:50:00'),

-- Phòng 2 (Hall 2)
-- Dune: Part Two - Hôm nay
(4, 2, '2026-02-23 10:00:00', '2026-02-23 12:46:00'),
(4, 2, '2026-02-23 14:00:00', '2026-02-23 16:46:00'),
(4, 2, '2026-02-23 18:00:00', '2026-02-23 20:46:00'),
(4, 2, '2026-02-23 21:00:00', '2026-02-23 23:46:00'),

-- Kung Fu Panda 4 - Ngày mai
(3, 2, '2026-02-24 09:30:00', '2026-02-24 11:05:00'),
(3, 2, '2026-02-24 13:30:00', '2026-02-24 15:05:00'),
(3, 2, '2026-02-24 17:30:00', '2026-02-24 19:05:00'),
(3, 2, '2026-02-24 20:30:00', '2026-02-24 22:05:00'),

-- IMAX (Hall 3)
-- Dune: Part Two - Hôm nay & ngày mai (chiếu đặc biệt IMAX)
(4, 3, '2026-02-23 11:00:00', '2026-02-23 13:46:00'),
(4, 3, '2026-02-23 15:00:00', '2026-02-23 17:46:00'),
(4, 3, '2026-02-23 19:00:00', '2026-02-23 21:46:00'),
(4, 3, '2026-02-24 12:00:00', '2026-02-24 14:46:00'),
(4, 3, '2026-02-24 16:00:00', '2026-02-24 18:46:00'),
(4, 3, '2026-02-24 20:00:00', '2026-02-24 22:46:00'),

-- ===== GALAXY TÂN BÌNH (Cinema 2) =====
-- Phòng 1 (Hall 4)
-- MAI - Hôm nay
(1, 4, '2026-02-23 10:30:00', '2026-02-23 12:45:00'),
(1, 4, '2026-02-23 15:00:00', '2026-02-23 17:15:00'),
(1, 4, '2026-02-23 19:30:00', '2026-02-23 21:45:00'),

-- Đào, Phở và Piano - Hôm nay
(2, 4, '2026-02-23 09:00:00', '2026-02-23 10:50:00'),
(2, 4, '2026-02-23 13:00:00', '2026-02-23 14:50:00'),
(2, 4, '2026-02-23 17:30:00', '2026-02-23 19:20:00'),

-- Kung Fu Panda 4 - Ngày mai
(3, 4, '2026-02-24 09:00:00', '2026-02-24 10:35:00'),
(3, 4, '2026-02-24 11:00:00', '2026-02-24 12:35:00'),
(3, 4, '2026-02-24 14:00:00', '2026-02-24 15:35:00'),
(3, 4, '2026-02-24 16:00:00', '2026-02-24 17:35:00'),

-- 4DX (Hall 5)
-- Dune: Part Two - Hôm nay (4DX Special)
(4, 5, '2026-02-23 11:00:00', '2026-02-23 13:46:00'),
(4, 5, '2026-02-23 15:00:00', '2026-02-23 17:46:00'),
(4, 5, '2026-02-23 19:00:00', '2026-02-23 21:46:00'),

-- Kung Fu Panda 4 - Ngày mai (4DX Special)
(3, 5, '2026-02-24 10:00:00', '2026-02-24 11:35:00'),
(3, 5, '2026-02-24 13:00:00', '2026-02-24 14:35:00'),
(3, 5, '2026-02-24 15:30:00', '2026-02-24 17:05:00'),
(3, 5, '2026-02-24 18:00:00', '2026-02-24 19:35:00'),

-- ===== GALAXY KINH DƯƠNG VƯƠNG (Cinema 3) =====
-- Phòng 1 (Hall 6)
-- MAI - Hôm nay
(1, 6, '2026-02-23 10:00:00', '2026-02-23 12:15:00'),
(1, 6, '2026-02-23 14:00:00', '2026-02-23 16:15:00'),
(1, 6, '2026-02-23 18:00:00', '2026-02-23 20:15:00'),
(1, 6, '2026-02-23 21:00:00', '2026-02-23 23:15:00'),

-- Đào, Phở và Piano - Ngày mai
(2, 6, '2026-02-24 09:30:00', '2026-02-24 11:20:00'),
(2, 6, '2026-02-24 13:30:00', '2026-02-24 15:20:00'),
(2, 6, '2026-02-24 17:30:00', '2026-02-24 19:20:00'),
(2, 6, '2026-02-24 20:30:00', '2026-02-24 22:20:00'),

-- Dune: Part Two - Ngày 25/02
(4, 6, '2026-02-25 11:00:00', '2026-02-25 13:46:00'),
(4, 6, '2026-02-25 15:00:00', '2026-02-25 17:46:00'),
(4, 6, '2026-02-25 19:00:00', '2026-02-25 21:46:00'),

-- Kung Fu Panda 4 - Ngày 25/02
(3, 6, '2026-02-25 09:00:00', '2026-02-25 10:35:00'),
(3, 6, '2026-02-25 13:00:00', '2026-02-25 14:35:00'),
(3, 6, '2026-02-25 17:00:00', '2026-02-25 18:35:00'),

-- ===== SUẤT CHIẾU CUỐI TUẦN (26-27/02) =====
-- Galaxy Nguyễn Du
(1, 1, '2026-02-26 09:00:00', '2026-02-26 11:15:00'),
(1, 1, '2026-02-26 12:00:00', '2026-02-26 14:15:00'),
(1, 1, '2026-02-26 15:00:00', '2026-02-26 17:15:00'),
(1, 1, '2026-02-26 18:00:00', '2026-02-26 20:15:00'),
(1, 1, '2026-02-26 21:00:00', '2026-02-26 23:15:00'),

(3, 2, '2026-02-26 09:00:00', '2026-02-26 10:35:00'),
(3, 2, '2026-02-26 11:00:00', '2026-02-26 12:35:00'),
(3, 2, '2026-02-26 13:00:00', '2026-02-26 14:35:00'),
(3, 2, '2026-02-26 15:00:00', '2026-02-26 16:35:00'),
(3, 2, '2026-02-26 17:00:00', '2026-02-26 18:35:00'),
(3, 2, '2026-02-26 19:00:00', '2026-02-26 20:35:00'),

(4, 3, '2026-02-26 10:00:00', '2026-02-26 12:46:00'),
(4, 3, '2026-02-26 14:00:00', '2026-02-26 16:46:00'),
(4, 3, '2026-02-26 18:00:00', '2026-02-26 20:46:00'),
(4, 3, '2026-02-26 22:00:00', '2026-02-27 00:46:00'),

-- Chủ nhật 27/02
(2, 1, '2026-02-27 09:00:00', '2026-02-27 10:50:00'),
(2, 1, '2026-02-27 11:30:00', '2026-02-27 13:20:00'),
(2, 1, '2026-02-27 14:00:00', '2026-02-27 15:50:00'),
(2, 1, '2026-02-27 16:30:00', '2026-02-27 18:20:00'),
(2, 1, '2026-02-27 19:00:00', '2026-02-27 20:50:00'),

(4, 2, '2026-02-27 10:00:00', '2026-02-27 12:46:00'),
(4, 2, '2026-02-27 13:30:00', '2026-02-27 16:16:00'),
(4, 2, '2026-02-27 17:00:00', '2026-02-27 19:46:00'),
(4, 2, '2026-02-27 20:30:00', '2026-02-27 23:16:00');

-- ============================================
-- 6. PRICING RULES
-- ============================================
INSERT INTO pricing_rules (condition_type, adjustment_amount, is_active) VALUES
('Weekend', 20000, TRUE),
('Before10AM', -15000, TRUE),
('Holiday', 30000, TRUE);

-- ============================================
-- 7. PROMOTIONS
-- ============================================
INSERT INTO promotions (code, description, discount_amount, discount_type, min_order_value, start_date, end_date, is_auto_apply, usage_limit) VALUES
('WELCOME2026', 'Giảm 50K cho khách hàng mới', 50000, 'FIXED', 200000, '2026-01-01', '2026-12-31', FALSE, NULL),
('BIRTHDAY', 'Voucher sinh nhật - Giảm 20%', 20, 'PERCENT', 100000, '2026-01-01', '2026-12-31', TRUE, 1),
('WEEKEND20', 'Giảm 20% cuối tuần', 20, 'PERCENT', 150000, '2026-01-01', '2026-12-31', FALSE, NULL),
('MEMBER100', 'Ưu đãi thành viên - Giảm 100K', 100000, 'FIXED', 300000, '2026-01-01', '2026-12-31', FALSE, NULL),
('REWARD_20K', 'Voucher giảm 20.000đ (đổi điểm)', 20000, 'FIXED', 0, '2020-01-01', '2030-12-31', TRUE, NULL),
('REWARD_50K', 'Voucher giảm 50.000đ (đổi điểm)', 50000, 'FIXED', 0, '2020-01-01', '2030-12-31', TRUE, NULL),
('REWARD_FREE', 'Voucher vé miễn phí (đổi điểm)', 90000, 'FIXED', 0, '2020-01-01', '2030-12-31', TRUE, NULL),
('WELCOME_NEW', 'Chào mừng thành viên mới - Giảm 30K', 30000, 'FIXED', 0, '2020-01-01', '2030-12-31', TRUE, NULL),
('TIER_SILVER', 'Chúc mừng lên hạng Bạc - Giảm 30K', 30000, 'FIXED', 0, '2020-01-01', '2030-12-31', TRUE, NULL),
('TIER_GOLD', 'Chúc mừng lên hạng Vàng - Giảm 50K', 50000, 'FIXED', 0, '2020-01-01', '2030-12-31', TRUE, NULL),
('TIER_PLATINUM', 'Chúc mừng lên hạng Kim Cương - Giảm 100K', 100000, 'FIXED', 0, '2020-01-01', '2030-12-31', TRUE, NULL);

-- ============================================
-- 8. USER VOUCHERS (Assign vouchers cho users)
-- ============================================
INSERT INTO user_vouchers (user_id, promotion_id, status) VALUES
(4, 1, 'ACTIVE'), -- Nguyễn Văn A có voucher WELCOME2026
(5, 3, 'ACTIVE'), -- Trần Thị B có voucher WEEKEND20
(6, 4, 'ACTIVE'); -- Lê Văn C có voucher MEMBER100

-- ============================================
-- 9. CONCESSIONS
-- ============================================
INSERT INTO concessions (name, price, category, image_url) VALUES
('Bắp Rang Bơ (M)', 55000, 'Popcorn', 'https://example.com/popcorn-m.jpg'),
('Bắp Rang Bơ (L)', 70000, 'Popcorn', 'https://example.com/popcorn-l.jpg'),
('Coca Cola (M)', 30000, 'Drink', 'https://example.com/coke-m.jpg'),
('Coca Cola (L)', 40000, 'Drink', 'https://example.com/coke-l.jpg'),
('Combo 1 (Bắp M + Nước M)', 75000, 'Combo', 'https://example.com/combo1.jpg'),
('Combo 2 (Bắp L + 2 Nước M)', 120000, 'Combo', 'https://example.com/combo2.jpg'),
('Nachos', 45000, 'Snack', 'https://example.com/nachos.jpg'),
('Hot Dog', 40000, 'Snack', 'https://example.com/hotdog.jpg');

-- ============================================
-- 10. SAMPLE BOOKINGS
-- ============================================
-- Booking 1: User 4 đặt vé xem MAI
INSERT INTO bookings (user_id, showtime_id, booking_code, total_price, discount_amount, final_price, status) VALUES
(4, 1, 'GXY-2026-A1B2C', 180000, 0, 180000, 'Paid');

SET @booking_id = LAST_INSERT_ID();

-- Tickets cho booking 1 (2 ghế F5, F6)
INSERT INTO tickets (booking_id, seat_id, price, ticket_code, status) VALUES
(@booking_id, 55, 90000, CONCAT('GXY-', LPAD(@booking_id, 6, '0'), '-001'), 'SOLD'),
(@booking_id, 56, 90000, CONCAT('GXY-', LPAD(@booking_id, 6, '0'), '-002'), 'SOLD');

-- Concessions cho booking 1
INSERT INTO booking_concessions (booking_id, concession_id, quantity, price) VALUES
(@booking_id, 5, 1, 75000); -- Combo 1

-- Transaction cho booking 1
INSERT INTO transactions (booking_id, payment_method, amount, transaction_code, status) VALUES
(@booking_id, 'Momo', 255000, CONCAT('MOMO-', DATE_FORMAT(NOW(), '%Y%m%d'), '-', @booking_id), 'Success');

-- Loyalty history cho booking 1 (Earn points: 180000 / 10000 = 18 points)
INSERT INTO loyalty_history (user_id, points_change, type, description, related_booking_id) VALUES
(4, 18, 'PURCHASE', 'Tích điểm từ booking #1 - MAI', @booking_id);

-- ============================================
-- 10.1 STAFF-CINEMA, INVENTORY, POS & HOLDING DATA
-- ============================================

-- Gán staff vào các rạp để test phân quyền theo rạp
INSERT INTO cinema_staff (cinema_id, user_id) VALUES
(1, 3),
(2, 3);

-- Khởi tạo tồn kho đồ ăn theo từng rạp (nếu chưa có)
INSERT INTO cinema_concession_inventory (cinema_id, concession_id, quantity)
SELECT c.id, co.id, 80
FROM cinemas c
CROSS JOIN concessions co;

-- POS customers (khách vãng lai)
INSERT INTO pos_customers (phone, name, guest_customer_code, total_bookings, created_by_staff_id) VALUES
('0911111111', 'Khách Vãng Lai 01', 'GUEST-0001', 1, 3),
('0922222222', 'Khách Vãng Lai 02', 'GUEST-0002', 0, 3);

-- Booking 2: Khách vãng lai mua vé tại quầy, đã thanh toán
INSERT INTO bookings (user_id, guest_customer_id, showtime_id, booking_code, total_price, discount_amount, final_price, status) VALUES
(NULL, 1, 5, 'GXY-2026-POS01', 180000, 0, 180000, 'Paid');

SET @booking_pos = LAST_INSERT_ID();

INSERT INTO tickets (booking_id, seat_id, price, ticket_code, status) VALUES
(@booking_pos, 57, 90000, CONCAT('GXY-', LPAD(@booking_pos, 6, '0'), '-001'), 'SOLD'),
(@booking_pos, 58, 90000, CONCAT('GXY-', LPAD(@booking_pos, 6, '0'), '-002'), 'SOLD');

INSERT INTO transactions (booking_id, payment_method, amount, transaction_code, status) VALUES
(@booking_pos, 'Cash', 180000, CONCAT('POS-', DATE_FORMAT(NOW(), '%Y%m%d'), '-', @booking_pos), 'Success');

-- Booking 3: User dùng voucher và đang Pending để test timeout/expire flow
INSERT INTO bookings (user_id, showtime_id, booking_code, user_voucher_id, total_price, discount_amount, final_price, status) VALUES
(5, 6, 'GXY-2026-PEND1', 2, 200000, 40000, 160000, 'Pending');

SET @booking_pending = LAST_INSERT_ID();

INSERT INTO tickets (booking_id, seat_id, price, ticket_code, status, hold_expires_at) VALUES
(@booking_pending, 59, 100000, CONCAT('GXY-', LPAD(@booking_pending, 6, '0'), '-001'), 'HOLDING', DATE_ADD(NOW(), INTERVAL 5 MINUTE)),
(@booking_pending, 60, 100000, CONCAT('GXY-', LPAD(@booking_pending, 6, '0'), '-002'), 'HOLDING', DATE_ADD(NOW(), INTERVAL 5 MINUTE));

-- Seat hold records để test cơ chế giữ ghế
INSERT INTO seat_holds (showtime_id, seat_id, user_id, expires_at) VALUES
(6, 59, 5, DATE_ADD(NOW(), INTERVAL 5 MINUTE)),
(6, 60, 5, DATE_ADD(NOW(), INTERVAL 5 MINUTE));

-- Mark 1 voucher đã dùng để test trạng thái USED
UPDATE user_vouchers
SET status = 'USED', used_at = NOW()
WHERE id = 2;

-- Lịch sử scan vé tại cổng
INSERT INTO ticket_scan_history (booking_id, ticket_code_input, scanned_by_user_id, scan_result, note) VALUES
(@booking_id, CONCAT('GXY-', LPAD(@booking_id, 6, '0'), '-001'), 3, 'APPROVED', 'Check-in thành công cổng A'),
(@booking_pos, CONCAT('GXY-', LPAD(@booking_pos, 6, '0'), '-001'), 3, 'APPROVED', 'Khách POS vào cổng B');

-- ============================================
-- 11. REVIEWS
-- ============================================
INSERT INTO reviews (user_id, movie_id, rating, comment, status) VALUES
(4, 1, 5, 'Phim hay, diễn xuất xuất sắc!', 'Approved'),
(5, 1, 4, 'Cảm động, đáng xem', 'Approved'),
(6, 3, 5, 'Con cái rất thích, hoạt hình đẹp', 'Approved'),
(4, 4, 5, 'Dune 2 siêu phẩm, hình ảnh choáng ngợp!', 'Approved');

-- ============================================
-- 12. NOTIFICATIONS
-- ============================================
INSERT INTO notifications (title, message, type, target_audience, status, sent_at, is_active, created_by) VALUES
('Đặt vé thành công', 'Bạn đã đặt vé xem phim MAI thành công. Mã vé: GXY-000001-001', 'BOOKING', 'USER', 'SENT', NOW(), TRUE, 5),
('Ưu đãi mới', 'Giảm 20% cho tất cả suất chiếu cuối tuần. Mã: WEEKEND20', 'PROMOTION', 'ALL', 'SENT', NOW(), TRUE, 5),
('Thông báo nhân sự', 'Nhân viên vui lòng kiểm tra lịch ca làm mới trong tuần này.', 'SYSTEM', 'STAFF', 'SENT', NOW(), TRUE, 5),
('Bảng điều hành', 'Báo cáo doanh thu tháng đã sẵn sàng trong mục quản trị.', 'SYSTEM', 'ADMIN', 'SENT', NOW(), TRUE, 5),
('Khách vãng lai', 'Đăng nhập ngay để nhận ưu đãi thành viên và tích điểm.', 'PROMOTION', 'GUEST', 'SENT', NOW(), TRUE, 5);

INSERT INTO notification_reads (notification_id, user_id, is_read, read_at)
SELECT n.id, 4, TRUE, NOW()
FROM notifications n
WHERE n.title IN ('Đặt vé thành công', 'Ưu đãi mới');

-- ============================================
-- 13. SYSTEM CONFIGS
-- ============================================
INSERT INTO system_configs (config_key, config_value, description) VALUES
('min_vietnamese_quota', '15', 'Tỷ lệ phim Việt tối thiểu (%)'),
('seat_hold_duration', '300', 'Thời gian giữ ghế (giây) - 5 phút'),
('cleanup_duration', '15', 'Thời gian dọn phòng giữa 2 suất chiếu (phút)'),
('curfew_u13', '22:00:00', 'Giờ giới nghiêm cho dưới 13 tuổi'),
('curfew_u16', '23:00:00', 'Giờ giới nghiêm cho dưới 16 tuổi'),
('loyalty_points_rate', '10000', 'Số tiền (VNĐ) = 1 điểm tích lũy'),
('base_ticket_price', '90000', 'Giá vé cơ bản (VNĐ)'),
('ai_chat_schedule_days', '7', 'Số ngày chatbot được tra cứu, gồm hôm nay; tối đa 7 ngày'),
('ai_chat_showtimes_per_day', '8', 'Số suất tối đa chatbot hiển thị mỗi ngày, từ 1 đến 20'),
('ai_chat_show_reasons', '1', 'Hiện lý do gợi ý phim'),
('ai_chat_group_by', 'date_movie', 'Nhóm lịch theo ngày và phim hoặc ngày và rạp'),
('ai_chat_empty_result_policy', 'suggest_alternatives', 'Cách xử lý khi không tìm thấy suất phù hợp'),
('ai_chat_context_ttl_minutes', '15', 'Số phút giữ ngữ cảnh từ lượt hỏi gần nhất'),
('ai_chat_ambiguity_policy', 'clarify', 'Hỏi lại khi yêu cầu có nhiều cách hiểu');

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Kiểm tra số lượng bản ghi
SELECT 'Users' as TableName, COUNT(*) as RecordCount FROM users
UNION ALL SELECT 'Movies', COUNT(*) FROM movies
UNION ALL SELECT 'Cinemas', COUNT(*) FROM cinemas
UNION ALL SELECT 'Seats', COUNT(*) FROM seats
UNION ALL SELECT 'Showtimes', COUNT(*) FROM showtimes
UNION ALL SELECT 'Bookings', COUNT(*) FROM bookings
UNION ALL SELECT 'Tickets', COUNT(*) FROM tickets
UNION ALL SELECT 'Promotions', COUNT(*) FROM promotions
UNION ALL SELECT 'User Vouchers', COUNT(*) FROM user_vouchers
UNION ALL SELECT 'Loyalty History', COUNT(*) FROM loyalty_history
UNION ALL SELECT 'POS Customers', COUNT(*) FROM pos_customers
UNION ALL SELECT 'Seat Holds', COUNT(*) FROM seat_holds
UNION ALL SELECT 'Ticket Scan History', COUNT(*) FROM ticket_scan_history
UNION ALL SELECT 'Cinema Staff', COUNT(*) FROM cinema_staff
UNION ALL SELECT 'Concession Inventory', COUNT(*) FROM cinema_concession_inventory;
