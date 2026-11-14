-- Add defaults while keeping saved chatbot settings.
INSERT IGNORE INTO system_configs (config_key, config_value, description) VALUES
('ai_chat_show_reasons', '1', 'Hiện lý do gợi ý phim'),
('ai_chat_group_by', 'date_movie', 'Nhóm lịch theo ngày và phim hoặc ngày và rạp'),
('ai_chat_empty_result_policy', 'suggest_alternatives', 'Cách xử lý khi không tìm thấy suất phù hợp'),
('ai_chat_context_ttl_minutes', '15', 'Số phút giữ ngữ cảnh từ lượt hỏi gần nhất'),
('ai_chat_ambiguity_policy', 'clarify', 'Hỏi lại khi yêu cầu có nhiều cách hiểu');
