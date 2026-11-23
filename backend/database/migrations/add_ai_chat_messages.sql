-- Migration: Add ai_chat_messages table for storing authenticated user AI chat history with automatic expiry (TTL).
CREATE TABLE IF NOT EXISTS ai_chat_messages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT 'FK -> users (chỉ lưu lịch sử của người dùng đã đăng nhập)',
    user_message TEXT NOT NULL,
    assistant_reply TEXT NOT NULL,
    intent VARCHAR(50) NULL,
    model VARCHAR(120) NULL,
    links_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL COMMENT 'Thời điểm tự động xóa dữ liệu cá nhân',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_ai_chat_user_created (user_id, created_at DESC),
    INDEX idx_ai_chat_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO system_configs (config_key, config_value, description) VALUES
('ai_chat_history_retention_days', '30', 'Số ngày lưu lịch sử chat AI trước khi tự động xóa');
