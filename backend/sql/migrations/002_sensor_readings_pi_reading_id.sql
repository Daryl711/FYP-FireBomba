-- Lets the Pi's bulk sync be retried safely.
--
-- pi_reading_id is the reading's id in the Pi's local MySQL. If the backend
-- saves a batch but the Pi never gets the reply, the Pi sends the same batch
-- again; the unique index makes the second copy a no-op instead of a
-- duplicate row.
--
-- The timestamp is part of the key so that a Pi whose database was reset
-- (ids restart at 1) is not mistaken for a retry of old readings.
-- Rows synced before this migration keep pi_reading_id NULL, and Postgres
-- treats NULLs as distinct, so they never conflict.

ALTER TABLE public.sensor_readings
    ADD COLUMN IF NOT EXISTS pi_reading_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS unique_room_pi_reading
    ON public.sensor_readings (room_id, pi_reading_id, timestamp);
