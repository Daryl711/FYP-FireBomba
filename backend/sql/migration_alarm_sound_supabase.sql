-- =========================================================
-- Alarm sound preference per device
-- =========================================================
-- Each phone picks its own fire alarm tone (Profile > Notifications). The
-- backend sends that tone, and its Android channel, in every fire push.
-- Values: classic, siren, beep, bell. Run once in the Supabase SQL editor.
ALTER TABLE push_tokens
    ADD COLUMN IF NOT EXISTS alarm_sound VARCHAR(20) NOT NULL DEFAULT 'classic';

-- PostgREST caches the schema; reload it so the new column is visible now.
NOTIFY pgrst, 'reload schema';