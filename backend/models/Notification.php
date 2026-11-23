<?php
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../service/PusherService.php';

class Notification {
    private $db;
    private $table = 'notifications';
    private $readTable = 'notification_reads';
    private $hasTargetUserColumn = null;
    private $hasReadTable = null;

    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
    }

    private function supportsTargetUser() {
        if ($this->hasTargetUserColumn !== null) {
            return $this->hasTargetUserColumn;
        }

        $stmt = $this->db->query("SHOW COLUMNS FROM {$this->table} LIKE 'target_user_id'");
        $this->hasTargetUserColumn = (bool)$stmt->fetch(PDO::FETCH_ASSOC);
        return $this->hasTargetUserColumn;
    }

    private function supportsReadTable() {
        if ($this->hasReadTable !== null) {
            return $this->hasReadTable;
        }

        $sql = 'SELECT 1
                FROM information_schema.tables
                WHERE table_schema = DATABASE()
                  AND table_name = :table_name
                LIMIT 1';

        $stmt = $this->db->prepare($sql);
        $stmt->execute([':table_name' => $this->readTable]);
        $this->hasReadTable = (bool)$stmt->fetch(PDO::FETCH_NUM);
        return $this->hasReadTable;
    }

    public function publishDueNotifications() {
        $sql = "UPDATE {$this->table}
                SET status = 'SENT',
                    is_active = 1,
                    sent_at = NOW()
                WHERE status = 'SCHEDULED'
                  AND scheduled_at IS NOT NULL
                  AND scheduled_at <= NOW()";

        $stmt = $this->db->prepare($sql);
        $stmt->execute();
        $published = $stmt->rowCount();
        if ($published > 0) {
            PusherService::triggerNotificationsUpdated();
        }
        return $published;
    }

    private function getAudienceForRoleId($roleId) {
        $roleId = (int)$roleId;
        if ($roleId === 5) {
            return 'ADMIN';
        }
        if ($roleId === 3 || $roleId === 4) {
            return 'STAFF';
        }
        return 'USER';
    }

    private function countRecipientsByAudience($audience, $targetUserId = null) {
        error_log('Notification::countRecipientsByAudience - audience: ' . $audience . ', targetUserId: ' . (string)$targetUserId);

        if ($this->supportsTargetUser() && $targetUserId !== null) {
            $sql = "SELECT COUNT(*) AS total FROM users WHERE id = :user_id AND status = 'Active'";
            try {
                $stmt = $this->db->prepare($sql);
                $stmt->execute([':user_id' => (int)$targetUserId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                return (int)($row['total'] ?? 0);
            } catch (Exception $e) {
                error_log('Notification::countRecipientsByAudience (target user) ERROR: ' . $e->getMessage());
                return 0;
            }
        }
        
        $audience = strtoupper((string)$audience);
        if ($audience === 'GUEST') {
            // Public notification: guest + logged-in users.
            $audience = 'ALL';
        }

        $where = ["status = 'Active'"];
        if ($audience === 'USER') {
            $where[] = 'role_id = 2';
        } elseif ($audience === 'STAFF') {
            $where[] = 'role_id IN (3,4)';
        } elseif ($audience === 'ADMIN') {
            $where[] = 'role_id = 5';
        }

        $sql = 'SELECT COUNT(*) AS total FROM users WHERE ' . implode(' AND ', $where);
        error_log('Notification::countRecipientsByAudience SQL: ' . $sql);
        
        try {
            $stmt = $this->db->query($sql);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            $count = (int)($row['total'] ?? 0);
            error_log('Notification::countRecipientsByAudience result: ' . $count);
            return $count;
        } catch (Exception $e) {
            error_log('Notification::countRecipientsByAudience ERROR: ' . $e->getMessage());
            return 0;
        }
    }

    private function countReadsByNotification($notificationId, $audience, $targetUserId = null) {
        error_log('Notification::countReadsByNotification - notifId: ' . $notificationId . ', audience: ' . $audience . ', targetUserId: ' . (string)$targetUserId);
        
        if (!$this->supportsReadTable()) {
            error_log('Notification::countReadsByNotification - notification_reads table not supported');
            return 0;
        }

        $audience = strtoupper((string)$audience);
        if ($audience === 'GUEST') {
            // Public notification: count reads from all active users.
            $audience = 'ALL';
        }

        $sql = "SELECT COUNT(*) AS total
                FROM {$this->readTable} nr
                INNER JOIN users u ON u.id = nr.user_id
                WHERE nr.notification_id = :notification_id
                  AND u.status = 'Active'";

        $params = [':notification_id' => (int)$notificationId];

        if ($this->supportsTargetUser() && $targetUserId !== null) {
            $sql .= ' AND nr.user_id = :target_user_id';
            $params[':target_user_id'] = (int)$targetUserId;
        } else {
            if ($audience === 'USER') {
                $sql .= ' AND u.role_id = 2';
            } elseif ($audience === 'STAFF') {
                $sql .= ' AND u.role_id IN (3,4)';
            } elseif ($audience === 'ADMIN') {
                $sql .= ' AND u.role_id = 5';
            }
        }

        error_log('Notification::countReadsByNotification SQL: ' . $sql);
        
        try {
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            $count = (int)($row['total'] ?? 0);
            error_log('Notification::countReadsByNotification result: ' . $count);
            return $count;
        } catch (Exception $e) {
            error_log('Notification::countReadsByNotification ERROR: ' . $e->getMessage());
            return 0;
        }
    }

    public function getUserNotifications($userId, $roleId, $limit = 30) {
        $this->publishDueNotifications();

        $audience = $this->getAudienceForRoleId($roleId);
        $targetUserWhere = $this->supportsTargetUser()
            ? ' AND (n.target_user_id IS NULL OR n.target_user_id = :target_user_id)'
            : '';

        if ($this->supportsReadTable()) {
            $sql = "SELECT n.id, n.title, n.message, n.type, n.target_audience,
                       n.status, n.scheduled_at, n.sent_at,
                           CASE WHEN nr.id IS NULL THEN 0 ELSE 1 END AS is_read,
                           n.created_at
                    FROM {$this->table} n
                    LEFT JOIN {$this->readTable} nr
                        ON nr.notification_id = n.id
                       AND nr.user_id = :read_user_id
                    WHERE n.is_active = 1
                  AND n.status = 'SENT'
                  AND n.target_audience IN ('ALL', 'GUEST', :audience)
                                {$targetUserWhere}
                    ORDER BY n.created_at DESC
                    LIMIT :limit";
        } else {
            $sql = "SELECT n.id, n.title, n.message, n.type, n.target_audience,
                       n.status, n.scheduled_at, n.sent_at,
                       0 AS is_read,
                       n.created_at
                    FROM {$this->table} n
                    WHERE n.is_active = 1
                      AND n.status = 'SENT'
                      AND n.target_audience IN ('ALL', 'GUEST', :audience)
                      {$targetUserWhere}
                    ORDER BY n.created_at DESC
                    LIMIT :limit";
        }

        $stmt = $this->db->prepare($sql);
        if ($this->supportsReadTable()) {
            $stmt->bindValue(':read_user_id', (int)$userId, PDO::PARAM_INT);
        }
        if ($this->supportsTargetUser()) {
            $stmt->bindValue(':target_user_id', (int)$userId, PDO::PARAM_INT);
        }
        $stmt->bindValue(':audience', $audience, PDO::PARAM_STR);
        $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getPublicNotifications($limit = 20) {
        $this->publishDueNotifications();

                $targetUserWhere = $this->supportsTargetUser()
                        ? ' AND n.target_user_id IS NULL'
                        : '';
        $sql = "SELECT n.id, n.title, n.message, n.type, n.target_audience,
                       n.status, n.scheduled_at, n.sent_at,
                       0 AS is_read,
                       n.created_at
                FROM {$this->table} n
                WHERE n.is_active = 1
                  AND n.status = 'SENT'
                  AND n.target_audience IN ('ALL', 'GUEST')
                                    {$targetUserWhere}
                ORDER BY n.created_at DESC
                LIMIT :limit";

        $stmt = $this->db->prepare($sql);
        $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function markAsRead($id, $userId) {
        if (!$this->supportsReadTable()) {
            // Old schema: silently treat as successful to avoid API 500.
            return true;
        }

        $sql = "INSERT INTO {$this->readTable} (notification_id, user_id, is_read, read_at)
                VALUES (:notification_id, :user_id, 1, NOW())
                ON DUPLICATE KEY UPDATE is_read = 1, read_at = NOW()";

        $stmt = $this->db->prepare($sql);
        return $stmt->execute([
            ':notification_id' => (int)$id,
            ':user_id' => (int)$userId,
        ]);
    }

    public function listCampaigns($search = '', $type = 'all') {
        $this->publishDueNotifications();

        $where = [];
        $params = [];

        if ($search !== '') {
            $where[] = '(title LIKE :search_title OR message LIKE :search_message)';
            $params[':search_title'] = '%' . $search . '%';
            $params[':search_message'] = '%' . $search . '%';
        }

        if ($type !== '' && $type !== 'all') {
            $where[] = 'type = :type';
            $params[':type'] = strtoupper($type);
        }

        $whereSql = empty($where) ? '' : ('WHERE ' . implode(' AND ', $where));

         $sql = "SELECT id, title, message, COALESCE(type, 'SYSTEM') AS type,
             target_audience, target_user_id, status, scheduled_at, sent_at, created_at
            FROM {$this->table}
            {$whereSql}
            ORDER BY created_at DESC";

        error_log('Notification::listCampaigns SQL: ' . $sql);
        error_log('Notification::listCampaigns params: ' . json_encode($params));

        try {
            $stmt = $this->db->prepare($sql);
            foreach ($params as $key => $value) {
                $stmt->bindValue($key, $value);
            }
            $stmt->execute();

            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            error_log('Notification::listCampaigns rows count: ' . count($rows));

            $result = [];
            foreach ($rows as $row) {
                $targetUserId = $this->supportsTargetUser()
                    ? (isset($row['target_user_id']) && $row['target_user_id'] !== null ? (int)$row['target_user_id'] : null)
                    : null;
                $recipientCount = $this->countRecipientsByAudience($row['target_audience'], $targetUserId);
                $readCount = $this->countReadsByNotification($row['id'], $row['target_audience'], $targetUserId);
                $row['recipient_count'] = $recipientCount;
                $row['read_count'] = $readCount;
                $result[] = $row;
            }

            error_log('Notification::listCampaigns result count: ' . count($result));
            return $result;
        } catch (Exception $e) {
            error_log('Notification::listCampaigns ERROR: ' . $e->getMessage());
            error_log('Notification::listCampaigns TRACE: ' . $e->getTraceAsString());
            return [];
        }

    }

    public function createCampaign($title, $message, $type, $targetAudience, $createdBy = null, $scheduledAt = null) {
        $scheduledAt = $scheduledAt ? trim((string)$scheduledAt) : null;
        $isScheduled = !empty($scheduledAt);
        $status = $isScheduled ? 'SCHEDULED' : 'SENT';

        $sql = "INSERT INTO {$this->table}
                    (title, message, type, target_audience, status, scheduled_at, sent_at, created_by, is_active)
                VALUES
                    (:title, :message, :type, :target_audience, :status, :scheduled_at, :sent_at, :created_by, :is_active)";

        $stmt = $this->db->prepare($sql);
        $stmt->bindValue(':title', $title, PDO::PARAM_STR);
        $stmt->bindValue(':message', $message, PDO::PARAM_STR);
        $stmt->bindValue(':type', strtoupper((string)$type ?: 'SYSTEM'), PDO::PARAM_STR);
        $stmt->bindValue(':target_audience', strtoupper((string)$targetAudience ?: 'ALL'), PDO::PARAM_STR);
        $stmt->bindValue(':status', $status, PDO::PARAM_STR);
        if ($scheduledAt === null) {
            $stmt->bindValue(':scheduled_at', null, PDO::PARAM_NULL);
        } else {
            $stmt->bindValue(':scheduled_at', $scheduledAt, PDO::PARAM_STR);
        }
        if ($isScheduled) {
            $stmt->bindValue(':sent_at', null, PDO::PARAM_NULL);
            $stmt->bindValue(':is_active', 0, PDO::PARAM_INT);
        } else {
            $stmt->bindValue(':sent_at', date('Y-m-d H:i:s'), PDO::PARAM_STR);
            $stmt->bindValue(':is_active', 1, PDO::PARAM_INT);
        }
        if ($createdBy === null) {
            $stmt->bindValue(':created_by', null, PDO::PARAM_NULL);
        } else {
            $stmt->bindValue(':created_by', (int)$createdBy, PDO::PARAM_INT);
        }

        $stmt->execute();

        $id = (int)$this->db->lastInsertId();
        if (!$isScheduled && !$this->db->inTransaction()) {
            PusherService::triggerNotificationsUpdated();
        }
        return [
            'id' => $id,
            'recipient_count' => $this->countRecipientsByAudience(strtoupper((string)$targetAudience ?: 'ALL')),
            'status' => $status,
        ];
    }

    public function createUserNotification($userId, $title, $message, $type = 'BOOKING') {
        $userId = (int)$userId;
        if ($userId <= 0) {
            return false;
        }

        if ($this->supportsTargetUser()) {
            $sql = "INSERT INTO {$this->table}
                        (title, message, type, target_audience, target_user_id, status, sent_at, is_active)
                    VALUES
                        (:title, :message, :type, 'USER', :target_user_id, 'SENT', NOW(), 1)";
            $stmt = $this->db->prepare($sql);
            $ok = $stmt->execute([
                ':title' => $title,
                ':message' => $message,
                ':type' => strtoupper((string)$type ?: 'BOOKING'),
                ':target_user_id' => $userId,
            ]);
            // Inside a transaction (e.g. Booking::confirm) the caller pushes after commit,
            // so the client never refetches before the row is visible.
            if ($ok && !$this->db->inTransaction()) {
                PusherService::triggerNotificationsUpdated($userId);
            }
            return $ok;
        }

        // Fallback for old schema without target_user_id.
        $this->createCampaign($title, $message, $type, 'USER', null, null);
        return true;
    }

    public function deleteCampaignBySeedId($seedId) {
        $sql = "DELETE FROM {$this->table} WHERE id = :id";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([':id' => (int)$seedId]);
        return $stmt->rowCount();
    }
}
