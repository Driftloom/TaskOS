# Full-Text Search, Task Archival & Rich Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement PostgreSQL full-text search (`tsvector`), task archival (`status = 'archived'`), and external rich links/reference chips (`task_files` + URL metadata resolution) end-to-end across database, API, and frontend.

**Architecture:** Add migration `0017` updating `tasks_status_check`, `tasks_completed_at_check`, and adding functional GIN tsvector indexing. Extend Express API with ranked tsquery search, archival status filtering, and an SSRF-safe URL metadata resolver. Upgrade the Cadence frontend with instant `Cmd+K` task search, `Inbox`/`Today` archive filters, and interactive external reference link chips.

**Tech Stack:** Supabase PostgreSQL, Drizzle ORM, Express 5, Orval, OpenAPI 3.0, React 19, `@tanstack/react-query`, `cmdk`, Tailwind CSS v4, Lucide React, Vitest, Playwright.

**Spec:** [`spec-task-search-archive-and-links.md`](file:///C:/Users/Dell/.gemini/antigravity/brain/c041b1b6-ae97-44d1-8fdc-c432f0705da6/spec-task-search-archive-and-links.md)

## Global Constraints

- Never move a fixed/immovable calendar event, under any automation mode (`spec/auto-reschedule-engine.md Rule 1`).
- Never silently reschedule or bulk-edit (`spec/auto-reschedule-engine.md Rule 7`).
- Auto-reschedule engine (`/internal/reschedule`) and reminder dispatcher (`/internal/dispatch`) must continue filtering `status IN ('open', 'inbox')`, never touching archived tasks.
- Single-user for now, built multi-user-safe from day one: all queries strictly enforce `userId` and `runWithRls` (`auth.jwt()->>'sub'`).
- Zero arbitrary CSS values: all UI additions must strictly consume design tokens or existing utility classes.
- Full verification: all 10 gates in `node scripts/run-gates.cjs` must pass with 0 exit code before pushing.
- No deploy or release commands: Git push only to `origin/main`.

## Review Focus

- Task archival preserves completed timestamp: archiving a previously completed task must not wipe its `completedAt`.
- Search query punctuation safety: queries with special characters (`&`, `|`, `!`, `'`, `"`, `*`, `\`) must be sanitized to avoid malformed `to_tsquery` syntax errors.
- SSRF prevention: `POST /api/integrations/url-metadata` must reject private/loopback/cloud metadata IP ranges (127.0.0.1, 169.254.169.254, 10.0.0.0/8, etc.) and non-http(s) protocols.
- Archival filtering isolation: archived tasks must never leak into daily timelines or active inbox queries unless explicitly requested (`scope=archived`).
- Chip touch-target safety: link chips on mobile must retain 44px tap targets or allow safe clicking without accidentally toggling task completion.

---

### Task 1: Database Migration `0017` & Schema Alignment (`lib/db`)

**Files:**
- Create: `lib/db/migrations/0017_tasks_archive_and_search.sql`
- Modify: `lib/db/src/schema/tasks.ts:67-95`
- Test: `lib/db/tests/migrate.test.ts:70-85`

**Interfaces:**
- Consumes: `tasksTable` schema from `lib/db/src/schema/tasks.ts`.
- Produces: Updated `tasks_status_check` (`'inbox'`, `'open'`, `'completed'`, `'archived'`), updated `tasks_completed_at_check` allowing archived tasks with or without `completedAt`, and `tasks_search_gin_idx` index.

- [ ] **Step 1: Write the failing test in `lib/db/tests/migrate.test.ts`**

Add assertion expecting migration 17:
```typescript
it("loads migration 0017_tasks_archive_and_search.sql in sequence", () => {
  const names = loadMigrations().map((m) => m.filename);
  expect(names).toContain("0017_tasks_archive_and_search.sql");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/db test`
Expected: FAIL ("expected array to contain 0017_tasks_archive_and_search.sql")

- [ ] **Step 3: Create migration `0017_tasks_archive_and_search.sql`**

Write `lib/db/migrations/0017_tasks_archive_and_search.sql` with:
```sql
-- 0017_tasks_archive_and_search.sql
-- 1. Update status constraint to include 'archived'
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check 
  CHECK (status IN ('inbox', 'open', 'completed', 'archived'));

-- 2. Update completed_at constraint to permit archived completed tasks
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_completed_at_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_completed_at_check
  CHECK (
    (status = 'completed' AND completed_at IS NOT NULL) OR
    (status = 'archived' AND (completed_at IS NOT NULL OR completed_at IS NULL)) OR
    (status IN ('inbox', 'open') AND completed_at IS NULL)
  );

-- 3. Functional GIN index for full-text search across title and notes
CREATE INDEX IF NOT EXISTS tasks_search_gin_idx ON public.tasks 
  USING gin (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(notes, ''))
  );

-- 4. Fast index for archive filtering
CREATE INDEX IF NOT EXISTS tasks_user_archived_idx ON public.tasks (user_id, status)
  WHERE status = 'archived';
```

- [ ] **Step 4: Update `lib/db/src/schema/tasks.ts`**

Update the check constraints in `tasksTable`:
```typescript
check(
  "tasks_status_check",
  sql`${table.status} IN ('inbox', 'open', 'completed', 'archived')`,
),
check(
  "tasks_completed_at_check",
  sql`(${table.status} = 'completed' AND ${table.completedAt} IS NOT NULL)
      OR (${table.status} = 'archived' AND (${table.completedAt} IS NOT NULL OR ${table.completedAt} IS NULL))
      OR (${table.status} IN ('inbox', 'open') AND ${table.completedAt} IS NULL)`,
),
index("tasks_user_archived_idx").on(table.userId, table.status),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @workspace/db test`
Expected: PASS (13 passed, 25 skipped).

- [ ] **Step 6: Commit**

```bash
git add lib/db/migrations/0017_tasks_archive_and_search.sql lib/db/src/schema/tasks.ts lib/db/tests/migrate.test.ts
git commit -m "feat(db): migration 0017 for task archival and full-text search indexing"
```

---

### Task 2: OpenAPI Contract & Schema Codegen (`lib/api-spec`)

**Files:**
- Modify: `lib/api-spec/openapi.yaml:70-85, 1870-1995`
- Test: `pnpm --filter @workspace/api-spec run codegen`

**Interfaces:**
- Consumes: `lib/api-spec/openapi.yaml`.
- Produces: Regenerated `@workspace/api-zod` and `@workspace/api-client-react` with `Task.status: 'archived'`, query param `search`, query param `scope: 'archived'`, and `POST /integrations/url-metadata`.

- [ ] **Step 1: Update `lib/api-spec/openapi.yaml`**

1. In `/tasks` GET parameters:
   - Add `search` query parameter:
     ```yaml
     - name: search
       in: query
       required: false
       schema:
         type: string
         maxLength: 256
       description: Full-text search keyword matching title and notes.
     ```
   - In `scope` query parameter enum, add `archived`:
     ```yaml
     enum: [today, inbox, all, completed7d, archived]
     ```
2. In `#/components/schemas/Task`:
   - Update `status` enum:
     ```yaml
     status:
       type: string
       enum: [inbox, open, completed, archived]
     ```
3. In `#/components/schemas/TaskUpdate`:
   - Update `status` enum:
     ```yaml
     status:
       type: string
       enum: [inbox, open, completed, archived]
     ```
4. Add endpoint `/integrations/url-metadata`:
   ```yaml
   /integrations/url-metadata:
     post:
       operationId: getUrlMetadata
       tags: [integrations]
       summary: Extract title and metadata from a URL
       requestBody:
         required: true
         content:
           application/json:
             schema:
               type: object
               required: [url]
               properties:
                 url:
                   type: string
                   format: uri
       responses:
         "200":
           description: URL metadata
           content:
             application/json:
               schema:
                 $ref: "#/components/schemas/UrlMetadata"
         "400":
           description: Invalid or forbidden URL
           content:
             application/json:
               schema:
                 $ref: "#/components/schemas/Error"
   ```
5. Add schema `#/components/schemas/UrlMetadata`:
   ```yaml
   UrlMetadata:
     type: object
     required: [url, title, domain]
     properties:
       url:
         type: string
       title:
         type: string
       domain:
         type: string
   ```

- [ ] **Step 2: Run Orval codegen to verify contracts build**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: Output clean Orval generation and `tsc --build` exits with 0.

- [ ] **Step 3: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod/ lib/api-client-react/
git commit -m "feat(api-spec): add search, archived status, and url-metadata endpoints"
```

---

### Task 3: Backend Search & URL Metadata Implementation (`artifacts/api-server`)

**Files:**
- Modify: `artifacts/api-server/src/routes/tasks.ts:78-130, 365-385`
- Modify: `artifacts/api-server/src/routes/integrations.ts`
- Create: `artifacts/api-server/tests/tasks-search-and-archive.test.ts`
- Create: `artifacts/api-server/tests/url-metadata.test.ts`

**Interfaces:**
- Consumes: `tasksTable` from `@workspace/db`, `ListTasksQueryParams` from `@workspace/api-zod`.
- Produces: `GET /api/tasks?search=...`, `GET /api/tasks?scope=archived`, `PATCH /api/tasks/:id` preserving `completedAt` on archive, and `POST /api/integrations/url-metadata`.

- [ ] **Step 1: Write failing tests in `artifacts/api-server/tests/tasks-search-and-archive.test.ts` and `url-metadata.test.ts`**

Write tests asserting:
1. `GET /tasks?search=meeting` filters tasks and formats tsquery.
2. `GET /tasks?scope=archived` returns archived tasks.
3. `PATCH /tasks/:id` with `status: 'archived'` preserves `completedAt` if already set.
4. `POST /integrations/url-metadata` rejects localhost/private IP with 400.
5. `POST /integrations/url-metadata` extracts `<title>` for valid public URL.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @workspace/api-server test`
Expected: FAIL on new search, archive, and url-metadata test cases.

- [ ] **Step 3: Implement search and archive in `artifacts/api-server/src/routes/tasks.ts`**

1. Parse `search` and `scope` from query:
   ```typescript
   const { date, scope, timezone, search } = parsed.data;
   ```
2. Handle scope:
   ```typescript
   if (scope === "inbox") {
     conditions.push(eq(tasksTable.status, "inbox"));
   } else if (scope === "today") {
     conditions.push(gte(tasksTable.dueAt, start), lt(tasksTable.dueAt, end));
   } else if (scope === "completed7d") {
     const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
     conditions.push(
       eq(tasksTable.status, "completed"),
       gte(tasksTable.completedAt, weekAgo),
     );
     orderBy = desc(tasksTable.completedAt);
   } else if (scope === "archived") {
     conditions.push(eq(tasksTable.status, "archived"));
     orderBy = desc(tasksTable.updatedAt);
   }
   ```
3. Handle full-text search:
   ```typescript
   if (search && search.trim().length > 0) {
     const tsTokens = search
       .trim()
       .split(/\s+/)
       .map((w) => w.replace(/['":*&|!()\\]/g, ""))
       .filter((w) => w.length > 0)
       .map((w) => `${w}:*`);

     if (tsTokens.length > 0) {
       const queryStr = tsTokens.join(" & ");
       conditions.push(
         sql`to_tsvector('english', coalesce(${tasksTable.title}, '') || ' ' || coalesce(${tasksTable.notes}, '')) @@ to_tsquery('english', ${queryStr})`,
       );
       orderBy = desc(
         sql`ts_rank(to_tsvector('english', coalesce(${tasksTable.title}, '') || ' ' || coalesce(${tasksTable.notes}, '')), to_tsquery('english', ${queryStr}))`,
       );
     }
   }
   ```
4. In `PATCH /tasks/:id`, preserve `completedAt` on archive:
   ```typescript
   if (updates.status === "completed") {
     updates.completedAt = new Date();
   } else if (updates.status === "archived") {
     // Preserves existing completedAt if completed, or keeps null if was open/inbox.
   } else if (updates.status !== undefined) {
     updates.completedAt = null;
   }
   ```

- [ ] **Step 4: Implement `POST /api/integrations/url-metadata` in `routes/integrations.ts`**

Include SSRF protection rejecting private IP addresses and non-http(s) schemes:
```typescript
function isPrivateHost(hostname: string): boolean {
  if (["localhost", "127.0.0.1", "::1", "169.254.169.254"].includes(hostname)) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  return false;
}
```
Extract title from HTML using `<title>(.*?)</title>` or OpenGraph title `<meta property="og:title" content="(.*?)"\s*/?>`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @workspace/api-server test`
Expected: PASS (all tests pass).

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/
git commit -m "feat(api): implement task search, archive handling, and url-metadata resolver"
```

---

### Task 4: Global `Cmd+K` Task Search Integration (`artifacts/cadence`)

**Files:**
- Modify: `artifacts/cadence/src/components/chrome/CommandPalette.tsx:40-120`
- Modify: `artifacts/cadence/src/components/chrome/AppShell.tsx` (wire task selection callback)
- Test: `artifacts/cadence/tests/CommandPalette.test.tsx`

**Interfaces:**
- Consumes: `useListTasks` with `{ search: query }` from `@workspace/api-client-react`.
- Produces: Debounced search group in `CommandPalette` displaying task matches, status icons, and opening task in editor.

- [ ] **Step 1: Write test in `artifacts/cadence/tests/CommandPalette.test.tsx`**

Assert that typing a query in the palette searches tasks and renders task match item.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/cadence test CommandPalette.test.tsx`
Expected: FAIL (search tasks group not yet rendered).

- [ ] **Step 3: Implement task search in `CommandPalette.tsx`**

1. Maintain `searchTerm` state bound to `Command.Input`.
2. Debounce query (250ms).
3. If query $\ge 2$ characters, call `useListTasks({ search: debouncedQuery })`.
4. Render `<Command.Group heading={`Tasks (${tasks.length})`}>`:
   - Item with status icon: `Circle` (open), `CheckCircle2` (completed), `Archive` (archived).
   - Display task title, priority, due date.
   - On selection: invoke `onSelectTask(task)` and close palette.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @workspace/cadence test CommandPalette.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/cadence/src/components/chrome/CommandPalette.tsx artifacts/cadence/src/components/chrome/AppShell.tsx artifacts/cadence/tests/CommandPalette.test.tsx
git commit -m "feat(ui): add live full-text task search to Cmd+K command palette"
```

---

### Task 5: Inbox & Today Task Archival & Filtering (`artifacts/cadence`)

**Files:**
- Modify: `artifacts/cadence/src/pages/inbox/InboxPage.tsx`
- Modify: `artifacts/cadence/src/pages/today/TodayPage.tsx`
- Test: `artifacts/cadence/tests/InboxPage.test.tsx`

**Interfaces:**
- Consumes: `useListTasks({ scope: activeScope })`, `useUpdateTask` to set `status = 'archived'`.
- Produces: Filter tabs (`Active` vs `Archived`), archive/restore buttons in task actions.

- [ ] **Step 1: Write test for Inbox archive filtering**

Assert that switching tab to "Archived" fetches with `{ scope: 'archived' }` and renders archived items.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/cadence test InboxPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement archive tabs & actions in `InboxPage.tsx`**

1. Add state: `activeTab: 'active' | 'archived'`.
2. Map `scope: activeTab === 'archived' ? 'archived' : 'inbox'`.
3. Add segmented tab controls (`Active` / `Archived`) matching design system tokens.
4. When `activeTab === 'archived'`, show "Restore" action button (`update.mutate({ id, data: { status: 'inbox' } })`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @workspace/cadence test InboxPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/cadence/src/pages/inbox/InboxPage.tsx artifacts/cadence/tests/InboxPage.test.tsx
git commit -m "feat(ui): add archived filter view and restore actions to Inbox"
```

---

### Task 6: Links & Reference Chips in `TaskEditor` & `TaskRow` (`artifacts/cadence`)

**Files:**
- Modify: `artifacts/cadence/src/components/task/TaskEditor.tsx`
- Modify: `artifacts/cadence/src/components/task/TaskRow.tsx`
- Create: `artifacts/cadence/src/components/task/TaskLinkChips.tsx`
- Test: `artifacts/cadence/tests/TaskLinkChips.test.tsx`

**Interfaces:**
- Consumes: `/tasks/:id/files` endpoints (`useListTaskFiles`, `useCreateTaskFile`, `useDeleteTaskFile`), `useGetUrlMetadata`.
- Produces: URL attachment input with auto-metadata fetch in `TaskEditor`, and interactive external link chips on `TaskRow` with 44px tap target floor.

- [ ] **Step 1: Write test for `TaskLinkChips.test.tsx`**

Assert chip renders external link with target `_blank`, correct icon, and prevents propagation to row selection.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/cadence test TaskLinkChips.test.tsx`
Expected: FAIL (component not found).

- [ ] **Step 3: Implement `TaskLinkChips.tsx` and integrate into `TaskRow.tsx`**

1. Render compact tokenized chips:
   - ExternalLink icon (12px).
   - Label with truncation.
   - Click handler: `e.stopPropagation(); window.open(file.url, '_blank', 'noopener,noreferrer');`.
   - Accessible touch target wrapper ($\ge 44\times 44\text{px}$ on touch devices via pointer media query).
2. Wire into `TaskRow.tsx`.

- [ ] **Step 4: Implement URL input & metadata fetch in `TaskEditor.tsx`**

1. Add "Links & References" section.
2. Input field for URL: on paste or blur, query `/api/integrations/url-metadata` to autofill label.
3. Allow manual label edits.
4. "Add Link" button mutates `POST /tasks/:id/files`.
5. List of attached links with "Remove" (`DELETE /tasks/:id/files/:fileId`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @workspace/cadence test TaskLinkChips.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/cadence/src/components/task/ artifacts/cadence/tests/TaskLinkChips.test.tsx
git commit -m "feat(ui): add link attachment editor and reference chips in TaskRow"
```

---

### Task 7: Full Ladder Verification & Playwright E2E

**Files:**
- Create: `artifacts/cadence/tests/e2e/task-search-and-archive.spec.ts`
- Run: `node scripts/run-gates.cjs`

**Interfaces:**
- Consumes: All updated components, APIs, and database migrations.
- Produces: Verified 10-gate verification pass and clean Playwright E2E test.

- [ ] **Step 1: Write Playwright E2E spec in `artifacts/cadence/tests/e2e/task-search-and-archive.spec.ts`**

Test scenarios:
1. `Cmd+K` search finds created task and opens editor.
2. Archive task in `TaskEditor` moves task out of `Today` and into `Archived` tab.
3. Restoring task returns it to active list.

- [ ] **Step 2: Run Playwright E2E test**

Run: `pnpm --filter @workspace/cadence run test:e2e task-search-and-archive.spec.ts`
Expected: PASS.

- [ ] **Step 3: Run full 10-Gate Verification Ladder**

Run: `node scripts/run-gates.cjs`
Expected: `VERIFICATION PASSED: 10/10 gates` in ~45s with 0 errors.

- [ ] **Step 4: Commit and push**

```bash
git add artifacts/cadence/tests/e2e/task-search-and-archive.spec.ts
git commit -m "test(e2e): add end-to-end coverage for search, archival, and task links"
git push origin main
```
