-- ============================================
-- DỮ LIỆU PHIM THỜI ĐIỂM HIỆN TẠI (tháng 11/2026)
-- ============================================
-- Nguồn: Moveek / FPTShop / MoMo (lịch chiếu rạp thực tế 11/2026)
-- Cập nhật: 21/11/2026
--
-- Cấu trúc giữ nguyên với seed_data.sql: cùng thứ tự id, cùng kiểu dữ liệu,
-- để các bảng phụ (movie_genres, reviews, showtimes, bookings...) không phải sửa.
--
-- LƯU Ý: ngày khởi chiếu nằm trong quá khứ so với "hôm nay" để mọi phim
-- đều là "Now Showing". Lịch chiếu cụ thể được sinh tự động bởi
-- auto_seed_current_showtimes.sql (dịch theo CURDATE()).

-- ============================================
-- PHIM VIỆT NAM ĐANG CHIẾU
-- ============================================
-- 1. Bò Sữa Bay (06/11/2026) - T18 - Hài/Hành động/Tình cảm - 108 phút
-- 2. Ngày Con Còn Mẹ (11/11/2026) - T16 - Tâm lý/Gia đình - 118 phút
-- 3. Trại Giam Hạnh Phúc (20/11/2026) - T16 - Tâm lý/Hài/Gia đình - 127 phút
-- 4. Chị Chị Em Em 3 (30/10/2026) - T18 - Tâm lý/Tình cảm - 122 phút
-- 5. Án Mạng Karaoke (30/10/2026) - T13 - Bí ẩn/Hài - 96 phút
-- 6. Trại Buôn Người (25/09/2026) - T18 - Hành động/Tâm lý - 135 phút

-- ============================================
-- PHIM QUỐC TẾ ĐANG CHIẾU
-- ============================================
-- 7. Đấu Trường Sinh Tử: Bình Minh Ngày Chiêu Quân (20/11/2026) - T13 - 158 phút
-- 8. Godzilla Trừ Không (06/11/2026) - T18 - 135 phút
-- 9. Chàng Mèo Mang Mũ (06/11/2026) - P - 108 phút
-- 10. Clayface (23/10/2026) - T18 - 109 phút
-- 11. Ebenezer: Phép Màu Đêm Giáng Sinh (13/11/2026) - T13 - 115 phút
-- 12. Ramayana: Khởi Nguồn Một Huyền Thoại (06/11/2026) - T13 - 195 phút

-- ============================================
-- PHIM SẮP CHIẾU
-- ============================================
-- 13. Mẹ Mìn: Giao Kèo Với Quỷ (27/11/2026) - T18 - 125 phút
-- 14. Kumanthong Quỷ Thắp Nhang (27/11/2026) - T16 - 110 phút
-- 15. Gặp Gỡ Thông Gia: Dâu Mới Trình Làng (27/11/2026) - P - 105 phút

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
