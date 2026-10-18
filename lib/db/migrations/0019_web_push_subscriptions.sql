-- Migration 0019: web_push_subscriptions (VAPID RFC 8291 Web Push)
--
-- Adds multi-device Web Push subscriptions for lock-screen alerts
-- on mobile PWA and desktop browsers, with user_id-scoped RLS.

CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for per-user lookup during dispatch sweeps
CREATE INDEX IF NOT EXISTS web_push_subscriptions_user_id_idx
  ON public.web_push_subscriptions (user_id);

-- Enable Row Level Security
ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 1. Scoped user policies for authenticated (Clerk JWT) callers
CREATE POLICY "web_push_subscriptions_select_own"
  ON public.web_push_subscriptions
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'sub'::text) = user_id);

CREATE POLICY "web_push_subscriptions_insert_own"
  ON public.web_push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() ->> 'sub'::text) = user_id);

CREATE POLICY "web_push_subscriptions_update_own"
  ON public.web_push_subscriptions
  FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'sub'::text) = user_id)
  WITH CHECK ((auth.jwt() ->> 'sub'::text) = user_id);

CREATE POLICY "web_push_subscriptions_delete_own"
  ON public.web_push_subscriptions
  FOR DELETE TO authenticated
  USING ((auth.jwt() ->> 'sub'::text) = user_id);

-- 2. Service role / owner policy for background cron dispatch
CREATE POLICY "service_role_web_push_subscriptions"
  ON public.web_push_subscriptions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
