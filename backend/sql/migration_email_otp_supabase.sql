-- =========================================================
-- EMAIL OTP
-- =========================================================
-- Run once in the Supabase SQL editor, after
-- migration_sms_otp_biometric_supabase.sql.
--
-- OTP codes can now be sent by email as well as SMS. The destination column
-- holds either a phone number or an email address, and VARCHAR(20) is too
-- short for most emails.

ALTER TABLE otp_codes ALTER COLUMN destination TYPE VARCHAR(255);
