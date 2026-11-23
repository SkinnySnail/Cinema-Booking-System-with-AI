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

INSERT INTO movies (id, title, duration_minutes, age_rating, origin, poster_url, trailer_url, description, director, cast, release_date, status) VALUES
(1, 'Bò Sữa Bay', 108, 'T18', 'Vietnam', 'uploads/posters/bo-sua-bay.jpg', 'https://www.youtube.com/watch?v=bosuabay2026', 'Trên nông trường bò sữa Mộc Châu, Trâu (Nguyễn Hùng) quyết tâm đánh cắp công thức sữa có khả năng chữa lành và trẻ hóa để thoát nghèo. Nhưng anh gặp San (Ngọc Xuân) - chủ nhân bí mật của công thức, và tình yêu đã đến đúng lúc anh cần lý trí nhất.', 'Nguyễn Phạm Thành Đạt', 'Nguyễn Hùng, Ngọc Xuân, Võ Điền Gia Huy, Trần Tiểu Vy, Lãnh Thanh', '2026-11-06', 'Now Showing'),
(2, 'Ngày Con Còn Mẹ', 118, 'T16', 'Vietnam', 'uploads/posters/ngay-con-con-me.jpg', 'https://www.youtube.com/watch?v=ngayconconme2026', 'Mây (Phương Anh Đào) lớn lên với mặc cảm mẹ mình là bà Tím (Hồng Đào) luôn yêu thương anh trai hơn. Hai mẹ con thường cãi vã và xa cách nhau. Cho đến một ngày bà Tím gặp vấn đề về sức khỏe, Mây bắt đầu nhìn lại mối quan hệ với mẹ và thấu hiểu mẹ mình hơn.', 'Vũ Ngọc Đãng', 'Phương Anh Đào, Hồng Đào, Ma Ran Đô, Nguyên Thảo, Huy Anh', '2026-11-11', 'Now Showing'),
(3, 'Trại Giam Hạnh Phúc', 127, 'T16', 'Vietnam', 'uploads/posters/trai-giam-hanh-phuc.jpg', 'https://www.youtube.com/watch?v=traigiamhanhphuc2026', 'Phúc (Tuấn Trần) vốn là thầy giáo hiền lành nhưng phải vào tù vì giết người để bảo vệ em gái. Trong nhà giam, anh học cách nhịn nhẫn chờ ngày trở về. Sự chân thành của Phúc dần cảm hóa các tù nhân khác, mở ra câu chuyện về sự thông cảm và cơ hội làm lại cuộc đời.', 'Trung Lùn', 'Tuấn Trần, Ma Ran Đô, Lương Thế Thành', '2026-11-20', 'Now Showing'),
(4, 'Chị Chị Em Em 3', 122, 'T18', 'Vietnam', 'uploads/posters/chi-chi-em-em-3.jpg', 'https://www.youtube.com/watch?v=chichiemeem32026', 'Những bí mật tình cảm giữa xã hội Bắc Bộ xưa được kể lại qua cuộc đời của ba chị em. Tình cảm gia đình, sự ghen tuông và những lựa chọn của người phụ nữ trong khoảnh khắc lịch sử đầy thay đổi.', 'Nguyễn Hữu Hoàng', 'Nguyễn Cao Kỳ Duyên, Ninh Dương Lan Ngọc, Chi Pu, Steven Nguyễn, Quốc Anh', '2026-10-30', 'Now Showing'),
(5, 'Án Mạng Karaoke', 96, 'T13', 'Vietnam', 'uploads/posters/an-mang-karaoke.jpg', 'https://www.youtube.com/watch?v=anmangkaraoke2026', 'Vụ án bí ẩn tại một homestay trên núi. Những vị khách lạ đến để hát karaoke không biết rằng mình đang dính dòng vào một cuộc truy tìm đầy nguy hiểm. Bất ngờ và hài hước là hai mảng màu chính của tác phẩm.', 'Lê Hoàng', 'Đoàn Thiên Ân, Đại Nghĩa, Vân Dung, Thanh Sơn, Trịnh Thảo, Quỳnh Lý', '2026-10-30', 'Now Showing'),
(6, 'Trại Buôn Người', 135, 'T18', 'Vietnam', 'uploads/posters/trai-buon-nguoi.jpg', 'https://www.youtube.com/watch?v=traibuonguoi2026', 'Hành trình tìm đường sống giữa hiểm nguy của những con người lạc lối giữa ranh giới đạo đức và tội phạm, khi ranh giới giữa nạn nhân và kẻ buôn người càng trở nên mơ hồ.', 'Toni Dương Bảo Anh', 'Steven Nguyễn, Quách Ngọc Ngoan, Huỳnh Minh Kiên, Tùng Mint', '2026-09-25', 'Now Showing'),
(7, 'Đấu Trường Sinh Tử: Bình Minh Ngày Chiêu Quân', 158, 'T13', 'International', 'uploads/posters/hunger-games-sunrise.jpg', 'https://www.youtube.com/watch?v=hungergamessunrise2026', 'Câu chuyện diễn ra 24 năm trước khi Katniss bước vào đấu trường. Haymitch Abernathy (Joseph Zada), 16 tuổi, bị chọn làm vật tế cho Đấu Trường Sinh Tử lần thứ 50 với gấp đôi số người tham gia. Đây là tiền thân của bộ phim nổi tiếng.', 'Francis Lawrence', 'Joseph Zada, Mckenna Grace, Whitney Peak, Ralph Fiennes, Elle Fanning, Jesse Plemons', '2026-11-20', 'Now Showing'),
(8, 'Godzilla Trừ Không', 135, 'T18', 'International', 'uploads/posters/godzilla-minus-zero.jpg', 'https://www.youtube.com/watch?v=godzillaminuszero2026', 'Phần tiếp theo của Godzilla Minus One. Năm 1949, Nhật Bản bắt đầu tái thiết sau chiến tranh, nhưng một mối đe dọa lớn hơn đang dần xuất hiện. Bộ phim Godzilla đầu tiên được phân loại R.', 'Takashi Yamazaki', 'Ryunosuke Kamiki, Minami Hamabe', '2026-11-06', 'Now Showing'),
(9, 'Chàng Mèo Mang Mũ', 108, 'P', 'International', 'uploads/posters/cat-in-the-hat.jpg', 'https://www.youtube.com/watch?v=catinthehat2026', 'Mèo đội nón là người hướng dẫn đầy tính nghịch của hai đứa trẻ trong một thế giới nơi mọi thứ đều có thể xảy ra. Một bộ phim hoạt hình gia đình hài hước và đầy năng lượng cho mọi lứa tuổi.', 'Eric Darnell, Rob McDurnill', 'Wes Platt, Lily Tomlin, Jamie Foxx, Amanda Seyfried', '2026-11-06', 'Now Showing'),
(10, 'Clayface', 109, 'T18', 'International', 'uploads/posters/clayface.jpg', 'https://www.youtube.com/watch?v=clayface2026', 'Matt Hagen từ cậu bé đường phố ở Gotham trở thành ngôi sao điện ảnh Hollywood, cho đến khi một tên trùm tội phạm để lại anh trong tình trạng biến dạng khủng khiếp. Từ tuyệt vọng, Matt tìm đến một liệu pháp thử nghiệm có thể phục hồi khuôn mặt - nhưng thay đổi anh theo những cách không ngờ trước.', 'James Watkins', 'Tom Rhys Harries, Naomi Ackie', '2026-10-23', 'Now Showing'),
(11, 'Ebenezer: Phép Màu Đêm Giáng Sinh', 115, 'T13', 'International', 'uploads/posters/ebenezer.jpg', 'https://www.youtube.com/watch?v=ebenezer2026', 'Một câu chuyện cổ tích Giáng Sinh gothic về Ebenezer Scrooge - một ông già keo kiệt được tạc phẩm quyền lực quá nhiều. Cùng một đêm, ông phải đối mặt với ba bóng ma để tìm lại điều còn thiếu trong cuộc đời mình.', 'Nabil Ayouch', 'Brian Tyree Henry, Carrie Coon', '2026-11-13', 'Now Showing'),
(12, 'Ramayana: Khởi Nguồn Một Huyền Thoại', 195, 'T13', 'International', 'uploads/posters/ramayana.jpg', 'https://www.youtube.com/watch?v=ramayana2026', 'Bộ phim bom tấu lấy cảm hứng từ sử thiện Ấn Độ về hành trình của Prince Rama - từ lời nguyền định mệnh, cuộc chiến với ác quỷ Ravana cho đến khoảnh khắc hồi sinh của một vị anh hùng.', 'Sanjay Leela Bhansali', 'Ranveer Singh, Saif Ali Khan, Deepika Padukone', '2026-11-06', 'Now Showing'),
(13, 'Mẹ Mìn: Giao Kèo Với Quỷ', 125, 'T18', 'Vietnam', 'uploads/posters/me-min.jpg', 'https://www.youtube.com/watch?v=memin2026', 'Mẹ Mìn - một nhân vật bí ẩn - có khả năng ban phát điều ước cho mọi người, nhưng điều ước nào cũng sẽ đi kèm điều kiện của nó. Zoe (Rima Thanh Vy) muốn nổi tiếng, còn Hiếu (Khương Lê) muốn trở thành tỷ phú. Khi cả hai bắt đầu tìm đến Mẹ Mìn, họ rơi vào cạm bẫy đáng sợ.', 'Jack Carry On (Trịnh Tài Việt)', 'Minh Hằng, Nhật Kim Anh, Khương Lê, Rima Thanh Vy', '2026-11-27', 'Coming Soon'),
(14, 'Kumanthong Quỷ Thắp Nhang', 110, 'T16', 'Vietnam', 'uploads/posters/kumanthong.jpg', 'https://www.youtube.com/watch?v=kumanthong2026', 'Một thôn làng nơi người dân lập hội để thắp nhang cầu đàn linh. Những lời khấn cầu của họ đã được đáp ứng - nhưng cái giá phải trả còn đáng sợ hơn nhiều. Bộ phim kinh dị tâm lý với bầu không khí đặc quánh, ám ảnh từng bước.', 'Nguyễn Hữu Hoàng', 'Diễn viên chính của làng', '2026-11-27', 'Coming Soon'),
(15, 'Gặp Gỡ Thông Gia: Dâu Mới Trình Làng', 105, 'P', 'Vietnam', 'uploads/posters/gap-go-thong-gia.jpg', 'https://www.youtube.com/watch?v=gapgothonggia2026', 'Câu chuyện tình cảm hài hước về một cuộc hẹn hò bị bố trí: hai gia đình quý cao quý quý đưa con cái đến gặp nhau lần đầu. Mọi chuyện đi xa khỏi dự kiến khi tình cờ rơi nhầm vào một đám cưới khác.', 'Lê Bảo', 'Diễn viên trẻ', '2026-11-27', 'Coming Soon');

-- Thể loại cho từng phim
-- 1 Bò Sữa Bay: Hài(2), Hành động(1), Tình cảm(3)
-- 2 Ngày Con Còn Mẹ: Tâm lý(7), Tình cảm(3)
-- 3 Trại Giam Hạnh Phúc: Tâm lý(7), Hài(2)
-- 4 Chị Chị Em Em 3: Tâm lý(7), Tình cảm(3)
-- 5 Án Mạng Karaoke: Hài(2), Tâm lý(7)
-- 6 Trại Buôn Người: Hành động(1), Tâm lý(7)
-- 7 Hunger Games: Hành động(1), Khoa học viễn tưởng(6)
-- 8 Godzilla Trừ Không: Hành động(1), Khoa học viễn tưởng(6)
-- 9 Chàng Mèo Mang Mũ: Hoạt hình(5), Hài(2)
-- 10 Clayface: Kinh dị(4), Tâm lý(7)
-- 11 Ebenezer: Tâm lý(7), Tình cảm(3)
-- 12 Ramayana: Hành động(1), Tài liệu(8)
-- 13 Mẹ Mìn: Tâm lý(7), Kinh dị(4)
-- 14 Kumanthong: Kinh dị(4), Tâm lý(7)
-- 15 Gặp Gỡ Thông Gia: Tình cảm(3), Hài(2)
INSERT INTO movie_genres (movie_id, genre_id) VALUES
(1, 2), (1, 1), (1, 3),
(2, 7), (2, 3),
(3, 7), (3, 2),
(4, 7), (4, 3),
(5, 2), (5, 7),
(6, 1), (6, 7),
(7, 1), (7, 6),
(8, 1), (8, 6),
(9, 5), (9, 2),
(10, 4), (10, 7),
(11, 7), (11, 3),
(12, 1), (12, 8),
(13, 7), (13, 4),
(14, 4), (14, 7),
(15, 3), (15, 2);

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
-- Lịch chiếu cho 5 ngày đầu, chỉ các phim ĐANG CHIẾU.
-- 3 phim sắp ra mắt (27/11): Mẹ Mìn, Kumanthong, Gặp Gỡ Thông Gia
-- -> khong co suat chieu => trang web hien thi o tab 'Sap Chieu'.
-- Ngay goc 23/02/2026 se duoc dich sang hom nay boi auto_seed_current_showtimes.sql
INSERT INTO showtimes (movie_id, cinema_hall_id, start_time, end_time) VALUES
(1, 1, '2026-02-23 09:00:00', '2026-02-23 11:08:00'),
(2, 2, '2026-02-23 09:00:00', '2026-02-23 11:18:00'),
(3, 3, '2026-02-23 09:00:00', '2026-02-23 11:27:00'),
(4, 4, '2026-02-23 09:00:00', '2026-02-23 11:22:00'),
(6, 5, '2026-02-23 09:00:00', '2026-02-23 11:35:00'),
(7, 6, '2026-02-23 09:00:00', '2026-02-23 11:58:00'),
(8, 1, '2026-02-23 12:30:00', '2026-02-23 15:05:00'),
(9, 2, '2026-02-23 12:30:00', '2026-02-23 14:38:00'),
(10, 3, '2026-02-23 12:30:00', '2026-02-23 14:39:00'),
(11, 4, '2026-02-23 12:30:00', '2026-02-23 14:45:00'),
(12, 5, '2026-02-23 12:30:00', '2026-02-23 16:05:00'),
(1, 6, '2026-02-23 12:30:00', '2026-02-23 14:38:00'),
(2, 1, '2026-02-23 15:00:00', '2026-02-23 17:18:00'),
(3, 2, '2026-02-23 15:00:00', '2026-02-23 17:27:00'),
(4, 3, '2026-02-23 15:00:00', '2026-02-23 17:22:00'),
(6, 4, '2026-02-23 15:00:00', '2026-02-23 17:35:00'),
(7, 5, '2026-02-23 15:00:00', '2026-02-23 17:58:00'),
(8, 6, '2026-02-23 15:00:00', '2026-02-23 17:35:00'),
(9, 1, '2026-02-23 17:30:00', '2026-02-23 19:38:00'),
(10, 2, '2026-02-23 17:30:00', '2026-02-23 19:39:00'),
(11, 3, '2026-02-23 17:30:00', '2026-02-23 19:45:00'),
(12, 4, '2026-02-23 17:30:00', '2026-02-23 21:05:00'),
(1, 5, '2026-02-23 17:30:00', '2026-02-23 19:38:00'),
(2, 6, '2026-02-23 17:30:00', '2026-02-23 19:48:00'),
(3, 1, '2026-02-23 20:00:00', '2026-02-23 22:27:00'),
(4, 2, '2026-02-23 20:00:00', '2026-02-23 22:22:00'),
(6, 3, '2026-02-23 20:00:00', '2026-02-23 22:35:00'),
(7, 4, '2026-02-23 20:00:00', '2026-02-23 22:58:00'),
(8, 5, '2026-02-23 20:00:00', '2026-02-23 22:35:00'),
(9, 6, '2026-02-23 20:00:00', '2026-02-23 22:08:00'),
(10, 1, '2026-02-23 22:00:00', '2026-02-24 00:09:00'),
(11, 2, '2026-02-23 22:00:00', '2026-02-24 00:15:00'),
(12, 3, '2026-02-23 22:00:00', '2026-02-24 01:35:00'),
(1, 4, '2026-02-23 22:00:00', '2026-02-24 00:08:00'),
(2, 5, '2026-02-23 22:00:00', '2026-02-24 00:18:00'),
(3, 6, '2026-02-23 22:00:00', '2026-02-24 00:27:00'),
(4, 1, '2026-02-24 09:00:00', '2026-02-24 11:22:00'),
(6, 2, '2026-02-24 09:00:00', '2026-02-24 11:35:00'),
(7, 3, '2026-02-24 09:00:00', '2026-02-24 11:58:00'),
(8, 4, '2026-02-24 09:00:00', '2026-02-24 11:35:00'),
(9, 5, '2026-02-24 09:00:00', '2026-02-24 11:08:00'),
(10, 6, '2026-02-24 09:00:00', '2026-02-24 11:09:00'),
(11, 1, '2026-02-24 12:30:00', '2026-02-24 14:45:00'),
(12, 2, '2026-02-24 12:30:00', '2026-02-24 16:05:00'),
(1, 3, '2026-02-24 12:30:00', '2026-02-24 14:38:00'),
(2, 4, '2026-02-24 12:30:00', '2026-02-24 14:48:00'),
(3, 5, '2026-02-24 12:30:00', '2026-02-24 14:57:00'),
(4, 6, '2026-02-24 12:30:00', '2026-02-24 14:52:00'),
(6, 1, '2026-02-24 15:00:00', '2026-02-24 17:35:00'),
(7, 2, '2026-02-24 15:00:00', '2026-02-24 17:58:00'),
(8, 3, '2026-02-24 15:00:00', '2026-02-24 17:35:00'),
(9, 4, '2026-02-24 15:00:00', '2026-02-24 17:08:00'),
(10, 5, '2026-02-24 15:00:00', '2026-02-24 17:09:00'),
(11, 6, '2026-02-24 15:00:00', '2026-02-24 17:15:00'),
(12, 1, '2026-02-24 17:30:00', '2026-02-24 21:05:00'),
(1, 2, '2026-02-24 17:30:00', '2026-02-24 19:38:00'),
(2, 3, '2026-02-24 17:30:00', '2026-02-24 19:48:00'),
(3, 4, '2026-02-24 17:30:00', '2026-02-24 19:57:00'),
(4, 5, '2026-02-24 17:30:00', '2026-02-24 19:52:00'),
(6, 6, '2026-02-24 17:30:00', '2026-02-24 20:05:00'),
(7, 1, '2026-02-24 20:00:00', '2026-02-24 22:58:00'),
(8, 2, '2026-02-24 20:00:00', '2026-02-24 22:35:00'),
(9, 3, '2026-02-24 20:00:00', '2026-02-24 22:08:00'),
(10, 4, '2026-02-24 20:00:00', '2026-02-24 22:09:00'),
(11, 5, '2026-02-24 20:00:00', '2026-02-24 22:15:00'),
(12, 6, '2026-02-24 20:00:00', '2026-02-24 23:35:00'),
(1, 1, '2026-02-24 22:00:00', '2026-02-25 00:08:00'),
(2, 2, '2026-02-24 22:00:00', '2026-02-25 00:18:00'),
(3, 3, '2026-02-24 22:00:00', '2026-02-25 00:27:00'),
(4, 4, '2026-02-24 22:00:00', '2026-02-25 00:22:00'),
(6, 5, '2026-02-24 22:00:00', '2026-02-25 00:35:00'),
(7, 6, '2026-02-24 22:00:00', '2026-02-25 00:58:00'),
(8, 1, '2026-02-25 09:00:00', '2026-02-25 11:35:00'),
(9, 2, '2026-02-25 09:00:00', '2026-02-25 11:08:00'),
(10, 3, '2026-02-25 09:00:00', '2026-02-25 11:09:00'),
(11, 4, '2026-02-25 09:00:00', '2026-02-25 11:15:00'),
(12, 5, '2026-02-25 09:00:00', '2026-02-25 12:35:00'),
(1, 6, '2026-02-25 09:00:00', '2026-02-25 11:08:00'),
(2, 1, '2026-02-25 12:30:00', '2026-02-25 14:48:00'),
(3, 2, '2026-02-25 12:30:00', '2026-02-25 14:57:00'),
(4, 3, '2026-02-25 12:30:00', '2026-02-25 14:52:00'),
(6, 4, '2026-02-25 12:30:00', '2026-02-25 15:05:00'),
(7, 5, '2026-02-25 12:30:00', '2026-02-25 15:28:00'),
(8, 6, '2026-02-25 12:30:00', '2026-02-25 15:05:00'),
(9, 1, '2026-02-25 15:00:00', '2026-02-25 17:08:00'),
(10, 2, '2026-02-25 15:00:00', '2026-02-25 17:09:00'),
(11, 3, '2026-02-25 15:00:00', '2026-02-25 17:15:00'),
(12, 4, '2026-02-25 15:00:00', '2026-02-25 18:35:00'),
(1, 5, '2026-02-25 15:00:00', '2026-02-25 17:08:00'),
(2, 6, '2026-02-25 15:00:00', '2026-02-25 17:18:00'),
(3, 1, '2026-02-25 17:30:00', '2026-02-25 19:57:00'),
(4, 2, '2026-02-25 17:30:00', '2026-02-25 19:52:00'),
(6, 3, '2026-02-25 17:30:00', '2026-02-25 20:05:00'),
(7, 4, '2026-02-25 17:30:00', '2026-02-25 20:28:00'),
(8, 5, '2026-02-25 17:30:00', '2026-02-25 20:05:00'),
(9, 6, '2026-02-25 17:30:00', '2026-02-25 19:38:00'),
(10, 1, '2026-02-25 20:00:00', '2026-02-25 22:09:00'),
(11, 2, '2026-02-25 20:00:00', '2026-02-25 22:15:00'),
(12, 3, '2026-02-25 20:00:00', '2026-02-25 23:35:00'),
(1, 4, '2026-02-25 20:00:00', '2026-02-25 22:08:00'),
(2, 5, '2026-02-25 20:00:00', '2026-02-25 22:18:00'),
(3, 6, '2026-02-25 20:00:00', '2026-02-25 22:27:00'),
(4, 1, '2026-02-25 22:00:00', '2026-02-26 00:22:00'),
(6, 2, '2026-02-25 22:00:00', '2026-02-26 00:35:00'),
(7, 3, '2026-02-25 22:00:00', '2026-02-26 00:58:00'),
(8, 4, '2026-02-25 22:00:00', '2026-02-26 00:35:00'),
(9, 5, '2026-02-25 22:00:00', '2026-02-26 00:08:00'),
(10, 6, '2026-02-25 22:00:00', '2026-02-26 00:09:00'),
(11, 1, '2026-02-26 09:00:00', '2026-02-26 11:15:00'),
(12, 2, '2026-02-26 09:00:00', '2026-02-26 12:35:00'),
(1, 3, '2026-02-26 09:00:00', '2026-02-26 11:08:00'),
(2, 4, '2026-02-26 09:00:00', '2026-02-26 11:18:00'),
(3, 5, '2026-02-26 09:00:00', '2026-02-26 11:27:00'),
(4, 6, '2026-02-26 09:00:00', '2026-02-26 11:22:00'),
(6, 1, '2026-02-26 12:30:00', '2026-02-26 15:05:00'),
(7, 2, '2026-02-26 12:30:00', '2026-02-26 15:28:00'),
(8, 3, '2026-02-26 12:30:00', '2026-02-26 15:05:00'),
(9, 4, '2026-02-26 12:30:00', '2026-02-26 14:38:00'),
(10, 5, '2026-02-26 12:30:00', '2026-02-26 14:39:00'),
(11, 6, '2026-02-26 12:30:00', '2026-02-26 14:45:00'),
(12, 1, '2026-02-26 15:00:00', '2026-02-26 18:35:00'),
(1, 2, '2026-02-26 15:00:00', '2026-02-26 17:08:00'),
(2, 3, '2026-02-26 15:00:00', '2026-02-26 17:18:00'),
(3, 4, '2026-02-26 15:00:00', '2026-02-26 17:27:00'),
(4, 5, '2026-02-26 15:00:00', '2026-02-26 17:22:00'),
(6, 6, '2026-02-26 15:00:00', '2026-02-26 17:35:00'),
(7, 1, '2026-02-26 17:30:00', '2026-02-26 20:28:00'),
(8, 2, '2026-02-26 17:30:00', '2026-02-26 20:05:00'),
(9, 3, '2026-02-26 17:30:00', '2026-02-26 19:38:00'),
(10, 4, '2026-02-26 17:30:00', '2026-02-26 19:39:00'),
(11, 5, '2026-02-26 17:30:00', '2026-02-26 19:45:00'),
(12, 6, '2026-02-26 17:30:00', '2026-02-26 21:05:00'),
(1, 1, '2026-02-26 20:00:00', '2026-02-26 22:08:00'),
(2, 2, '2026-02-26 20:00:00', '2026-02-26 22:18:00'),
(3, 3, '2026-02-26 20:00:00', '2026-02-26 22:27:00'),
(4, 4, '2026-02-26 20:00:00', '2026-02-26 22:22:00'),
(6, 5, '2026-02-26 20:00:00', '2026-02-26 22:35:00'),
(7, 6, '2026-02-26 20:00:00', '2026-02-26 22:58:00'),
(8, 1, '2026-02-26 22:00:00', '2026-02-27 00:35:00'),
(9, 2, '2026-02-26 22:00:00', '2026-02-27 00:08:00'),
(10, 3, '2026-02-26 22:00:00', '2026-02-27 00:09:00'),
(11, 4, '2026-02-26 22:00:00', '2026-02-27 00:15:00'),
(12, 5, '2026-02-26 22:00:00', '2026-02-27 01:35:00'),
(1, 6, '2026-02-26 22:00:00', '2026-02-27 00:08:00'),
(2, 1, '2026-02-27 09:00:00', '2026-02-27 11:18:00'),
(3, 2, '2026-02-27 09:00:00', '2026-02-27 11:27:00'),
(4, 3, '2026-02-27 09:00:00', '2026-02-27 11:22:00'),
(6, 4, '2026-02-27 09:00:00', '2026-02-27 11:35:00'),
(7, 5, '2026-02-27 09:00:00', '2026-02-27 11:58:00'),
(8, 6, '2026-02-27 09:00:00', '2026-02-27 11:35:00'),
(9, 1, '2026-02-27 12:30:00', '2026-02-27 14:38:00'),
(10, 2, '2026-02-27 12:30:00', '2026-02-27 14:39:00'),
(11, 3, '2026-02-27 12:30:00', '2026-02-27 14:45:00'),
(12, 4, '2026-02-27 12:30:00', '2026-02-27 16:05:00'),
(1, 5, '2026-02-27 12:30:00', '2026-02-27 14:38:00'),
(2, 6, '2026-02-27 12:30:00', '2026-02-27 14:48:00'),
(3, 1, '2026-02-27 15:00:00', '2026-02-27 17:27:00'),
(4, 2, '2026-02-27 15:00:00', '2026-02-27 17:22:00'),
(6, 3, '2026-02-27 15:00:00', '2026-02-27 17:35:00'),
(7, 4, '2026-02-27 15:00:00', '2026-02-27 17:58:00'),
(8, 5, '2026-02-27 15:00:00', '2026-02-27 17:35:00'),
(9, 6, '2026-02-27 15:00:00', '2026-02-27 17:08:00'),
(10, 1, '2026-02-27 17:30:00', '2026-02-27 19:39:00'),
(11, 2, '2026-02-27 17:30:00', '2026-02-27 19:45:00'),
(12, 3, '2026-02-27 17:30:00', '2026-02-27 21:05:00'),
(1, 4, '2026-02-27 17:30:00', '2026-02-27 19:38:00'),
(2, 5, '2026-02-27 17:30:00', '2026-02-27 19:48:00'),
(3, 6, '2026-02-27 17:30:00', '2026-02-27 19:57:00'),
(4, 1, '2026-02-27 20:00:00', '2026-02-27 22:22:00'),
(6, 2, '2026-02-27 20:00:00', '2026-02-27 22:35:00'),
(7, 3, '2026-02-27 20:00:00', '2026-02-27 22:58:00'),
(8, 4, '2026-02-27 20:00:00', '2026-02-27 22:35:00'),
(9, 5, '2026-02-27 20:00:00', '2026-02-27 22:08:00'),
(10, 6, '2026-02-27 20:00:00', '2026-02-27 22:09:00'),
(11, 1, '2026-02-27 22:00:00', '2026-02-28 00:15:00'),
(12, 2, '2026-02-27 22:00:00', '2026-02-28 01:35:00'),
(1, 3, '2026-02-27 22:00:00', '2026-02-28 00:08:00'),
(2, 4, '2026-02-27 22:00:00', '2026-02-28 00:18:00'),
(3, 5, '2026-02-27 22:00:00', '2026-02-28 00:27:00'),
(4, 6, '2026-02-27 22:00:00', '2026-02-28 00:22:00');

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
('WELCOME2026', 'Giảm 50K cho khách hàng mới', 50000, 'FIXED', 200000, '2026-11-01', '2026-12-31', FALSE, NULL),
('BIRTHDAY', 'Voucher sinh nhật - Giảm 20%', 20, 'PERCENT', 100000, '2026-11-01', '2026-12-31', TRUE, 1),
('WEEKEND20', 'Giảm 20% cuối tuần', 20, 'PERCENT', 150000, '2026-11-01', '2026-12-31', FALSE, NULL),
('MEMBER100', 'Ưu đãi thành viên - Giảm 100K', 100000, 'FIXED', 300000, '2026-11-01', '2026-12-31', FALSE, NULL),
('GODZILLA25', 'Ra mắt Godzilla Trừ Không - Giảm 25K', 25000, 'FIXED', 200000, '2026-11-06', '2026-12-06', FALSE, NULL),
('MEMIN_PREMIERE', 'Mẹ Mìn - Vé xem trước giảm 30K', 30000, 'FIXED', 250000, '2026-11-20', '2026-12-27', FALSE, NULL),
('IMAX_UPGRADE', 'Nâng cấp ghế IMAX - Giảm 15%', 15, 'PERCENT', 400000, '2026-11-01', '2026-12-31', FALSE, NULL),
('STUDENT30', 'Sinh viên - Giảm 30K', 30000, 'FIXED', 150000, '2026-11-01', '2026-12-31', FALSE, NULL),
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
('Bắp Rang Bơ (M)', 55000, 'Popcorn', 'uploads/concessions/popcorn-m.jpg'),
('Bắp Rang Bơ (L)', 70000, 'Popcorn', 'uploads/concessions/popcorn-l.jpg'),
('Coca Cola (M)', 30000, 'Drink', 'uploads/concessions/coke-m.jpg'),
('Coca Cola (L)', 40000, 'Drink', 'uploads/concessions/coke-l.jpg'),
('Combo 1 (Bắp M + Nước M)', 75000, 'Combo', 'uploads/concessions/combo1.jpg'),
('Combo 2 (Bắp L + 2 Nước M)', 120000, 'Combo', 'uploads/concessions/combo2.jpg'),
('Nachos', 45000, 'Snack', 'uploads/concessions/nachos.jpg'),
('Hot Dog', 40000, 'Snack', 'uploads/concessions/hotdog.jpg');

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
(@booking_id, 'VNPay', 255000, CONCAT('VNPAY-', DATE_FORMAT(NOW(), '%Y%m%d'), '-', @booking_id), 'Success');

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
(4, 1, 5, 'Bò Sữa Bay hay thật sự, Nguyễn Hùng hài hước quá!', 'Approved'),
(5, 2, 4, 'Cảm động, xem xong nghĩ về mẹ mình', 'Approved'),
(6, 3, 5, 'Tuấn Trần quá xuất sắc, phim tâm lý hài rất đúng gu', 'Approved'),
(4, 7, 5, 'Hunger Games phần mới hồi hộp, xem IMAX ở rạp Nguyễn Du là chuẩn!', 'Approved'),
(5, 10, 4, 'Clayface rất kinh dị, hiệu ứng tạo hình đỉnh thật sự', 'Approved'),
(6, 8, 5, 'Godzilla đỉnh của đỉnh, hình ảnh choáng ngợp!', 'Approved');

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
('max_seats_per_booking', '8', 'Số ghế tối đa trong một đơn đặt vé'),
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
