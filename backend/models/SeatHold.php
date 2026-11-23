<?php
/**
 * SeatHold Model - Giữ ghế tạm thời khi user click chọn ghế (trước khi tạo booking)
 */
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Config.php';

class SeatHold
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    /**
     * Giữ ghế cho user. Nếu ghế đã bị giữ bởi user khác (chưa hết hạn) → false.
     * Nếu user đã giữ ghế này → gia hạn.
     * @return bool
     */
    public function holdSeat($showtimeId, $seatId, $userId, $holdSeconds = null)
    {
        if (!$holdSeconds) {
            $holdSeconds = Config::$seat_hold_duration ?? 300;
        }
        $expiresAt = date('Y-m-d H:i:s', time() + $holdSeconds);

        // Xóa các hold đã hết hạn trước
        $this->cleanupExpired();

        try {
            // Thử insert, nếu trùng key thì update nếu cùng user
            $stmt = $this->db->prepare(
                "INSERT INTO seat_holds (showtime_id, seat_id, user_id, expires_at)
                 VALUES (:showtime_id, :seat_id, :user_id, :expires_at)
                 ON DUPLICATE KEY UPDATE
                    user_id = IF(user_id = VALUES(user_id) OR expires_at < NOW(), VALUES(user_id), user_id),
                    expires_at = IF(user_id = VALUES(user_id) OR expires_at < NOW(), VALUES(expires_at), expires_at)"
            );
            $stmt->execute([
                ':showtime_id' => (int)$showtimeId,
                ':seat_id' => (int)$seatId,
                ':user_id' => (int)$userId,
                ':expires_at' => $expiresAt,
            ]);

            // Kiểm tra xem user có thực sự giữ được ghế không
            $check = $this->db->prepare(
                "SELECT user_id FROM seat_holds
                 WHERE showtime_id = :showtime_id AND seat_id = :seat_id AND expires_at > NOW()"
            );
            $check->execute([
                ':showtime_id' => (int)$showtimeId,
                ':seat_id' => (int)$seatId,
            ]);
            $row = $check->fetch(PDO::FETCH_ASSOC);

            return $row && (int)$row['user_id'] === (int)$userId;
        } catch (PDOException $e) {
            error_log("SeatHold holdSeat Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Giữ nhiều ghế cùng lúc (atomic)
     * @return array ['success' => bool, 'failed_seats' => int[]]
     */
    public function holdSeats($showtimeId, $seatIds, $userId, $holdSeconds = null)
    {
        $failed = [];
        foreach ($seatIds as $seatId) {
            if (!$this->holdSeat($showtimeId, $seatId, $userId, $holdSeconds)) {
                $failed[] = $seatId;
            }
        }
        return [
            'success' => empty($failed),
            'failed_seats' => $failed,
        ];
    }

    /**
     * Nhả ghế
     */
    public function releaseSeat($showtimeId, $seatId, $userId)
    {
        $stmt = $this->db->prepare(
            "DELETE FROM seat_holds
             WHERE showtime_id = :showtime_id AND seat_id = :seat_id AND user_id = :user_id"
        );
        return $stmt->execute([
            ':showtime_id' => (int)$showtimeId,
            ':seat_id' => (int)$seatId,
            ':user_id' => (int)$userId,
        ]);
    }

    /**
     * Nhả nhiều ghế
     */
    public function releaseSeats($showtimeId, $seatIds, $userId)
    {
        foreach ($seatIds as $seatId) {
            $this->releaseSeat($showtimeId, $seatId, $userId);
        }
        return true;
    }

    /**
     * Nhả tất cả ghế của user cho 1 suất chiếu
     */
    public function releaseAllForUser($showtimeId, $userId)
    {
        $stmt = $this->db->prepare(
            "DELETE FROM seat_holds WHERE showtime_id = :showtime_id AND user_id = :user_id"
        );
        return $stmt->execute([
            ':showtime_id' => (int)$showtimeId,
            ':user_id' => (int)$userId,
        ]);
    }

    /**
     * Kiểm tra ghế có đang bị giữ bởi user khác không
     * @return string|null - user_id nếu đang bị giữ, null nếu trống
     */
    public function getHoldingUser($showtimeId, $seatId)
    {
        $stmt = $this->db->prepare(
            "SELECT user_id FROM seat_holds
             WHERE showtime_id = :showtime_id AND seat_id = :seat_id AND expires_at > NOW()
             LIMIT 1"
        );
        $stmt->execute([
            ':showtime_id' => (int)$showtimeId,
            ':seat_id' => (int)$seatId,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ? (int)$row['user_id'] : null;
    }

    /**
     * Lấy danh sách seat_id đang bị giữ cho 1 suất chiếu (chưa hết hạn)
     * @return array [seat_id => user_id]
     */
    public function getHeldSeats($showtimeId)
    {
        $stmt = $this->db->prepare(
            "SELECT seat_id, user_id FROM seat_holds
             WHERE showtime_id = :showtime_id AND expires_at > NOW()"
        );
        $stmt->execute([':showtime_id' => (int)$showtimeId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $result = [];
        foreach ($rows as $row) {
            $result[(int)$row['seat_id']] = (int)$row['user_id'];
        }
        return $result;
    }

    /**
     * Danh sách seat_id user đang giữ (chưa hết hạn) cho 1 suất chiếu
     * @return int[]
     */
    public function getUserHeldSeatIds($showtimeId, $userId)
    {
        $stmt = $this->db->prepare(
            "SELECT seat_id FROM seat_holds
             WHERE showtime_id = :showtime_id AND user_id = :user_id AND expires_at > NOW()"
        );
        $stmt->execute([
            ':showtime_id' => (int)$showtimeId,
            ':user_id' => (int)$userId,
        ]);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    /**
     * Xóa các hold đã hết hạn
     */
    public function cleanupExpired()
    {
        $stmt = $this->db->prepare("DELETE FROM seat_holds WHERE expires_at <= NOW()");
        $stmt->execute();
        return $stmt->rowCount();
    }
}
