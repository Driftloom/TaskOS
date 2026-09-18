-- 0006_reminders.sql
--
-- Run ONCE against the Supabase project, as the database owner. Additive
-- only: reminders + reminder_runs + notification_settings +
-- automation_flags. Safe on a database with 0001–0005 applied; fails loudly
-- on re-run.
--
-- Semantics (mirrored in lib/db/src/schema/{reminders,notifications}.ts):
--   a. reminders.user_id DEFAULT (auth.jwt()->>'sub'); task_id CASCADE.
--      Hot-path index (status, remind_at) for the dispatcher query.
--   b. notification_settings keyed by user_id PK; quiet window 0..23,
--      chat ids numeric text (Telegram ids can exceed int32).
--   c. automation_flags seeded with ('reminders', true). RLS enabled with a
--      SELECT-only policy: the app (and dispatcher) can read the kill
--      switch, only the owner can flip it. Toggle via dashboard/SQL.
--   d. reminder_runs is the watchdog log: RLS enabled with NO policies, so
--      `authenticated` cannot read or write it at all; the owner-level
--      dispatcher (service context) writes it. Missed-tick detection =
--      no fresh row in reminder_runs (query in AUDIT).
--   e. Grants for the `authenticated` role on user tables (+ sequences).
--      reminder_runs gets NO grant (defense in depth with (d)).

CREATE TABLE public.reminders (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT ((auth.jwt() ->> 'sub')),
  task_id INTEGER NOT NULL
    CONSTRAINT reminders_task_id_tasks_id_fk
    REFERENCES public.tasks (id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  channel TEXT NOT NULL DEFAULT 'telegram',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reminders_channel_check CHECK (channel IN ('telegram')),
  CONSTRAINT reminders_status_check
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'canceled'))
);

CREATE INDEX reminders_due_idx ON public.reminders (status, remind_at);

CREATE TABLE public.reminder_runs (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  checked INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  note TEXT
);

CREATE TABLE public.notification_settings (
  user_id TEXT PRIMARY KEY,
  telegram_chat_id TEXT,
  quiet_start INTEGER NOT NULL DEFAULT 22,
  quiet_end INTEGER NOT NULL DEFAULT 7,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_settings_quiet_check
    CHECK (quiet_start BETWEEN 0 AND 23 AND quiet_end BETWEEN 0 AND 23),
  CONSTRAINT notification_settings_chat_check
    CHECK (telegram_chat_id IS NULL OR telegram_chat_id ~ '^-?[0-9]{1,19}$')
);

CREATE TABLE public.automation_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.automation_flags (key, enabled)
VALUES ('reminders', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.automation_flags (key, enabled)
VALUES ('reschedule', true)
ON CONFLICT (key) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.reminders, public.notification_settings TO authenticated;
GRANT SELECT
  ON public.automation_flags TO authenticated;
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own reminders select"
  ON public.reminders FOR SELECT TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own reminders insert"
  ON public.reminders FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own reminders update"
  ON public.reminders FOR UPDATE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own reminders delete"
  ON public.reminders FOR DELETE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own notification settings select"
  ON public.notification_settings FOR SELECT TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own notification settings insert"
  ON public.notification_settings FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own notification settings update"
  ON public.notification_settings FOR UPDATE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own notification settings delete"
  ON public.notification_settings FOR DELETE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "flags readable"
  ON public.automation_flags FOR SELECT TO authenticated
  USING (true);

-- reminder_runs: intentionally NO policies (owner-only watchdog log).
