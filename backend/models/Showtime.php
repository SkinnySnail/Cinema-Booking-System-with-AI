<?php
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Config.php';

/**
 * Showtime Model
 * Quản lý lịch chiếu
 * Phụ trách: SƠN
 */
class Showtime
{
    private $db;
    private $table = 'showtimes';

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    /**
     * Số phút dọn phòng giữa 2 suất chiếu.
     */
    private function getCleanupDurationMinutes()
    {
        // Read from system_configs (dynamic), fallback to Config.php
        try {
            $configModel = new SystemConfig();
            $minutes = (int) $configModel->get('cleanup_duration', Config::$showtime_cleanup_minutes ?? 15);
        } catch (Exception $e) {
            $minutes = (int) (Config::$showtime_cleanup_minutes ?? 15);
        }
        return $minutes > 0 ? $minutes : 15;
    }

    /**
     * Lấy danh sách showtimes với filter
     * @param array $filters - date, cinema_id, movie_id, hall_id
     * @param int $page
     * @param int $limit
     * @return array
     */
    public function getAll($filters = [], $page = 1, $limit = 20)
    {
        try {
            $offset = ($page - 1) * $limit;

            $sql = "SELECT s.*, 
                           m.title as movie_title, 
                           m.duration_minutes, 
                           m.poster_url,
                           m.age_rating,
                           m.origin,
                           ch.name as hall_name,
                           ch.total_seats,
                           c.id as cinema_id,
                           c.name as cinema_name,
                           c.address as cinema_address,
                           COALESCE((
                               SELECT COUNT(DISTINCT t.seat_id)
                               FROM tickets t
                               JOIN bookings b ON t.booking_id = b.id
                               WHERE b.showtime_id = s.id
                                 AND b.status IN ('Paid', 'Pending')
                           ), 0) as sold_seats
                    FROM {$this->table} s
                    JOIN movies m ON s.movie_id = m.id
                    JOIN cinema_halls ch ON s.cinema_hall_id = ch.id
                    JOIN cinemas c ON ch.cinema_id = c.id
                    WHERE 1=1";

            $params = [];

            if (!empty($filters['date'])) {
                $sql .= " AND DATE(s.start_time) = :date";
                $params[':date'] = $filters['date'];
            }

            if (!empty($filters['cinema_id'])) {
                $sql .= " AND c.id = :cinema_id";
                $params[':cinema_id'] = $filters['cinema_id'];
            }

            if (!empty($filters['movie_id'])) {
                $sql .= " AND s.movie_id = :movie_id";
                $params[':movie_id'] = $filters['movie_id'];
            }

            if (!empty($filters['hall_id'])) {
                $sql .= " AND s.cinema_hall_id = :hall_id";
                $params[':hall_id'] = $filters['hall_id'];
            }

            if (!empty($filters['exclude_t18'])) {
                $sql .= " AND UPPER(COALESCE(m.age_rating, '')) <> 'T18'";
            }

            $sql .= " ORDER BY s.start_time ASC LIMIT :limit OFFSET :offset";

            $stmt = $this->db->prepare($sql);
            foreach ($params as $key => $value) {
                $stmt->bindValue($key, $value);
            }
            $stmt->bindValue(':limit', (int) $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', (int) $offset, PDO::PARAM_INT);
            $stmt->execute();

            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            error_log("Showtime getAll Error: " . $e->getMessage());
            return [];
        }
    }

    /**
     * Đếm tổng showtimes theo filter
     * @param array $filters
     * @return int
     */
    public function count($filters = [])
    {
        try {
            $sql = "SELECT COUNT(*) as total
                    FROM {$this->table} s
                    JOIN movies m ON s.movie_id = m.id
                    JOIN cinema_halls ch ON s.cinema_hall_id = ch.id
                    JOIN cinemas c ON ch.cinema_id = c.id
                    WHERE 1=1";

            $params = [];

            if (!empty($filters['date'])) {
                $sql .= " AND DATE(s.start_time) = :date";
                $params[':date'] = $filters['date'];
            }

            if (!empty($filters['cinema_id'])) {
                $sql .= " AND c.id = :cinema_id";
                $params[':cinema_id'] = $filters['cinema_id'];
            }

            if (!empty($filters['movie_id'])) {
                $sql .= " AND s.movie_id = :movie_id";
                $params[':movie_id'] = $filters['movie_id'];
            }

            if (!empty($filters['hall_id'])) {
                $sql .= " AND s.cinema_hall_id = :hall_id";
                $params[':hall_id'] = $filters['hall_id'];
            }

            if (!empty($filters['exclude_t18'])) {
                $sql .= " AND UPPER(COALESCE(m.age_rating, '')) <> 'T18'";
            }

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);

            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            return (int) $result['total'];
        } catch (PDOException $e) {
            error_log("Showtime count Error: " . $e->getMessage());
            return 0;
        }
    }

    /**
     * Lấy chi tiết showtime theo ID
     * @param int $id
     * @return array|null
     */
    public function getById($id)
    {
        try {
            $sql = "SELECT s.*, 
                           m.title as movie_title, 
                           m.duration_minutes, 
                           m.poster_url,
                           m.age_rating,
                           m.origin,
                           ch.name as hall_name,
                           ch.total_seats,
                           c.id as cinema_id,
                           c.name as cinema_name,
                           c.address as cinema_address
                    FROM {$this->table} s
                    JOIN movies m ON s.movie_id = m.id
                    JOIN cinema_halls ch ON s.cinema_hall_id = ch.id
                    JOIN cinemas c ON ch.cinema_id = c.id
                    WHERE s.id = :id";

            $stmt = $this->db->prepare($sql);
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            $stmt->execute();

            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            return $result ?: null;
        } catch (PDOException $e) {
            error_log("Showtime getById Error: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Tạo showtime mới
     * @param array $data - movie_id, cinema_hall_id, start_time, end_time
     * @return int|false
     */
    public function create($data)
    {
        try {
            $sql = "INSERT INTO {$this->table} (movie_id, cinema_hall_id, start_time, end_time, base_price) 
                    VALUES (:movie_id, :cinema_hall_id, :start_time, :end_time, :base_price)";

            $stmt = $this->db->prepare($sql);
            $stmt->bindParam(':movie_id', $data['movie_id'], PDO::PARAM_INT);
            $stmt->bindParam(':cinema_hall_id', $data['cinema_hall_id'], PDO::PARAM_INT);
            $stmt->bindParam(':start_time', $data['start_time']);
            $stmt->bindParam(':end_time', $data['end_time']);
            $basePrice = $data['base_price'] ?? 90000;
            $stmt->bindParam(':base_price', $basePrice);
            $stmt->execute();

            return $this->db->lastInsertId();
        } catch (PDOException $e) {
            error_log("Showtime create Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Cập nhật showtime
     * @param int $id
     * @param array $data
     * @return bool
     */
    public function update($id, $data)
    {
        try {
            $fields = [];
            $params = [':id' => $id];

            if (isset($data['movie_id'])) {
                $fields[] = "movie_id = :movie_id";
                $params[':movie_id'] = $data['movie_id'];
            }

            if (isset($data['cinema_hall_id'])) {
                $fields[] = "cinema_hall_id = :cinema_hall_id";
                $params[':cinema_hall_id'] = $data['cinema_hall_id'];
            }

            if (isset($data['start_time'])) {
                $fields[] = "start_time = :start_time";
                $params[':start_time'] = $data['start_time'];
            }

            if (isset($data['end_time'])) {
                $fields[] = "end_time = :end_time";
                $params[':end_time'] = $data['end_time'];
            }

            if (empty($fields)) {
                return false;
            }

            $sql = "UPDATE {$this->table} SET " . implode(', ', $fields) . " WHERE id = :id";
            $stmt = $this->db->prepare($sql);

            return $stmt->execute($params);
        } catch (PDOException $e) {
            error_log("Showtime update Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Xóa showtime
     * @param int $id
     * @return bool
     */
    public function delete($id)
    {
        try {
            $sql = "DELETE FROM {$this->table} WHERE id = :id";
            $stmt = $this->db->prepare($sql);
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            return $stmt->execute();
        } catch (PDOException $e) {
            error_log("Showtime delete Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Kiểm tra trùng lịch chiếu trong cùng phòng
     * @param int $hallId
     * @param string $startTime
     * @param string $endTime
     * @param int|null $excludeId - Loại trừ showtime đang cập nhật
     * @return bool - true nếu có xung đột
     */
    public function checkConflict($hallId, $startTime, $endTime, $excludeId = null)
    {
        try {
            $cleanupMinutes = $this->getCleanupDurationMinutes();

            $sql = "SELECT COUNT(*) as conflict_count
                    FROM {$this->table} s
                    INNER JOIN movies m ON s.movie_id = m.id
                    WHERE s.cinema_hall_id = :hall_id
                    AND (
                        (
                            s.start_time < :new_end_time
                            AND GREATEST(
                                s.end_time,
                                DATE_ADD(s.start_time, INTERVAL (m.duration_minutes + {$cleanupMinutes}) MINUTE)
                            ) > :new_start_time
                        )
                    )";

            $params = [
                ':hall_id' => $hallId,
                ':new_start_time' => $startTime,
                ':new_end_time' => $endTime
            ];

            if ($excludeId) {
                $sql .= " AND s.id != :exclude_id";
                $params[':exclude_id'] = $excludeId;
            }

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);

            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            return (int) $result['conflict_count'] > 0;
        } catch (PDOException $e) {
            error_log("Showtime checkConflict Error: " . $e->getMessage());
            return true; // Mặc định có xung đột để an toàn
        }
    }

    /**
     * Kiểm tra tỷ lệ phim Việt >= 15% cho ngày cụ thể tại cinema
     * @param int $cinemaId
     * @param string $date - format: Y-m-d
     * @return array - ['total' => int, 'vietnamese' => int, 'percentage' => float, 'passed' => bool]
     */
    public function checkVietnameseQuota($cinemaId, $date)
    {
        try {
            // Tổng số suất chiếu trong ngày tại cinema
            $sqlTotal = "SELECT COUNT(*) as total
                         FROM {$this->table} s
                         JOIN cinema_halls ch ON s.cinema_hall_id = ch.id
                         WHERE ch.cinema_id = :cinema_id
                         AND DATE(s.start_time) = :date";

            $stmt = $this->db->prepare($sqlTotal);
            $stmt->execute([':cinema_id' => $cinemaId, ':date' => $date]);
            $total = (int) $stmt->fetch(PDO::FETCH_ASSOC)['total'];

            // Số suất chiếu phim Việt
            $sqlVN = "SELECT COUNT(*) as vn_count
                      FROM {$this->table} s
                      JOIN cinema_halls ch ON s.cinema_hall_id = ch.id
                      JOIN movies m ON s.movie_id = m.id
                      WHERE ch.cinema_id = :cinema_id
                      AND DATE(s.start_time) = :date
                      AND m.origin = 'Vietnam'";

            $stmt = $this->db->prepare($sqlVN);
            $stmt->execute([':cinema_id' => $cinemaId, ':date' => $date]);
            $vietnamese = (int) $stmt->fetch(PDO::FETCH_ASSOC)['vn_count'];

            $percentage = $total > 0 ? ($vietnamese / $total) * 100 : 100;
            // Read quota from system_configs (dynamic), fallback to 15
            try {
                $configModel = new SystemConfig();
                $minQuota = (float) $configModel->get('min_vietnamese_quota', 15);
            } catch (Exception $ce) {
                $minQuota = Config::$min_vietnamese_quota ?? 15;
            }

            return [
                'total' => $total,
                'vietnamese' => $vietnamese,
                'percentage' => round($percentage, 2),
                'passed' => $percentage >= $minQuota
            ];
        } catch (PDOException $e) {
            error_log("Showtime checkVietnameseQuota Error: " . $e->getMessage());
            return ['total' => 0, 'vietnamese' => 0, 'percentage' => 0, 'passed' => false];
        }
    }

    /**
     * Lấy danh sách ghế trống cho suất chiếu
     * Exclude ghế đang HOLDING hoặc SOLD
     * @param int $showtimeId
     * @return array
     */
    public function getAvailableSeats($showtimeId)
    {
        try {
            // Lấy hall_id từ showtime
            $showtime = $this->getById($showtimeId);
            if (!$showtime) {
                return [];
            }

            $hallId = $showtime['cinema_hall_id'];

            $sql = "SELECT s.*, 
                           st.name as seat_type_name, 
                           st.price_multiplier
                    FROM seats s
                    JOIN seat_types st ON s.seat_type_id = st.id
                    WHERE s.cinema_hall_id = :hall_id
                    AND s.status = 'Active'
                    AND s.id NOT IN (
                        SELECT t.seat_id 
                        FROM tickets t
                        JOIN bookings b ON t.booking_id = b.id
                        WHERE b.showtime_id = :showtime_id
                        AND t.status IN ('HOLDING', 'SOLD')
                    )
                    ORDER BY s.row_code ASC, s.number ASC";

            $stmt = $this->db->prepare($sql);
            $stmt->bindParam(':hall_id', $hallId, PDO::PARAM_INT);
            $stmt->bindParam(':showtime_id', $showtimeId, PDO::PARAM_INT);
            $stmt->execute();

            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            error_log("Showtime getAvailableSeats Error: " . $e->getMessage());
            return [];
        }
    }

    /**
     * Tính thời gian kết thúc = start_time + duration + cleanup (15 phút)
     * @param string $startTime - format: Y-m-d H:i:s
     * @param int $durationMinutes
     * @return string - end_time format: Y-m-d H:i:s
     */
    public function calculateEndTime($startTime, $durationMinutes)
    {
        $cleanupDuration = $this->getCleanupDurationMinutes();
        $totalMinutes = $durationMinutes + $cleanupDuration;

        $startDateTime = new DateTime($startTime);
        $startDateTime->modify("+{$totalMinutes} minutes");

        return $startDateTime->format('Y-m-d H:i:s');
    }

    /**
     * Lấy số lượng ghế đã bán hoặc đang giữ
     * @param int $id
     * @return int
     */
    public function getSoldSeatsCount($id)
    {
        try {
            $sql = "SELECT COUNT(DISTINCT t.seat_id) as cnt
                    FROM tickets t
                    JOIN bookings b ON t.booking_id = b.id
                    WHERE b.showtime_id = :id AND t.status IN ('HOLDING', 'SOLD')";
            $stmt = $this->db->prepare($sql);
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            $stmt->execute();
            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            return (int) ($result['cnt'] ?? 0);
        } catch (PDOException $e) {
            error_log("Showtime getSoldSeatsCount Error: " . $e->getMessage());
            return 0;
        }
    }
}
