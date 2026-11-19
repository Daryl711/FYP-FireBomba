-- Per-device keys for the Pi sync endpoints (/api/sync/*).
--
-- Each Pi has its own id (e.g. PI001) and secret key, and may only write
-- readings and aggregates for the rooms listed in sync_device_rooms. A leaked
-- key then exposes only that Pi's rooms, and one Pi can be revoked
-- (is_active = FALSE) without touching the others.
--
-- Only a SHA-256 hash of the key is stored. The key itself is 32 random bytes,
-- so a fast hash is enough; it is shown once, by the provisioning script:
--
--   cd backend
--   npm run sync-device -- PI001 1-4
--
-- Run this file once in the Supabase SQL editor; re-running it is safe.

CREATE TABLE IF NOT EXISTS public.sync_devices (
    device_id VARCHAR(64) PRIMARY KEY,
    -- Hex SHA-256 of the device key.
    key_hash CHAR(64) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.sync_device_rooms (
    device_id VARCHAR(64) NOT NULL
        REFERENCES public.sync_devices(device_id) ON DELETE CASCADE,
    room_id INTEGER NOT NULL
        REFERENCES public.rooms(room_id) ON DELETE CASCADE,
    PRIMARY KEY (device_id, room_id)
);

-- Only the backend (service role) reads these; keep them away from the
-- anon/authenticated API roles.
ALTER TABLE public.sync_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_device_rooms ENABLE ROW LEVEL SECURITY;
