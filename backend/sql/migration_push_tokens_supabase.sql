-- =========================================================
-- Push tokens for fire alarms while the app is closed
-- =========================================================
-- One row per device. A phone that signs in to another account moves its
-- token to that account (token is unique). Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS push_tokens (
    push_token_id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    platform VARCHAR(20),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON push_tokens (user_id);

-- Only the backend (service role) touches this table.
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON push_tokens TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- PostgREST caches the schema; reload it so the new table is visible now.
NOTIFY pgrst, 'reload schema';
