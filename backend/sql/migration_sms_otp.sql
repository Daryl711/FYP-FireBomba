-- Migration: SMS OTP support (login 2FA + password reset)
-- Apply this to an EXISTING firebomba_db. Fresh imports of database.sql already include it.
-- Usage: phpMyAdmin > firebomba_db > Import > this file

-- 1. Phone number on Users (nullable: existing accounts have none yet).
--    MySQL allows multiple NULLs under a UNIQUE index, so this stays safe.
ALTER TABLE Users
    ADD COLUMN phone VARCHAR(20) DEFAULT NULL AFTER email,
    ADD COLUMN phone_verified BOOLEAN NOT NULL DEFAULT FALSE AFTER phone,
    ADD UNIQUE KEY uq_users_phone (phone);

-- 1b. Email becomes optional: many longhouse residents are elderly and either
--     have no email address or never check it. Phone is the account identifier
--     and is enforced at signup by the application layer (the column stays
--     nullable so the existing seed accounts, which predate phones, still load).
--     Once every row has a phone, you can tighten it with:
--       UPDATE Users SET phone = CONCAT('+60000', user_id) WHERE phone IS NULL;
--       ALTER TABLE Users MODIFY phone VARCHAR(20) NOT NULL;
ALTER TABLE Users MODIFY email VARCHAR(50) DEFAULT NULL;

-- 2. One-time codes. Codes are stored HASHED, never in plaintext.
CREATE TABLE IF NOT EXISTS OtpCodes (
    otp_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    purpose VARCHAR(20) NOT NULL,
    destination VARCHAR(20) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    expires_at DATETIME NOT NULL,
    consumed_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    INDEX idx_otp_user_purpose (user_id, purpose, consumed_at)
);
