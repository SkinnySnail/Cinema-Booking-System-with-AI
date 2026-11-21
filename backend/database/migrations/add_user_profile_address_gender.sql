-- ============================================
-- Migration: Add missing columns to user_profiles
-- address + gender are read by UserProfile::getFullProfile() but were never
-- present in schema.sql, causing:
--   SQLSTATE[42S22]: Column not found: 1054 Unknown column 'up.address'
-- Safe to re-run (checks before adding columns)
-- ============================================

USE galaxy_cinema;

SET @dbname = DATABASE();

-- Add address column to user_profiles (if not exists)
SET @tablename = 'user_profiles';
SET @columnname = 'address';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE user_profiles ADD COLUMN address VARCHAR(255) DEFAULT NULL AFTER avatar'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add gender column to user_profiles (if not exists)
SET @columnname = 'gender';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  "ALTER TABLE user_profiles ADD COLUMN gender ENUM('male','female','other') DEFAULT NULL AFTER address"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
