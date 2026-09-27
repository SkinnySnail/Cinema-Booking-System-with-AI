<?php
require_once __DIR__ . '/../config/Database.php';

/**
 * Seat Model
 * Quản lý ghế ngồi
 * Phụ trách: SƠN
 */
class Seat
{
    private $db;
    private $table = 'seats';

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    /**
     * Lấy danh sách ghế theo hall
     * @param int $hallId
     * @return array
     */
    public function getByHallId($hallId)
    {
        try {
            $sql = "SELECT s.*, st.name as seat_type_name, st.price_multiplier
                    FROM {$this->table} s
                    JOIN seat_types st ON s.seat_type_id = st.id
                    WHERE s.cinema_hall_id = :hall_id
                    ORDER BY s.id ASC";

            $stmt = $this->db->prepare($sql);
            $stmt->bindParam(':hall_id', $hallId, PDO::PARAM_INT);
            $stmt->execute();

            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            error_log("Seat getByHallId Error: " . $e->getMessage());
            return [];
        }
    }

    /**
     * Lấy chi tiết ghế theo ID
     * @param int $id
     * @return array|null
     */
    public function getById($id)
    {
        try {
            $sql = "SELECT s.*, 
                           st.name as seat_type_name, 
                           st.price_multiplier,
                           ch.name as hall_name,
                           c.name as cinema_name
                    FROM {$this->table} s
                    JOIN seat_types st ON s.seat_type_id = st.id
                    JOIN cinema_halls ch ON s.cinema_hall_id = ch.id
                    JOIN cinemas c ON ch.cinema_id = c.id
                    WHERE s.id = :id";

            $stmt = $this->db->prepare($sql);
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            $stmt->execute();

            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            return $result ?: null;
        } catch (PDOException $e) {
            error_log("Seat getById Error: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Tạo nhiều ghế cùng lúc
     * @param int $hallId
     * @param array $rows - ['A', 'B', 'C', ...]
     * @param int $seatsPerRow
     * @param int $seatTypeId - default seat type
     * @return int - số ghế đã tạo
     */
    public function createBatch($hallId, $rows, $seatsPerRow, $seatTypeId = 1)
    {
        try {
            $this->db->beginTransaction();

            $sql = "INSERT INTO {$this->table} (cinema_hall_id, row_code, number, seat_type_id, status) 
                    VALUES (:hall_id, :row_code, :number, :seat_type_id, 'Active')";
            $stmt = $this->db->prepare($sql);

            $count = 0;
            foreach ($rows as $row) {
                for ($i = 1; $i <= $seatsPerRow; $i++) {
                    $stmt->execute([
                        ':hall_id' => $hallId,
                        ':row_code' => $row,
                        ':number' => $i,
                        ':seat_type_id' => $seatTypeId
                    ]);
                    $count++;
                }
            }

            // Cập nhật total_seats của hall
            $updateSql = "UPDATE cinema_halls SET total_seats = :total WHERE id = :hall_id";
            $updateStmt = $this->db->prepare($updateSql);
            $updateStmt->execute([':total' => $count, ':hall_id' => $hallId]);

            $this->db->commit();
            return $count;
        } catch (PDOException $e) {
            $this->db->rollBack();
            error_log("Seat createBatch Error: " . $e->getMessage());
            return 0;
        }
    }

    /**
     * Lấy trạng thái ghế cho một suất chiếu cụ thể
     * @param int $seatId
     * @param int $showtimeId
     * @return string - 'Available', 'HOLDING', 'SOLD', 'USED'
     */
    public function getSeatStatus($seatId, $showtimeId)
    {
        try {
            // Check if seat is sold (paid booking)
            $sql = "SELECT t.status
                    FROM tickets t
                    JOIN bookings b ON t.booking_id = b.id
                    WHERE t.seat_id = :seat_id 
                    AND b.showtime_id = :showtime_id
                    AND b.status IN ('Paid', 'Confirmed')
                    AND t.status IN ('SOLD', 'USED')
                    ORDER BY t.created_at DESC
                    LIMIT 1";

            $stmt = $this->db->prepare($sql);
            $stmt->bindParam(':seat_id', $seatId, PDO::PARAM_INT);
            $stmt->bindParam(':showtime_id', $showtimeId, PDO::PARAM_INT);
            $stmt->execute();

            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($result) {
                return 'SOLD';
            }

            // Check if seat is being held via booking (pending booking with active hold)
            $sql = "SELECT t.status
                    FROM tickets t
                    JOIN bookings b ON t.booking_id = b.id
                    WHERE t.seat_id = :seat_id 
                    AND b.showtime_id = :showtime_id
                    AND b.status = 'Pending'
                    AND t.status = 'HOLDING'
                    AND (t.hold_expires_at IS NULL OR t.hold_expires_at > NOW())
                    ORDER BY t.created_at DESC
                    LIMIT 1";

            $stmt = $this->db->prepare($sql);
            $stmt->bindParam(':seat_id', $seatId, PDO::PARAM_INT);
            $stmt->bindParam(':showtime_id', $showtimeId, PDO::PARAM_INT);
            $stmt->execute();

            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($result) {
                return 'HOLDING';
            }

            // Check if seat is being held via click-hold (seat_holds table)
            $sql = "SELECT user_id FROM seat_holds
                    WHERE showtime_id = :showtime_id AND seat_id = :seat_id AND expires_at > NOW()
                    LIMIT 1";

            $stmt = $this->db->prepare($sql);
            $stmt->bindParam(':seat_id', $seatId, PDO::PARAM_INT);
            $stmt->bindParam(':showtime_id', $showtimeId, PDO::PARAM_INT);
            $stmt->execute();

            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($result) {
                return 'HOLDING';
            }

            return 'Available';
        } catch (PDOException $e) {
            error_log("Seat getSeatStatus Error: " . $e->getMessage());
            return 'Available';
        }
    }

    /**
     * Thay thế toàn bộ layout ghế của một hall
     * Đồng bộ hóa và cập nhật ghế theo vị trí lưới vật lý
     * Bảo toàn ID ghế cho các vé đã đặt, tránh lỗi trùng UNIQUE KEY
     */
    public function replaceLayout($hallId, $seats)
    {
        try {
            $this->db->beginTransaction();

            // 1. Lấy danh sách ID ghế hiện có của hall theo thứ tự vật lý (id ASC)
            $existingSeatsStmt = $this->db->prepare("SELECT id FROM {$this->table} WHERE cinema_hall_id = :hall_id ORDER BY id ASC");
            $existingSeatsStmt->execute([':hall_id' => $hallId]);
            $existingSeats = $existingSeatsStmt->fetchAll(PDO::FETCH_COLUMN);

            $totalExisting = count($existingSeats);
            $totalNew = count($seats);

            // 2. Tạm thời đổi number thành số âm (-id) để giải phóng toàn bộ khóa unique (cinema_hall_id, row_code, number)
            if ($totalExisting > 0) {
                $tempStmt = $this->db->prepare("UPDATE {$this->table} SET number = -id WHERE cinema_hall_id = :hall_id");
                $tempStmt->execute([':hall_id' => $hallId]);
            }

            // 3. Cập nhật các ghế hiện có và chèn thêm ghế mới nếu cần
            $updateStmt = $this->db->prepare("UPDATE {$this->table} SET row_code = :row_code, number = :number, seat_type_id = :seat_type_id, status = :status WHERE id = :id");
            $insertStmt = $this->db->prepare("INSERT INTO {$this->table} (cinema_hall_id, row_code, number, seat_type_id, status) VALUES (:hall_id, :row_code, :number, :seat_type_id, :status)");

            for ($i = 0; $i < $totalNew; $i++) {
                $s = $seats[$i];
                $statusCandidate = $s['status'] ?? 'Active';
                $seatStatus = in_array($statusCandidate, ['Active', 'Broken', 'Inactive']) ? $statusCandidate : 'Active';

                if ($i < $totalExisting) {
                    $updateStmt->execute([
                        ':id' => $existingSeats[$i],
                        ':row_code' => $s['row_code'],
                        ':number' => $s['number'],
                        ':seat_type_id' => $s['seat_type_id'],
                        ':status' => $seatStatus
                    ]);
                } else {
                    $insertStmt->execute([
                        ':hall_id' => $hallId,
                        ':row_code' => $s['row_code'],
                        ':number' => $s['number'],
                        ':seat_type_id' => $s['seat_type_id'],
                        ':status' => $seatStatus
                    ]);
                }
            }

            // 4. Nếu giảm kích thước phòng (số ghế mới ít hơn số ghế cũ)
            if ($totalExisting > $totalNew) {
                $deleteStmt = $this->db->prepare("DELETE FROM {$this->table} WHERE id = :id");
                $deactivateStmt = $this->db->prepare("UPDATE {$this->table} SET status = 'Inactive' WHERE id = :id");

                for ($i = $totalNew; $i < $totalExisting; $i++) {
                    $seatId = $existingSeats[$i];
                    $checkStmt = $this->db->prepare("SELECT COUNT(*) FROM tickets WHERE seat_id = :seat_id");
                    $checkStmt->execute([':seat_id' => $seatId]);
                    if ($checkStmt->fetchColumn() > 0) {
                        $deactivateStmt->execute([':id' => $seatId]);
                    } else {
                        $deleteStmt->execute([':id' => $seatId]);
                    }
                }
            }

            // 5. Cập nhật total_seats trong cinema_halls (đếm ghế thực tế, loại trừ Inactive/lối đi)
            $count = count(array_filter($seats, fn($s) => ($s['status'] ?? 'Active') !== 'Inactive'));
            $updateHallSql = "UPDATE cinema_halls SET total_seats = :total WHERE id = :hall_id";
            $updateHallStmt = $this->db->prepare($updateHallSql);
            $updateHallStmt->execute([':total' => $count, ':hall_id' => $hallId]);

            $this->db->commit();
            return true;
        } catch (Exception $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log("Seat replaceLayout Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Kiểm tra xem có thể xóa/thay đổi ghế của hall không
     */
    public function hasFutureShowtimeBindings($hallId)
    {
        try {
            // Chỉ chặn nếu suất chiếu tương lai của phòng này đã có vé được bán (SOLD, USED)
            // Nếu suất chiếu mới tạo để test hoặc chưa có vé nào bán ra, admin hoàn toàn có thể cập nhật sơ đồ ghế
            $sql = "SELECT COUNT(*) as total
                    FROM tickets t
                    JOIN bookings b ON t.booking_id = b.id
                    JOIN showtimes st ON b.showtime_id = st.id
                    WHERE st.cinema_hall_id = :hall_id
                      AND st.start_time >= NOW()
                      AND t.status IN ('SOLD', 'USED')";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([':hall_id' => $hallId]);

            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            return ((int) ($result['total'] ?? 0)) > 0;
        } catch (PDOException $e) {
            error_log("Seat hasFutureShowtimeBindings Error: " . $e->getMessage());
            return true;
        }
    }


    /**
     * Kiểm tra xem có thể xóa/thay đổi ghế của hall không
     */
    public function canDeleteSeats($hallId)
    {
        try {
            // Kiểm tra suất chiếu sắp tới
            $sql = "SELECT COUNT(*) FROM showtimes WHERE cinema_hall_id = :hall_id AND start_time > NOW()";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([':hall_id' => $hallId]);
            if ($stmt->fetchColumn() > 0) return false;

            // Kiểm tra tickets đã tồn tại tham chiếu đến ghế của hall này
            $sql2 = "SELECT COUNT(*) FROM tickets t JOIN seats s ON t.seat_id = s.id WHERE s.cinema_hall_id = :hall_id";
            $stmt2 = $this->db->prepare($sql2);
            $stmt2->execute([':hall_id' => $hallId]);
            return $stmt2->fetchColumn() == 0;
        } catch (PDOException $e) {
            error_log("Seat canDeleteSeats Error: " . $e->getMessage());
            return false;
        }
    }
}
