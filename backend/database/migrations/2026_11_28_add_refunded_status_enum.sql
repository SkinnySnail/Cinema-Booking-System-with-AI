-- ============================================
-- Migration: Add 'Refunded' status to bookings & transactions ENUMs
-- and ensure user_profiles (address, gender) + transactions (received_amount) exist.
-- Safe to run once via scripts/run_migrations.sh and idempotent on re-run.
-- ============================================

ALTER TABLE bookings
    MODIFY COLUMN status ENUM('Pending', 'Paid', 'Cancelled', 'Expired', 'Refunded') DEFAULT 'Pending';

ALTER TABLE transactions
    MODIFY COLUMN status ENUM('Pending', 'Success', 'Failed', 'Refunded') DEFAULT 'Pending';

SET @dbname = DATABASE();

-- Ensure user_profiles.address exists
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'address') > 0,
    'SELECT 1',
    'ALTER TABLE user_profiles ADD COLUMN address VARCHAR(255) DEFAULT NULL AFTER avatar'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Ensure user_profiles.gender exists
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'gender') > 0,
    'SELECT 1',
    "ALTER TABLE user_profiles ADD COLUMN gender ENUM('male', 'female', 'other') DEFAULT NULL AFTER address"
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Ensure transactions.received_amount exists
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'transactions' AND COLUMN_NAME = 'received_amount') > 0,
    'SELECT 1',
    'ALTER TABLE transactions ADD COLUMN received_amount DECIMAL(10,2) DEFAULT NULL AFTER amount'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
