-- =========================================================
-- Alerts, per-user notifications and the audit log on Supabase
-- =========================================================
-- These existed in the MySQL schema (AlertNotification, UserNotification,
-- AuditLog) but were never created in Supabase, so /api/alerts and the
-- camera toggle failed. Run once in the Supabase SQL editor.

-- 1. Alerts raised for a room
CREATE TABLE IF NOT EXISTS alert_notifications (
    alert_id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES rooms(room_id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    warning_title VARCHAR(255) NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS alert_notifications_room_idx
    ON alert_notifications (room_id, timestamp DESC);

-- 2. Each user's read/hidden state for an alert
CREATE TABLE IF NOT EXISTS user_notifications (
    user_notification_id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    alert_id INTEGER NOT NULL REFERENCES alert_notifications(alert_id) ON DELETE CASCADE,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, alert_id)
);

CREATE INDEX IF NOT EXISTS user_notifications_user_idx
    ON user_notifications (user_id, is_hidden);

-- 3. Audit log (camera toggles, etc.)
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    performed_by VARCHAR(255),
    action VARCHAR(255) NOT NULL,
    sensor_id INTEGER,
    sensor_type VARCHAR(50),
    room_name VARCHAR(100),
    details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Only the backend (service role) touches these tables.
ALTER TABLE alert_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON alert_notifications, user_notifications, audit_logs TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- PostgREST caches the schema; reload it so the new tables are visible now.
NOTIFY pgrst, 'reload schema';
