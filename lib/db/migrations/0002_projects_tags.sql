-- 0002_projects_tags.sql
--
-- Run ONCE against the Supabase project, as the database owner
-- (Supabase SQL editor uses owner rights by default). Additive only:
-- creates projects/tags/task_tags and adds tasks.project_id. Safe to run
-- on a database that already has 0001 applied; creates nothing twice
-- (fails loudly if tables already exist — do not re-run).
--
-- Semantics (mirrored in lib/db/src/schema/{projects,tags}.ts):
--   a. projects/tags carry user_id DEFAULT (auth.jwt()->>'sub'), same as
--      tasks after 0001. App code still sets userId explicitly.
--   b. Deleting a project SETs tasks.project_id NULL (work survives).
--      Deleting a task cascades its task_tags rows; deleting a tag cascades
--      its task_tags rows. Nothing orphans, deletions never block.
--   c. CHECKs mirror the Zod/OpenAPI contract: names 1..80 chars, tag names
--      1..40, colors NULL or #rrggbb, one (user_id, name) tag each.
--   d. RLS + per-user policies keyed off the Clerk `sub` claim, exactly like
--      0001 (never auth.uid()). task_tags policies key off its own
--      denormalized user_id column.
--   e. Grants for the `authenticated` role (without these, RLS passes but
--      every query gets permission denied).

-- ---------------------------------------------------------------------------
-- (a) Tables
-- ---------------------------------------------------------------------------
CREATE TABLE public.projects (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT ((auth.jwt() ->> 'sub')),
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT projects_name_check CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT projects_color_check CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE TABLE public.tags (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT ((auth.jwt() ->> 'sub')),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tags_name_check CHECK (char_length(name) BETWEEN 1 AND 40),
  CONSTRAINT tags_user_id_name_unique UNIQUE (user_id, name)
);

CREATE TABLE public.task_tags (
  task_id INTEGER NOT NULL
    CONSTRAINT task_tags_task_id_tasks_id_fk
    REFERENCES public.tasks (id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL
    CONSTRAINT task_tags_tag_id_tags_id_fk
    REFERENCES public.tags (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL DEFAULT ((auth.jwt() ->> 'sub')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT task_tags_pkey PRIMARY KEY (task_id, tag_id)
);

ALTER TABLE public.tasks
  ADD COLUMN project_id INTEGER
  CONSTRAINT tasks_project_id_projects_id_fk
  REFERENCES public.projects (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- (b) Grants for the authenticated role
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.projects, public.tags, public.task_tags TO authenticated;
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ---------------------------------------------------------------------------
-- (c) RLS + policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own projects select"
  ON public.projects FOR SELECT TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own projects insert"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own projects update"
  ON public.projects FOR UPDATE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own projects delete"
  ON public.projects FOR DELETE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own tags select"
  ON public.tags FOR SELECT TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own tags insert"
  ON public.tags FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own tags update"
  ON public.tags FOR UPDATE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own tags delete"
  ON public.tags FOR DELETE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own task tags select"
  ON public.task_tags FOR SELECT TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own task tags insert"
  ON public.task_tags FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own task tags update"
  ON public.task_tags FOR UPDATE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "own task tags delete"
  ON public.task_tags FOR DELETE TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);
