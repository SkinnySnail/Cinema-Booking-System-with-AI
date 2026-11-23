-- Existing databases: add the per-booking seat limit without replacing an administrator's setting.
INSERT IGNORE INTO system_configs (config_key,config_value,description) VALUES
('max_seats_per_booking','8','Số ghế tối đa trong một đơn đặt vé');
