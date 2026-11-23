<?php
/**
 * Lưu và quản lý lịch sử chat AI của từng người dùng đã đăng nhập.
 * Mỗi lượt chat có thời hạn lưu trữ (expires_at) và được tự động xóa khi hết hạn.
 */
class AIChatHistory
{
    private $db;

    public function __construct($db)
    {
        $this->db = $db;
    }

    public function purgeExpired(): int
    {
        $stmt = $this->db->prepare('DELETE FROM ai_chat_messages WHERE expires_at <= NOW()');
        $stmt->execute();
        return $stmt->rowCount();
    }

    public function saveTurn(
        int $userId,
        string $userMessage,
        string $assistantReply,
        ?string $intent,
        ?string $model,
        array $links,
        int $retentionDays = 30
    ): ?int {
        if ($userId <= 0) {
            return null;
        }
        $retentionDays = max(1, min(365, $retentionDays));
        $this->purgeExpired();

        $expiresAt = (new DateTimeImmutable('now', new DateTimeZone('Asia/Ho_Chi_Minh')))
            ->modify("+{$retentionDays} days")
            ->format('Y-m-d H:i:s');

        $linksJson = json_encode(array_values($links), JSON_UNESCAPED_UNICODE);
        if ($linksJson === false) {
            $linksJson = '[]';
        }

        $stmt = $this->db->prepare(
            'INSERT INTO ai_chat_messages (user_id, user_message, assistant_reply, intent, model, links_json, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $userId,
            $userMessage,
            $assistantReply,
            $intent !== null ? substr($intent, 0, 50) : null,
            $model !== null ? substr($model, 0, 120) : null,
            $linksJson,
            $expiresAt,
        ]);

        return (int)$this->db->lastInsertId();
    }

    public function listByUser(int $userId, int $limit = 30, int $page = 1): array
    {
        if ($userId <= 0) {
            return ['items' => [], 'total' => 0, 'page' => 1, 'limit' => $limit];
        }
        $limit = max(1, min(100, $limit));
        $page = max(1, $page);
        $offset = ($page - 1) * $limit;

        $this->purgeExpired();

        $countStmt = $this->db->prepare(
            'SELECT COUNT(*) FROM ai_chat_messages WHERE user_id = ? AND expires_at > NOW()'
        );
        $countStmt->execute([$userId]);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare(
            'SELECT id, user_message, assistant_reply, intent, model, links_json, created_at, expires_at
             FROM ai_chat_messages
             WHERE user_id = ? AND expires_at > NOW()
             ORDER BY id DESC
             LIMIT ' . $limit . ' OFFSET ' . $offset
        );
        $stmt->execute([$userId]);
        $rows = array_reverse($stmt->fetchAll(PDO::FETCH_ASSOC));

        $items = [];
        foreach ($rows as $row) {
            $links = json_decode((string)($row['links_json'] ?? '[]'), true);
            $items[] = [
                'id' => (int)$row['id'],
                'user_message' => $row['user_message'],
                'assistant_reply' => $row['assistant_reply'],
                'intent' => $row['intent'],
                'model' => $row['model'],
                'links' => is_array($links) ? $links : [],
                'created_at' => $row['created_at'],
                'expires_at' => $row['expires_at'],
            ];
        }

        return [
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
        ];
    }

    public function deleteOne(int $userId, int $messageId): bool
    {
        if ($userId <= 0 || $messageId <= 0) {
            return false;
        }
        $stmt = $this->db->prepare('DELETE FROM ai_chat_messages WHERE id = ? AND user_id = ?');
        $stmt->execute([$messageId, $userId]);
        return $stmt->rowCount() > 0;
    }

    public function deleteAllByUser(int $userId): int
    {
        if ($userId <= 0) {
            return 0;
        }
        $stmt = $this->db->prepare('DELETE FROM ai_chat_messages WHERE user_id = ?');
        $stmt->execute([$userId]);
        return $stmt->rowCount();
    }
}
