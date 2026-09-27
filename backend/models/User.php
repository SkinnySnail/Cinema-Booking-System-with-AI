<?php
require_once __DIR__ . '/../config/Database.php';

/**
 * User Model
 * Phụ trách: THỊNH
 */
class User {
    private $db;
    private $table = 'users';
    
    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
    }
    
    /**
     * Tạo user mới
     */
    public function create($data) {
        try {
            $query = "INSERT INTO {$this->table} (email, password_hash, role_id, status, current_points) 
                      VALUES (:email, :password_hash, :role_id, :status, 0)";
            
            $stmt = $this->db->prepare($query);
            
            $stmt->bindParam(':email', $data['email']);
            $stmt->bindParam(':password_hash', $data['password_hash']);
            $stmt->bindParam(':role_id', $data['role_id'], PDO::PARAM_INT);
            $stmt->bindParam(':status', $data['status']);
            
            if ($stmt->execute()) {
                return $this->db->lastInsertId();
            }
            
            return false;
            
        } catch (PDOException $e) {
            error_log("User Create Error: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Tìm user theo email
     */
    public function findByEmail($email) {
        try {
            $query = "SELECT * FROM {$this->table} WHERE email = :email LIMIT 1";
            $stmt = $this->db->prepare($query);
            $stmt->bindParam(':email', $email);
            $stmt->execute();
            
            return $stmt->fetch(PDO::FETCH_ASSOC);
            
        } catch (PDOException $e) {
            error_log("User FindByEmail Error: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Tìm user theo ID
     */
    public function findById($id) {
        try {
            $query = "SELECT * FROM {$this->table} WHERE id = :id LIMIT 1";
            $stmt = $this->db->prepare($query);
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            $stmt->execute();
            
            return $stmt->fetch(PDO::FETCH_ASSOC);
            
        } catch (PDOException $e) {
            error_log("User FindById Error: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Update user
     */
    public function update($id, $data) {
        try {
            $fields = [];
            $params = ['id' => $id];
            
            foreach ($data as $key => $value) {
                if ($key !== 'id') {
                    $fields[] = "$key = :$key";
                    $params[$key] = $value;
                }
            }
            
            $query = "UPDATE {$this->table} SET " . implode(', ', $fields) . " WHERE id = :id";
            $stmt = $this->db->prepare($query);
            
            return $stmt->execute($params);
            
        } catch (PDOException $e) {
            error_log("User Update Error: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Soft delete user
     */
    public function delete($id) {
        try {
            $query = "UPDATE {$this->table} SET status = 'Banned' WHERE id = :id";
            $stmt = $this->db->prepare($query);
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            
            return $stmt->execute();
            
        } catch (PDOException $e) {
            error_log("User Delete Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Khóa tài khoản user
     */
    public function lockAccount($id) {
        try {
            $query = "UPDATE {$this->table} SET status = 'Banned' WHERE id = :id";
            $stmt = $this->db->prepare($query);
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);

            return $stmt->execute();
        } catch (PDOException $e) {
            error_log("User lockAccount Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Xóa cứng tài khoản user
     */
    public function hardDelete($id) {
        try {
            $query = "DELETE FROM {$this->table} WHERE id = :id";
            $stmt = $this->db->prepare($query);
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);

            return $stmt->execute();
        } catch (PDOException $e) {
            error_log("User hardDelete Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Kiểm tra user đã phát sinh đặt vé/giao dịch chưa
     */
    public function hasBookingsOrTransactions($userId) {
        try {
            $bookingQuery = "SELECT 1 FROM bookings WHERE user_id = :user_id LIMIT 1";
            $bookingStmt = $this->db->prepare($bookingQuery);
            $bookingStmt->bindParam(':user_id', $userId, PDO::PARAM_INT);
            $bookingStmt->execute();

            if ($bookingStmt->fetch(PDO::FETCH_ASSOC)) {
                return true;
            }

            $transactionQuery = "SELECT 1
                                 FROM transactions t
                                 INNER JOIN bookings b ON b.id = t.booking_id
                                 WHERE b.user_id = :user_id
                                 LIMIT 1";
            $transactionStmt = $this->db->prepare($transactionQuery);
            $transactionStmt->bindParam(':user_id', $userId, PDO::PARAM_INT);
            $transactionStmt->execute();

            return (bool)$transactionStmt->fetch(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            error_log("User hasBookingsOrTransactions Error: " . $e->getMessage());
            return true;
        }
    }
    
    /**
     * Lấy tất cả users với filter và pagination
     */
    public function getAll($filters = [], $page = 1, $limit = 20) {
        try {
            $offset = ($page - 1) * $limit;
            
                        $query = "SELECT u.*, up.full_name, up.phone, up.dob, r.name as role_name, m.rank_name, COALESCE(cs.cinema_id, cm.cinema_id) as cinema_id
                      FROM {$this->table} u 
                      LEFT JOIN user_profiles up ON u.id = up.user_id 
                      LEFT JOIN roles r ON u.role_id = r.id
                      LEFT JOIN memberships m ON up.membership_id = m.id
                                            LEFT JOIN (
                                                SELECT user_id, MIN(cinema_id) AS cinema_id
                                                FROM cinema_staff
                                                GROUP BY user_id
                                            ) cs ON cs.user_id = u.id
                                            LEFT JOIN (
                                                SELECT manager_id, MIN(id) AS cinema_id
                                                FROM cinemas
                                                WHERE manager_id IS NOT NULL
                                                GROUP BY manager_id
                                            ) cm ON cm.manager_id = u.id
                      WHERE 1=1";
            
            $params = [];
            
            if (!empty($filters['role_id'])) {
                $query .= " AND u.role_id = :role_id";
                $params['role_id'] = $filters['role_id'];
            }
            
            if (!empty($filters['status'])) {
                $query .= " AND u.status = :status";
                $params['status'] = $filters['status'];
            }
            
            if (!empty($filters['search'])) {
                $searchValue = '%' . $filters['search'] . '%';
                $query .= " AND (u.email LIKE :search_email OR COALESCE(up.full_name, '') LIKE :search_name OR COALESCE(up.phone, '') LIKE :search_phone)";
                $params['search_email'] = $searchValue;
                $params['search_name'] = $searchValue;
                $params['search_phone'] = $searchValue;
            }
            
            // Sorting
            $sortBy = $filters['sort_by'] ?? 'created_at';
            $sortOrder = strtoupper($filters['sort_order'] ?? 'DESC');
            $sortOrder = in_array($sortOrder, ['ASC', 'DESC']) ? $sortOrder : 'DESC';
            
            $allowedSortFields = ['created_at', 'email', 'current_points', 'status'];
            if (!in_array($sortBy, $allowedSortFields)) {
                $sortBy = 'created_at';
            }
            
            $query .= " ORDER BY u.$sortBy $sortOrder LIMIT :limit OFFSET :offset";
            
            $stmt = $this->db->prepare($query);
            
            foreach ($params as $key => $value) {
                $stmt->bindValue(":$key", $value);
            }
            
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            
            $stmt->execute();
            
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
            
        } catch (PDOException $e) {
            error_log("User GetAll Error: " . $e->getMessage());
            return [];
        }
    }
    
    /**
     * Đếm tổng số users
     */
    public function count($filters = []) {
        try {
            $query = "SELECT COUNT(*) as total 
                      FROM {$this->table} u 
                      LEFT JOIN user_profiles up ON u.id = up.user_id 
                      WHERE 1=1";
            
            $params = [];
            
            if (!empty($filters['role_id'])) {
                $query .= " AND u.role_id = :role_id";
                $params['role_id'] = $filters['role_id'];
            }
            
            if (!empty($filters['status'])) {
                $query .= " AND u.status = :status";
                $params['status'] = $filters['status'];
            }
            
            if (!empty($filters['search'])) {
                $searchValue = '%' . $filters['search'] . '%';
                $query .= " AND (u.email LIKE :search_email OR COALESCE(up.full_name, '') LIKE :search_name OR COALESCE(up.phone, '') LIKE :search_phone)";
                $params['search_email'] = $searchValue;
                $params['search_name'] = $searchValue;
                $params['search_phone'] = $searchValue;
            }
            
            $stmt = $this->db->prepare($query);
            
            foreach ($params as $key => $value) {
                $stmt->bindValue(":$key", $value);
            }
            
            $stmt->execute();
            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            
            return (int)$result['total'];
            
        } catch (PDOException $e) {
            error_log("User Count Error: " . $e->getMessage());
            return 0;
        }
    }
    
    /**
     * Đếm số lượng user theo hạng thành viên
     */
    public function getTierCounts() {
        try {
            $query = "SELECT m.rank_name, COUNT(*) as cnt
                      FROM {$this->table} u
                      LEFT JOIN user_profiles up ON u.id = up.user_id
                      LEFT JOIN memberships m ON up.membership_id = m.id
                      GROUP BY m.rank_name";
            $stmt = $this->db->prepare($query);
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $counts = ['Bronze' => 0, 'Silver' => 0, 'Gold' => 0, 'Platinum' => 0];
            foreach ($rows as $row) {
                $name = $row['rank_name'];
                if ($name && isset($counts[$name])) {
                    $counts[$name] = (int)$row['cnt'];
                }
            }
            return $counts;
        } catch (PDOException $e) {
            error_log("User getTierCounts Error: " . $e->getMessage());
            return ['Bronze' => 0, 'Silver' => 0, 'Gold' => 0, 'Platinum' => 0];
        }
    }

    /**
     * Đếm số user theo status
     */
    public function getStatusCounts() {
        try {
            $query = "SELECT status, COUNT(*) as cnt FROM {$this->table} GROUP BY status";
            $stmt = $this->db->prepare($query);
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $counts = ['active' => 0, 'banned' => 0];
            foreach ($rows as $row) {
                $s = strtolower($row['status']);
                if (isset($counts[$s])) {
                    $counts[$s] = (int)$row['cnt'];
                }
            }
            return $counts;
        } catch (PDOException $e) {
            error_log("User getStatusCounts Error: " . $e->getMessage());
            return ['active' => 0, 'banned' => 0];
        }
    }

    /**
     * Update role của user
     */
    public function updateRole($id, $roleId) {
        try {
            $query = "UPDATE {$this->table} SET role_id = :role_id WHERE id = :id";
            $stmt = $this->db->prepare($query);
            $stmt->bindParam(':role_id', $roleId, PDO::PARAM_INT);
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            
            return $stmt->execute();
            
        } catch (PDOException $e) {
            error_log("User UpdateRole Error: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Change password
     */
    public function changePassword($id, $newPasswordHash) {
        try {
            $query = "UPDATE {$this->table} SET password_hash = :password_hash WHERE id = :id";
            $stmt = $this->db->prepare($query);
            $stmt->bindParam(':password_hash', $newPasswordHash);
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            
            return $stmt->execute();
            
        } catch (PDOException $e) {
            error_log("User ChangePassword Error: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Verify password
     */
    public function verifyPassword($password, $hash) {
        return password_verify($password, $hash);
    }
    
    /**
     * Gán Staff vào rạp
     */
    public function assignStaffToCinema($userId, $cinemaId) {
        try {
            // Delete existing assignment if any
            $deleteQuery = "DELETE FROM cinema_staff WHERE user_id = :user_id";
            $deleteStmt = $this->db->prepare($deleteQuery);
            $deleteStmt->bindParam(':user_id', $userId, PDO::PARAM_INT);
            $deleteStmt->execute();
            
            // Insert new assignment
            $query = "INSERT INTO cinema_staff (cinema_id, user_id, created_at) VALUES (:cinema_id, :user_id, NOW())";
            $stmt = $this->db->prepare($query);
            $stmt->bindParam(':cinema_id', $cinemaId, PDO::PARAM_INT);
            $stmt->bindParam(':user_id', $userId, PDO::PARAM_INT);
            
            return $stmt->execute();
        } catch (PDOException $e) {
            error_log("User AssignStaffToCinema Error: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Gán Manager vào rạp
     */
    public function assignManagerToCinema($userId, $cinemaId) {
        try {
            // 1. Lưu vào bảng cinema_staff để hỗ trợ 1 rạp có NHIỀU manager cùng làm việc
            $this->assignStaffToCinema($userId, $cinemaId);

            // 2. Nếu rạp này chưa có General Manager (cinemas.manager_id IS NULL), cập nhật để tương thích ngược
            $checkStmt = $this->db->prepare("SELECT manager_id FROM cinemas WHERE id = :cid");
            $checkStmt->execute([':cid' => $cinemaId]);
            $currentManager = $checkStmt->fetchColumn();

            if (empty($currentManager) || (int)$currentManager === (int)$userId) {
                $stmt = $this->db->prepare("UPDATE cinemas SET manager_id = :user_id WHERE id = :cinema_id");
                $stmt->bindParam(':user_id', $userId, PDO::PARAM_INT);
                $stmt->bindParam(':cinema_id', $cinemaId, PDO::PARAM_INT);
                $stmt->execute();
            }
            
            return true;
        } catch (PDOException $e) {
            error_log("User AssignManagerToCinema Error: " . $e->getMessage());
            return false;
        }
    }
}
