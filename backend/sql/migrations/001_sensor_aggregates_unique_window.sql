CREATE UNIQUE INDEX IF NOT EXISTS unique_room_window
    ON public.sensoraggregates (room_id, window_start);
