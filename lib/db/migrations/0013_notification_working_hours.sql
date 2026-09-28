-- 0013_notification_working_hours.sql
--
-- Run ONCE against the Supabase project, as the database owner. Additive
-- only. Safe on a database with 0001–0012 applied; fails loudly on re-run.
--
-- Why (verified 2026-09-28, zero-trust audit):
--   spec/locked-decisions.md D-07 locks "Working Hours: configurable, defaults
--   to 24-hour flexibility (00:00-23:59)". But notification_settings had no
--   column for it, so the "24-hour flexible rhythm" toggle in Settings and
--   the workStart/workEnd step in Onboarding had nowhere to write. Both wrote
--   to localStorage only, which means the value vanished on another device
--   and was never consulted by the reschedule sweep.
--
-- Semantics (mirrored in lib/db/src/schema/notifications.ts):
--   flexible_24h BOOLEAN NOT NULL DEFAULT true
--     true  -> 24-hour flexibility; work_start/work_end are ignored entirely.
--     false -> the sweep treats work_start..work_end as the schedulable
--              window (may wrap past midnight, e.g. 22 -> 7).
--   work_start / work_end INTEGER, 0-23, only meaningful when flexible_24h
--   is false. Default 9 / 18, the "traditional" case the onboarding offers.
--
--   Existing rows get flexible_24h = true, which is the documented default and
--   matches the current behavior of the (unpersisted) default in the UI, so
--   no backfill of work hours is needed.

ALTER TABLE public.notification_settings
  ADD COLUMN flexible_24h BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN work_start INTEGER NOT NULL DEFAULT 9,
  ADD COLUMN work_end INTEGER NOT NULL DEFAULT 18;

ALTER TABLE public.notification_settings
  ADD CONSTRAINT notification_settings_work_hours_check
  CHECK (work_start BETWEEN 0 AND 23 AND work_end BETWEEN 0 AND 23);
