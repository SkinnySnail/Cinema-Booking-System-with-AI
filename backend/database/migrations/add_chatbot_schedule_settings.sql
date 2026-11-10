-- Existing databases: add defaults without replacing an administrator's settings.
INSERT IGNORE INTO system_configs (config_key,config_value,description) VALUES
('ai_chat_schedule_days','7','Số ngày chatbot được tra cứu, gồm hôm nay; tối đa 7 ngày'),
('ai_chat_showtimes_per_day','8','Số suất tối đa chatbot hiển thị mỗi ngày, từ 1 đến 20');
