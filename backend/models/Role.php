<?php
require_once __DIR__ . '/../config/Database.php';

/**
 * Role Model - Quản lý Vai Trò Động (Dynamic RBAC)
 */
class Role {
    private $db;
    private $table = 'roles';
    
    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
    }
    
    /**
     * Lấy tất cả roles kèm số lượng user và số lượng quyền
     */
    public function getAll($filters = []) {
        try {
            $sql = "SELECT r.*,
                        COALESCE(u_cnt.cnt, 0) AS user_count,
                        COALESCE(p_cnt.cnt, 0) AS permission_count
                    FROM {$this->table} r
                    LEFT JOIN (
                        SELECT role_id, COUNT(DISTINCT user_id) AS cnt 
                        FROM user_roles 
                        GROUP BY role_id
                    ) u_cnt ON u_cnt.role_id = r.id
                    LEFT JOIN (
                        SELECT role_id, COUNT(DISTINCT permission_id) AS cnt 
                        FROM role_permissions 
                        GROUP BY role_id
                    ) p_cnt ON p_cnt.role_id = r.id
                    WHERE 1=1";
            
            $params = [];

            // Vai trò Khách vãng lai (Guest, id=1) là vai trò ảo của middleware cho khách chưa đăng nhập, không phải tài khoản người dùng
            if (empty($filters['include_guest'])) {
                $sql .= " AND r.id != 1 AND r.base_role != 'guest'";
            }

            if (!empty($filters['base_role'])) {
                $sql .= " AND r.base_role = :base_role";
                $params[':base_role'] = $filters['base_role'];
            }

            if (isset($filters['is_active'])) {
                $sql .= " AND r.is_active = :is_active";
                $params[':is_active'] = (int)$filters['is_active'];
            }

            if (!empty($filters['search'])) {
                $sql .= " AND (r.name LIKE :search OR r.display_name LIKE :search OR r.code LIKE :search)";
                $params[':search'] = '%' . $filters['search'] . '%';
            }

            $sql .= " ORDER BY r.is_system DESC, r.id ASC";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            error_log("Role GetAll Error: " . $e->getMessage());
            return [];
        }
    }
    
    /**
     * Lấy role theo ID
     */
    public function getById($id) {
        try {
            $query = "SELECT r.*,
                        COALESCE(u_cnt.cnt, 0) AS user_count,
                        COALESCE(p_cnt.cnt, 0) AS permission_count
                      FROM {$this->table} r
                      LEFT JOIN (
                          SELECT role_id, COUNT(DISTINCT user_id) AS cnt 
                          FROM user_roles 
                          GROUP BY role_id
                      ) u_cnt ON u_cnt.role_id = r.id
                      LEFT JOIN (
                          SELECT role_id, COUNT(DISTINCT permission_id) AS cnt 
                          FROM role_permissions 
                          GROUP BY role_id
                      ) p_cnt ON p_cnt.role_id = r.id
                      WHERE r.id = :id LIMIT 1";
            $stmt = $this->db->prepare($query);
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            $stmt->execute();
            
            return $stmt->fetch(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            error_log("Role GetById Error: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Lấy role theo code hoặc name
     */
    public function getByCodeOrName($identifier) {
        try {
            $query = "SELECT * FROM {$this->table} WHERE code = :idtf OR name = :idtf LIMIT 1";
            $stmt = $this->db->prepare($query);
            $stmt->bindParam(':idtf', $identifier);
            $stmt->execute();
            
            return $stmt->fetch(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            error_log("Role GetByCodeOrName Error: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Tạo vai trò mới (Custom Role)
     */
    public function create($data) {
        try {
            $query = "INSERT INTO {$this->table} 
                        (name, code, display_name, description, base_role, is_system, is_active) 
                      VALUES 
                        (:name, :code, :display_name, :description, :base_role, 0, :is_active)";
            
            $stmt = $this->db->prepare($query);
            
            $name = trim($data['name']);
            $code = !empty($data['code']) ? trim($data['code']) : strtoupper(preg_replace('/[^a-zA-Z0-9_]/', '_', $name));
            $displayName = !empty($data['display_name']) ? trim($data['display_name']) : $name;
            $description = $data['description'] ?? '';
            $baseRole = in_array($data['base_role'] ?? '', ['admin', 'manager', 'staff', 'member', 'guest']) ? $data['base_role'] : 'staff';
            $isActive = isset($data['is_active']) ? (int)$data['is_active'] : 1;

            $stmt->bindParam(':name', $name);
            $stmt->bindParam(':code', $code);
            $stmt->bindParam(':display_name', $displayName);
            $stmt->bindParam(':description', $description);
            $stmt->bindParam(':base_role', $baseRole);
            $stmt->bindParam(':is_active', $isActive, PDO::PARAM_INT);
            
            if ($stmt->execute()) {
                return (int)$this->db->lastInsertId();
            }
            
            return false;
        } catch (PDOException $e) {
            error_log("Role Create Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Cập nhật vai trò
     */
    public function update($id, $data) {
        try {
            $role = $this->getById($id);
            if (!$role) return false;

            $fields = [];
            $params = [':id' => $id];

            // Nếu không phải role hệ thống, cho phép cập nhật tên và code
            if ((int)$role['is_system'] === 0) {
                if (isset($data['name'])) {
                    $fields[] = "name = :name";
                    $params[':name'] = trim($data['name']);
                }
                if (isset($data['code'])) {
                    $fields[] = "code = :code";
                    $params[':code'] = trim($data['code']);
                }
                if (isset($data['base_role']) && in_array($data['base_role'], ['admin', 'manager', 'staff', 'member', 'guest'])) {
                    $fields[] = "base_role = :base_role";
                    $params[':base_role'] = $data['base_role'];
                }
            }

            if (isset($data['display_name'])) {
                $fields[] = "display_name = :display_name";
                $params[':display_name'] = trim($data['display_name']);
            }
            if (isset($data['description'])) {
                $fields[] = "description = :description";
                $params[':description'] = $data['description'];
            }
            if (isset($data['is_active'])) {
                $fields[] = "is_active = :is_active";
                $params[':is_active'] = (int)$data['is_active'];
            }

            if (empty($fields)) return true;

            $sql = "UPDATE {$this->table} SET " . implode(", ", $fields) . " WHERE id = :id";
            $stmt = $this->db->prepare($sql);
            return $stmt->execute($params);
        } catch (PDOException $e) {
            error_log("Role Update Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Xóa vai trò tùy chỉnh (Không cho phép xóa vai trò hệ thống)
     */
    public function delete($id) {
        try {
            $role = $this->getById($id);
            if (!$role || (int)$role['is_system'] === 1) {
                return false; // Chặn xóa vai trò hệ thống
            }

            $stmt = $this->db->prepare("DELETE FROM {$this->table} WHERE id = :id");
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            return $stmt->execute();
        } catch (PDOException $e) {
            error_log("Role Delete Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Lấy danh sách users có role này
     */
    public function getUsersByRoleId($roleId) {
        try {
            $query = "SELECT u.id, u.email, u.status, u.role_id AS primary_role_id,
                             p.full_name, p.phone, p.avatar AS avatar_url,
                             ur.is_primary, ur.assigned_at, ur.reason
                      FROM user_roles ur
                      JOIN users u ON u.id = ur.user_id
                      LEFT JOIN user_profiles p ON p.user_id = u.id
                      WHERE ur.role_id = :role_id
                      ORDER BY u.id DESC";
            $stmt = $this->db->prepare($query);
            $stmt->bindParam(':role_id', $roleId, PDO::PARAM_INT);
            $stmt->execute();
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            error_log("Role getUsersByRoleId Error: " . $e->getMessage());
            return [];
        }
    }

    /**
     * Lấy tất cả roles của 1 user
     */
    public function getUserRoles($userId) {
        try {
            $query = "SELECT r.*, ur.is_primary, ur.assigned_at, ur.reason
                      FROM user_roles ur
                      JOIN roles r ON r.id = ur.role_id
                      WHERE ur.user_id = :user_id
                      ORDER BY ur.is_primary DESC, r.id ASC";
            $stmt = $this->db->prepare($query);
            $stmt->bindParam(':user_id', $userId, PDO::PARAM_INT);
            $stmt->execute();
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            error_log("Role getUserRoles Error: " . $e->getMessage());
            return [];
        }
    }

    /**
     * Lấy tất cả permissions hiệu lực của 1 user (Hợp nhất từ tất cả roles của user)
     */
    public function getUserEffectivePermissions($userId) {
        try {
            $userRoles = $this->getUserRoles($userId);
            if (empty($userRoles)) {
                return [];
            }

            $roleIds = array_column($userRoles, 'id');
            $placeholders = implode(',', array_fill(0, count($roleIds), '?'));

            $query = "SELECT DISTINCT p.*
                      FROM role_permissions rp
                      JOIN permissions p ON p.id = rp.permission_id
                      WHERE rp.role_id IN ($placeholders)
                        AND p.is_active = 1
                      ORDER BY p.module, p.name";
            
            $stmt = $this->db->prepare($query);
            $stmt->execute($roleIds);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            error_log("Role getUserEffectivePermissions Error: " . $e->getMessage());
            return [];
        }
    }

    /**
     * Gán / Đồng bộ roles cho 1 user
     * Đảm bảo luôn giữ role hệ thống tương thích
     */
    public function syncUserRoles($userId, array $roleIds, $assignedBy = null, $reason = null) {
        try {
            $this->db->beginTransaction();

            // 1. Xác định role chính hệ thống của user
            $userCheck = $this->db->prepare("SELECT id, role_id FROM users WHERE id = :id");
            $userCheck->execute([':id' => $userId]);
            $user = $userCheck->fetch(PDO::FETCH_ASSOC);
            if (!$user) {
                $this->db->rollBack();
                return false;
            }

            $isRootAdmin = ((int)$userId === 1 || $user['email'] === 'admin@galaxy.vn');
            if ($isRootAdmin && !in_array(5, $roleIds)) {
                $roleIds[] = 5;
            }

            if (empty($roleIds)) {
                $this->db->rollBack();
                return false;
            }

            // Xóa các roles cũ trong user_roles
            $delStmt = $this->db->prepare("DELETE FROM user_roles WHERE user_id = :uid");
            $delStmt->execute([':uid' => $userId]);

            // Chèn lại các roles mới, vai trò đầu tiên làm primary
            $insStmt = $this->db->prepare("
                INSERT INTO user_roles (user_id, role_id, is_primary, assigned_at, assigned_by, reason)
                VALUES (:uid, :rid, :is_primary, NOW(), :by, :reason)
            ");

            $primaryRoleId = (int)$roleIds[0];
            foreach ($roleIds as $idx => $rid) {
                $rid = (int)$rid;
                $isPrimary = ($idx === 0) ? 1 : 0;
                $insStmt->execute([
                    ':uid' => $userId,
                    ':rid' => $rid,
                    ':is_primary' => $isPrimary,
                    ':by' => $assignedBy,
                    ':reason' => $reason
                ]);
            }

            // Cập nhật lại users.role_id theo vai trò chính để tương thích ngược
            $updateUser = $this->db->prepare("UPDATE users SET role_id = :rid WHERE id = :uid");
            $updateUser->execute([':rid' => $primaryRoleId, ':uid' => $userId]);

            $this->db->commit();
            return true;
        } catch (Exception $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log("Role syncUserRoles Error: " . $e->getMessage());
            return false;
        }
    }
}
