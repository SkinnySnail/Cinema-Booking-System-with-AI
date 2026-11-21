-- ============================================
-- Migration: Add received_amount to transactions
-- Số tiền khách thực tế đưa khi thanh toán tiền mặt tại quầy.
-- NULL = khách trả đúng số tiền đơn hàng.
-- Safe to re-run (checks before adding columns)
-- ============================================

USE galaxy_cinema;

SET @dbname = DATABASE();
SET @tablename = 'transactions';
SET @columnname = 'received_amount';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE transactions ADD COLUMN received_amount DECIMAL(10,2) DEFAULT NULL AFTER amount'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
