<?php
require_once __DIR__ . '/../config/Database.php';

/**
 * AuditLog Model - Ghi & Đọc Nhật Ký Kiểm Toán Phân Quyền
 */
class AuditLog {
    private $db;
    private $table = 'permission_audit_logs';

    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
    }

    /**
     * Ghi nhận một hành động vào nhật ký (Append-only)
     */
    public function log($actorId, $actorName, $action, $targetType, $targetId, $targetName, $reason = null, $oldValue = null, $newValue = null, $ip = null) {
        try {
            $stmt = $this->db->prepare("
                INSERT INTO {$this->table} 
                    (actor_id, actor_name, action, target_type, target_id, target_name, reason, old_value, new_value, ip_address, created_at)
                VALUES 
                    (:actor_id, :actor_name, :action, :target_type, :target_id, :target_name, :reason, :old_val, :new_val, :ip, NOW())
            ");

            return $stmt->execute([
                ':actor_id'    => $actorId,
                ':actor_name'  => $actorName,
                ':action'      => $action,
                ':target_type' => $targetType,
                ':target_id'   => $targetId,
                ':target_name' => $targetName,
                ':reason'      => $reason,
                ':old_val'     => $oldValue ? json_encode($oldValue, JSON_UNESCAPED_UNICODE) : null,
                ':new_val'     => $newValue ? json_encode($newValue, JSON_UNESCAPED_UNICODE) : null,
                ':ip'          => $ip ?? ($_SERVER['REMOTE_ADDR'] ?? null)
            ]);
        } catch (PDOException $e) {
            error_log("AuditLog log Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Lấy danh sách audit logs với bộ lọc
     */
    public function getAll($filters = [], $limit = 50, $offset = 0) {
        try {
            $sql = "SELECT * FROM {$this->table} WHERE 1=1";
            $params = [];

            if (!empty($filters['action'])) {
                $sql .= " AND action = :action";
                $params[':action'] = $filters['action'];
            }

            if (!empty($filters['actor_id'])) {
                $sql .= " AND actor_id = :actor_id";
                $params[':actor_id'] = (int)$filters['actor_id'];
            }

            if (!empty($filters['target_type'])) {
                $sql .= " AND target_type = :target_type";
                $params[':target_type'] = $filters['target_type'];
            }

            if (!empty($filters['target_id'])) {
                $sql .= " AND target_id = :target_id";
                $params[':target_id'] = (int)$filters['target_id'];
            }

            if (!empty($filters['from_date'])) {
                $sql .= " AND created_at >= :from_date";
                $params[':from_date'] = $filters['from_date'] . ' 00:00:00';
            }

            if (!empty($filters['to_date'])) {
                $sql .= " AND created_at <= :to_date";
                $params[':to_date'] = $filters['to_date'] . ' 23:59:59';
            }

            if (!empty($filters['search'])) {
                $sql .= " AND (actor_name LIKE :s OR target_name LIKE :s OR reason LIKE :s)";
                $params[':s'] = '%' . $filters['search'] . '%';
            }

            $sql .= " ORDER BY id DESC LIMIT :limit OFFSET :offset";

            $stmt = $this->db->prepare($sql);
            foreach ($params as $k => $v) {
                $stmt->bindValue($k, $v);
            }
            $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
            $stmt->execute();

            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            error_log("AuditLog getAll Error: " . $e->getMessage());
            return [];
        }
    }

    /**
     * Đếm tổng số bản ghi
     */
    public function count($filters = []) {
        try {
            $sql = "SELECT COUNT(*) FROM {$this->table} WHERE 1=1";
            $params = [];

            if (!empty($filters['action'])) {
                $sql .= " AND action = :action";
                $params[':action'] = $filters['action'];
            }

            if (!empty($filters['actor_id'])) {
                $sql .= " AND actor_id = :actor_id";
                $params[':actor_id'] = (int)$filters['actor_id'];
            }

            if (!empty($filters['from_date'])) {
                $sql .= " AND created_at >= :from_date";
                $params[':from_date'] = $filters['from_date'] . ' 00:00:00';
            }

            if (!empty($filters['to_date'])) {
                $sql .= " AND created_at <= :to_date";
                $params[':to_date'] = $filters['to_date'] . ' 23:59:59';
            }

            if (!empty($filters['search'])) {
                $sql .= " AND (actor_name LIKE :s OR target_name LIKE :s OR reason LIKE :s)";
                $params[':s'] = '%' . $filters['search'] . '%';
            }

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            return (int)$stmt->fetchColumn();
        } catch (PDOException $e) {
            return 0;
        }
    }
}
