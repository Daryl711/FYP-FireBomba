-- Per-account Fire Safety Quiz badge and best passing score.
-- Run once in Supabase Dashboard > SQL Editor before deploying the backend.
CREATE TABLE IF NOT EXISTS public.user_fire_safety_progress (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    quiz_passed BOOLEAN NOT NULL DEFAULT FALSE,
    passed_at TIMESTAMPTZ,
    best_quiz_score INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fire_safety_best_score_check
        CHECK (best_quiz_score IS NULL OR best_quiz_score BETWEEN 0 AND 10)
);

ALTER TABLE public.user_fire_safety_progress ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_fire_safety_progress'
          AND policyname = 'Users can view their own fire safety progress'
    ) THEN
        CREATE POLICY "Users can view their own fire safety progress"
            ON public.user_fire_safety_progress FOR SELECT
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_fire_safety_progress'
          AND policyname = 'Users can create their own fire safety progress'
    ) THEN
        CREATE POLICY "Users can create their own fire safety progress"
            ON public.user_fire_safety_progress FOR INSERT
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_fire_safety_progress'
          AND policyname = 'Users can update their own fire safety progress'
    ) THEN
        CREATE POLICY "Users can update their own fire safety progress"
            ON public.user_fire_safety_progress FOR UPDATE
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END
$$;
