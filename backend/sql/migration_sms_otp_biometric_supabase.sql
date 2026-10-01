-- Migration: SMS OTP (login 2FA + password reset) and biometric login sessions
-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Safe to re-run: every statement is IF NOT EXISTS.

-- =========================================================
-- 1. PHONE NUMBER ON USERS
-- =========================================================
-- Nullable because existing accounts have no phone yet. An account without a
-- phone simply skips the SMS step at login. Stored as +60123456789.

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- To give an existing account a phone (needed before its OTP login works):
--   UPDATE users SET phone = '+60123456789' WHERE email = 'someone@example.com';


-- =========================================================
-- 2. ONE-TIME CODES
-- =========================================================
-- Codes are stored HASHED, never in plaintext. pending_session holds the
-- Supabase session opened by the password check at login step 1, so it can be
-- handed to the app only after the SMS code comes back at step 2.

CREATE TABLE IF NOT EXISTS otp_codes (
    otp_id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    purpose VARCHAR(20) NOT NULL,
    destination VARCHAR(20) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    pending_session JSONB,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT otp_codes_user_fk
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_user_purpose
    ON otp_codes (user_id, purpose, consumed_at);


-- =========================================================
-- 3. SESSION DEADLINES (biometric login)
-- =========================================================
-- One row per Supabase login session. expires_at is an ABSOLUTE deadline set
-- at password login (30 days with "remember me", 7 without) and is never
-- pushed forward by a token refresh, so biometric unlock works only until
-- then. session_id is the session_id claim inside the Supabase access token.

CREATE TABLE IF NOT EXISTS user_sessions (
    session_id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    remember_me BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT user_sessions_user_fk
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions (user_id);


-- =========================================================
-- 4. ROW LEVEL SECURITY
-- =========================================================
-- Only the backend (service role key, which bypasses RLS) may touch these
-- tables. With RLS on and no policies, the app's publishable key cannot read
-- code hashes or pending sessions.

ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Tables created in the SQL editor are not granted to the API roles by
-- default, so without this the backend gets "permission denied".
GRANT SELECT, INSERT, UPDATE, DELETE ON otp_codes, user_sessions TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
