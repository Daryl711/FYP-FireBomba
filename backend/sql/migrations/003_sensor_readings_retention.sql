-- Daily retention for sensor data, run inside Supabase:
--   sensor_readings   older than 7 days  are deleted
--   sensor_aggregates older than 30 days are deleted
--
-- The app only uses raw readings for the live view (latest reading and the
-- last 10 per room) and aggregates for the last 2 hours / latest 100 rows,
-- so nothing the app shows is lost. Run this whole file once in the
-- Supabase SQL editor; re-running it is safe.
--
-- Requires the pg_cron extension: Dashboard > Database > Extensions > pg_cron
-- (the CREATE EXTENSION below does the same if your role is allowed to).

-- 1. Indexes so the daily deletes do not scan the whole tables.
CREATE INDEX IF NOT EXISTS idx_sensor_readings_timestamp
    ON public.sensor_readings (timestamp);

CREATE INDEX IF NOT EXISTS idx_sensor_aggregates_window_end
    ON public.sensor_aggregates (window_end);


-- 2. Cleanup functions. Callable by hand too:
--      SELECT public.purge_old_sensor_readings();             -- 7 days
--      SELECT public.purge_old_sensor_readings('14 days');
--      SELECT public.purge_old_sensor_aggregates();           -- 30 days
--      SELECT public.purge_old_sensor_aggregates('90 days');
CREATE OR REPLACE FUNCTION public.purge_old_sensor_readings(
    retention INTERVAL DEFAULT INTERVAL '7 days'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    IF retention < INTERVAL '1 day' THEN
        RAISE EXCEPTION 'retention must be at least 1 day, got %', retention;
    END IF;

    DELETE FROM public.sensor_readings
    WHERE timestamp < now() - retention
       -- timestamp is nullable; fall back to created_at for such rows.
       OR (timestamp IS NULL AND created_at < now() - retention);

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_old_sensor_aggregates(
    retention INTERVAL DEFAULT INTERVAL '30 days'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    IF retention < INTERVAL '1 day' THEN
        RAISE EXCEPTION 'retention must be at least 1 day, got %', retention;
    END IF;

    DELETE FROM public.sensor_aggregates
    WHERE window_end < now() - retention
       -- window_end is nullable; fall back to created_at for such rows.
       OR (window_end IS NULL AND created_at < now() - retention);

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- Only the backend's service role / cron should run these, not app users.
REVOKE ALL ON FUNCTION public.purge_old_sensor_readings(INTERVAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_old_sensor_readings(INTERVAL) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_old_sensor_aggregates(INTERVAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_old_sensor_aggregates(INTERVAL) FROM anon, authenticated;


-- 3. Schedule both daily at 19:15 UTC (03:15 Malaysia / Singapore time).
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Re-running this file replaces the jobs instead of adding duplicates.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('purge-old-sensor-readings', 'purge-old-sensor-aggregates');

SELECT cron.schedule(
    'purge-old-sensor-readings',
    '15 19 * * *',
    $$SELECT public.purge_old_sensor_readings()$$
);

SELECT cron.schedule(
    'purge-old-sensor-aggregates',
    '20 19 * * *',
    $$SELECT public.purge_old_sensor_aggregates()$$
);

-- Check runs with:
--   SELECT j.jobname, d.status, d.return_message, d.start_time
--   FROM cron.job_run_details d
--   JOIN cron.job j USING (jobid)
--   WHERE j.jobname LIKE 'purge-old-sensor-%'
--   ORDER BY d.start_time DESC LIMIT 10;
