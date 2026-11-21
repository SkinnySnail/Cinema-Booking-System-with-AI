-- ============================================
-- AUTO-SEED: sinh lịch chiếu tương đối theo ngày hiện tại
-- ============================================
-- Mục đích: dữ liệu seed_data.sql hardcode ngày cố định (23/02/2026 - 27/02/2026).
-- Khi chạy vào tháng khác, toàn bộ suất chiếu nằm trong quá khứ -> giao diện
-- báo "Chưa Có Suất" và chatbot trả về "không tìm thấy suất phù hợp".
--
-- File này được mount vào /docker-entrypoint-initdb.d/ nên CHẠY TỰ ĐỘNG
-- đúng 1 lần, khi volume MySQL còn trống (lần chạy đầu tiên).
--
-- Cơ chế: đọc lịch chiếu gốc của seed_data.sql, dịch mốc ngày của chúng
-- (2026-02-23 -> ngày 0, 2026-02-24 -> ngày 1, ...) sang chu kỳ 14 ngày
-- kể từ hôm nay. Giữ nguyên phim, phòng và khung giờ.

USE galaxy_cinema;

-- Bảng tạm chứa lịch chiếu gốc kèm độ lệch ngày so với ngày gốc.
DROP TABLE IF EXISTS tmp_showtime_offsets;
CREATE TABLE tmp_showtime_offsets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    movie_id INT NOT NULL,
    cinema_hall_id INT NOT NULL,
    day_offset INT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    base_price DECIMAL(10,2) NOT NULL DEFAULT 90000.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ngày gốc = ngày có suất chiếu sớm nhất trong seed (2026-02-23).
-- day_offset = số ngày lệch của mỗi suất so với ngày gốc.
INSERT INTO tmp_showtime_offsets (movie_id, cinema_hall_id, day_offset, start_time, end_time, base_price)
SELECT
    s.movie_id,
    s.cinema_hall_id,
    DATEDIFF(DATE(s.start_time), (SELECT MIN(DATE(start_time)) FROM showtimes)) AS day_offset,
    TIME(s.start_time),
    TIME(s.end_time),
    90000.00
FROM showtimes s;

-- ---------------------------------------------------------------------
-- Sinh lịch chiếu cho 14 ngày tới, tính từ hôm nay
-- ---------------------------------------------------------------------
INSERT INTO showtimes (movie_id, cinema_hall_id, start_time, end_time, base_price)
SELECT
    o.movie_id,
    o.cinema_hall_id,
    TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL o.day_offset DAY), o.start_time) AS start_time,
    TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL o.day_offset DAY), o.end_time) AS end_time,
    o.base_price
FROM tmp_showtime_offsets o
WHERE o.day_offset BETWEEN 0 AND 13;

-- Xóa các suất chiếu gốc đã nằm trong quá khứ (không có booking nào).
-- Giữ lại mọi suất trong tương lai và mọi suất đã được đặt vé.
DELETE FROM showtimes
WHERE start_time < CURDATE()
  AND id NOT IN (SELECT DISTINCT showtime_id FROM bookings WHERE showtime_id IS NOT NULL);

-- ---------------------------------------------------------------------
-- Giá vé theo loại phòng (IMAX/4DX đắt hơn phòng thường)
-- ---------------------------------------------------------------------
UPDATE showtimes s
JOIN cinema_halls h ON h.id = s.cinema_hall_id
SET s.base_price = CASE
    WHEN h.name = 'IMAX'    THEN 150000.00
    WHEN h.name = '4DX'     THEN 130000.00
    WHEN h.name = 'Phòng 2' THEN  95000.00
    ELSE 90000.00
END
WHERE DATE(s.start_time) >= CURDATE();

-- ---------------------------------------------------------------------
-- Dọn bảng tạm
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS tmp_showtime_offsets;

-- ---------------------------------------------------------------------
-- Trạng thái phim khớp với lịch chiếu vừa tạo
-- Phim có suất chiếu trong tương lai -> "Now Showing", ngược lại -> "Coming Soon"
-- (không hardcode id, để dùng được với bất kỳ bộ phim nào trong seed)
-- ---------------------------------------------------------------------
UPDATE movies m
SET m.status = 'Now Showing'
WHERE EXISTS (
    SELECT 1 FROM showtimes s
    WHERE s.movie_id = m.id AND DATE(s.start_time) >= CURDATE()
);

UPDATE movies m
SET m.status = 'Coming Soon'
WHERE NOT EXISTS (
    SELECT 1 FROM showtimes s
    WHERE s.movie_id = m.id AND DATE(s.start_time) >= CURDATE()
);

-- ---------------------------------------------------------------------
-- Báo cáo kết quả
-- ---------------------------------------------------------------------
SELECT CONCAT('Da tao ', COUNT(*), ' suat chieu tu ', CURDATE(), ' den ',
              DATE_ADD(CURDATE(), INTERVAL 13 DAY))
FROM showtimes
WHERE DATE(start_time) >= CURDATE();
