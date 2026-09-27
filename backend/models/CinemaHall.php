<?php
require_once __DIR__ . '/../config/Database.php';

/**
 * CinemaHall Model
 * Quản lý phòng chiếu
 * Phụ trách: SƠN
 */
class CinemaHall
{
    private $db;
    private $table = 'cinema_halls';

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    /**
     * Lấy danh sách halls của cinema
     * @param int $cinemaId
     * @return array
     */
    public function getByCinemaId($cinemaId)
    {
        try {
            $sql = "SELECT ch.*, 
                           c.name as cinema_name,
                           (SELECT COUNT(*) FROM seats s WHERE s.cinema_hall_id = ch.id AND s.status = 'Active') as active_seats
                    FROM {$this->table} ch
                    JOIN cinemas c ON ch.cinema_id = c.id
                    WHERE ch.cinema_id = :cinema_id
                    ORDER BY ch.name ASC";

            $stmt = $this->db->prepare($sql);
            $stmt->bindParam(':cinema_id', $cinemaId, PDO::PARAM_INT);
            $stmt->execute();

            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            error_log("CinemaHall getByCinemaId Error: " . $e->getMessage());
            return [];
        }
    }

    /**
     * Lấy chi tiết hall theo ID
     * @param int $id
     * @return array|null
     */
    public function getById($id)
    {
        try {
            $sql = "SELECT ch.*, 
                           c.name as cinema_name,
                           c.address as cinema_address
                    FROM {$this->table} ch
                    JOIN cinemas c ON ch.cinema_id = c.id
                    WHERE ch.id = :id";

            $stmt = $this->db->prepare($sql);
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            $stmt->execute();

            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            return $result ?: null;
        } catch (PDOException $e) {
            error_log("CinemaHall getById Error: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Tạo hall mới
     * @param array $data - cinema_id, name, total_seats
     * @return int|false
     */
    public function create($data)
    {
        try {
            $sql = "INSERT INTO {$this->table} (cinema_id, name, total_seats) 
                    VALUES (:cinema_id, :name, :total_seats)";

            $stmt = $this->db->prepare($sql);
            $stmt->bindParam(':cinema_id', $data['cinema_id'], PDO::PARAM_INT);
            $stmt->bindParam(':name', $data['name']);
            $totalSeats = $data['total_seats'] ?? 0;
            $stmt->bindParam(':total_seats', $totalSeats, PDO::PARAM_INT);
            $stmt->execute();

            return $this->db->lastInsertId();
        } catch (PDOException $e) {
            error_log("CinemaHall create Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Lấy danh sách ghế của hall
     * @param int $hallId
     * @return array
     */
    public function getSeats($hallId)
    {
        try {
            $sql = "SELECT s.*, st.name as seat_type_name, st.price_multiplier
                    FROM seats s
                    JOIN seat_types st ON s.seat_type_id = st.id
                    WHERE s.cinema_hall_id = :hall_id
                    ORDER BY s.id ASC";

            $stmt = $this->db->prepare($sql);
            $stmt->bindParam(':hall_id', $hallId, PDO::PARAM_INT);
            $stmt->execute();

            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            error_log("CinemaHall getSeats Error: " . $e->getMessage());
            return [];
        }
    }

    /**
     * Cập nhật thông tin hall
     */
    public function update($id, $data)
    {
        try {
            $allowedFields = ['name', 'total_seats'];
            $fields = [];
            $params = [':id' => $id];

            foreach ($allowedFields as $field) {
                if (isset($data[$field])) {
                    $fields[] = "$field = :$field";
                    $params[":$field"] = $data[$field];
                }
            }

            if (empty($fields))
                return false;

            $sql = "UPDATE {$this->table} SET " . implode(', ', $fields) . " WHERE id = :id";
            $stmt = $this->db->prepare($sql);
            return $stmt->execute($params);
        } catch (PDOException $e) {
            error_log("CinemaHall update Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Xóa hall
     */
    public function delete($id)
    {
        try {
            $sql = "DELETE FROM {$this->table} WHERE id = :id";
            $stmt = $this->db->prepare($sql);
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            return $stmt->execute();
        } catch (PDOException $e) {
            error_log("CinemaHall delete Error: " . $e->getMessage());
            return false;
        }
    }
}
