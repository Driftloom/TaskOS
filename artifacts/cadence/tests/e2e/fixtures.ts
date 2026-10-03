import { expect, test as base, type Page, type Route, type BrowserContext } from '@playwright/test';

/**
 * Tag for tests that FAIL against the app for a known, measured reason.
 *
 * WHY THIS STILL EXISTS
 * ---------------------
 * `pnpm run verify:e2e:smoke` is `--grep-invert @known-defect`: the smoke gate
 * exists so that a standing conformance failure cannot mask a fresh regression.
 * A developer sees red, assumes it is the known one, and ships a new bug. The
 * tag is what keeps that from happening, so the mechanism stays even though it
 * currently has no users.
 *
 * STATE AS OF 2026-10-01: ZERO tagged tests.
 *
 * All thirteen tags that existed were removed on 2026-10-01, after re-running
 * each one and watching it pass -- seven in `pages.spec.ts`, five in
 * `design-system.spec.ts` and one in `tasks.spec.ts`. Until now `verify:e2e`
 * reported 65 tests and `verify:e2e:smoke` reported 52; both now report the same
 * number, which is the point: a smoke gate that skips tests cannot prove
 * anything about them.
 *
 * A test may only be tagged with a measured reason recorded in README.md, and
 * the tag must be removed the moment the defect is fixed -- not when someone
 * believes it is fixed.
 */
export const KNOWN_DEFECT = '@known-defect';


/**
 * tests/e2e/fixtures.ts -- shared harness for the Cadence E2E suite.
 *
 * Contains four things:
 *
 *  1. `installMockApi` -- a stateful `page.route` mock for every `/api/*` route
 *     the app can call, so the suite is self-contained and deterministic.
 *  2. `collectPageProblems` -- a console/uncaught-error guard.
 *  3. `gotoRoute` -- navigates and ASSERTS the route actually resolved.
 *  4. Measurement helpers -- effective hit area (hit-probed, not class-name
 *     sniffed) and WCAG relative-luminance contrast with real alpha
 *     compositing.
 *
 * On why the network is mocked (option (a) of the three the brief offered):
 * `lib/api-client-react` calls every endpoint same-origin under the `/api`
 * prefix, and a `page.route` glob intercepts those before they leave the
 * browser. The alternative -- a live Express + Supabase stack -- needs
 * DATABASE_URL, Clerk credentials and a migrated remote database, none of which
 * exist in CI or on a clean clone. A gate that cannot run is a gate that gets
 * skipped. See README.md in this directory for the measured evidence behind that
 * call and for what consequently stays UNVERIFIED.
 */

// ---------------------------------------------------------------------------
// 1. Network mock
// ---------------------------------------------------------------------------

export interface MockTaskSeed {
  id: number;
  title: string;
  status?: 'inbox' | 'open' | 'completed';
  priority?: 'low' | 'medium' | 'high';
  durationMin?: number;
  dueAt?: string | null;
  notes?: string | null;
  automation?: 'auto' | 'ask' | 'off' | null;
  needsAttention?: boolean;
  rescheduleCount?: number;
  completedAt?: string | null;
  tags?: { id: number; name: string }[];
}

/** What the mock actually serves: every field the generated Task schema has. */
interface MockTask extends MockTaskSeed {
  status: 'inbox' | 'open' | 'completed';
  priority: 'low' | 'medium' | 'high';
  durationMin: number;
  dueAt: string | null;
  notes: string | null;
  automation: 'auto' | 'ask' | 'off' | null;
  needsAttention: boolean;
  rescheduleCount: number;
  completedAt: string | null;
  projectId: number | null;
  parentId: number | null;
  rrule: string | null;
  tags: { id: number; name: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface MockApiOptions {
  tasks?: MockTaskSeed[];
  /** Facts returned by GET /api/memory/facts. */
  memoryFacts?: unknown[];
  /** Facts returned by GET /api/memory/confirmations. */
  confirmations?: unknown[];
  /** Active focus sessions returned by GET /api/focus-sessions. */
  focusSessions?: unknown[];
  /** Pending reschedule proposals. */
  proposals?: unknown[];
  /** Make GET /api/automation/flags report paused. */
  automationPaused?: boolean;
  /** Force any endpoint to fail with this status, to prove error paths render. */
  failWith?: number;
  dailyTarget?: number;
}

export interface MockApiHandle {
  /** Every /api path the page asked for, in order. */
  readonly requestedPaths: string[];
  /** The mutable task list the mock is serving. */
  readonly tasks: MockTaskSeed[];
  /** Hand the mock a fresh task list and re-render consumers. */
  setTasks(next: MockTaskSeed[]): void;
  /** The parsed bodies of every non-GET request the page made. */
  readonly writes: { method: string; path: string; body: unknown }[];
}

const ISO = '2026-09-30T09:00:00.000Z';

function seedTask(seed: MockTaskSeed): MockTask {
  return {
    notes: null,
    dueAt: null,
    durationMin: 25,
    priority: 'medium',
    status: 'open',
    projectId: null,
    tags: [],
    parentId: null,
    rescheduleCount: 0,
    needsAttention: false,
    automation: 'auto',
    completedAt: null,
    rrule: null,
    createdAt: ISO,
    updatedAt: ISO,
    ...seed,
  };
}

/**
 * The two default tasks are chosen so a screenshot shows a populated, honest
 * Today: one open high-priority item, one open medium item, one completed item
 * so the Activity Rings have a non-zero arc.
 */
export const DEFAULT_TASKS: MockTaskSeed[] = [
  {
    id: 101,
    title: 'Ship the enterprise release v1.0',
    status: 'open',
    priority: 'high',
    durationMin: 90,
    dueAt: '2026-09-30T17:00:00.000Z',
  },
  {
    id: 102,
    title: 'Review PR for the reschedule engine',
    status: 'open',
    priority: 'medium',
    durationMin: 45,
    dueAt: '2026-09-30T13:30:00.000Z',
    needsAttention: true,
    rescheduleCount: 1,
  },
  {
    id: 103,
    title: 'Reply to the Telegram pairing digest',
    status: 'completed',
    priority: 'low',
    durationMin: 15,
    completedAt: '2026-09-30T08:10:00.000Z',
  },
];

export async function installMockApi(page: Page, options: MockApiOptions = {}): Promise<MockApiHandle> {
  let tasks = (options.tasks ?? DEFAULT_TASKS).map(seedTask);
  // Stateful, because FocusPage's target stepper writes then re-reads. A mock
  // that always answers 4 makes the stepper look broken when it is not.
  let dailyTarget = options.dailyTarget ?? 4;
  const requestedPaths: string[] = [];
  const writes: { method: string; path: string; body: unknown }[] = [];

  const handle: MockApiHandle = {
    requestedPaths,
    get tasks() {
      return tasks;
    },
    writes,
    setTasks(next) {
      tasks = next.map(seedTask);
    },
  };

  await page.addInitScript(() => {
    try {
      (window as unknown as { __CADENCE_E2E__?: boolean }).__CADENCE_E2E__ = true;
      window.sessionStorage.setItem('__CADENCE_E2E__', 'true');
    } catch {
      /* ignore */
    }
  });

  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    const url = new URL(request.url());
    const path = url.pathname;
    requestedPaths.push(`${method} ${path}`);

    let body: unknown = null;
    if (method !== 'GET' && method !== 'HEAD') {
      const raw = request.postData();
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = raw;
      }
      writes.push({ method, path, body });
    }

    if (options.failWith) {
      return route.fulfill({
        status: options.failWith,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'mock_failure', status: options.failWith }),
      });
    }

    const json = (payload: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });

    const taskSummary = () => ({
      total: tasks.length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      open: tasks.filter((t) => t.status === 'open').length,
      focusMinutes: tasks.filter((t) => t.status === 'completed').length * 25,
    });

    // ---- health ----------------------------------------------------------
    if (path === '/api/healthz') {
      return json({ status: 'ok', database: 'ok', uptimeSeconds: 1 });
    }

    // ---- tasks -----------------------------------------------------------
    if (path === '/api/tasks' && method === 'GET') {
      return json(tasks);
    }
    if (path === '/api/tasks' && method === 'POST') {
      const input = (body ?? {}) as Record<string, unknown>;
      const created = seedTask({
        id: 900 + tasks.length,
        title: typeof input.title === 'string' ? input.title : 'Untitled',
        status: 'open',
        priority: 'medium',
        durationMin: 30,
        dueAt: null,
      });
      tasks = [...tasks, created];
      return json(created, 201);
    }
    const taskMatch = /^\/api\/tasks\/(\d+)$/.exec(path);
    if (taskMatch) {
      const id = Number(taskMatch[1]);
      const index = tasks.findIndex((t) => t.id === id);
      if (method === 'DELETE') {
        if (index === -1) return json({ error: 'not_found' }, 404);
        tasks = tasks.filter((t) => t.id !== id);
        // openapi.yaml specifies 204 with no body for deleteTask, and the client
        // treats every 2xx identically (`customFetch` only checks response.ok).
        // But Chromium aborts a Playwright-fulfilled 204 with net::ERR_ABORTED,
        // which the console guard then (correctly) reports as a failed request.
        // Answering 200 with the documented DeleteTask200 shape is therefore
        // behaviourally identical for the code under test, and is what the real
        // client would see if the server responded 200.
        return json({ ok: true });
      }
      if (index === -1) return json({ error: 'not_found' }, 404);
      const patch = (body ?? {}) as Record<string, unknown>;
      const next = seedTask({
        ...tasks[index],
        ...patch,
        id,
        completedAt:
          patch.status === 'completed'
            ? ISO
            : patch.status === 'open'
              ? null
              : (tasks[index].completedAt ?? null),
      });
      tasks = tasks.map((t) => (t.id === id ? next : t));
      return json(next);
    }

    if (path === '/api/tasks/summary') return json(taskSummary());

    if (path === '/api/momentum') {
      return json({
        date: '2026-09-30',
        tasksTotal: tasks.length,
        tasksCompleted: tasks.filter((t) => t.status === 'completed').length,
        roundsCompleted: 1,
        roundTarget: options.dailyTarget ?? 4,
        streakDays: 3,
      });
    }

    if (path === '/api/projects') return json([]);
    if (path === '/api/tags') {
      if (method === 'POST') {
        const input = (body ?? {}) as { name?: string };
        return json(
          { id: 700 + tasks.length, name: input.name ?? 'tag', createdAt: ISO, updatedAt: ISO },
          201,
        );
      }
      return json([{ id: 11, name: 'eng', createdAt: ISO, updatedAt: ISO }]);
    }
    if (path === '/api/blocks') return json([]);

    // ---- reschedule / automation ----------------------------------------
    if (path === '/api/reschedule/proposals') {
      return json(options.proposals ?? []);
    }
    if (path === '/api/automation/flags') {
      const enabled = !options.automationPaused;
      return json({
        flags: [
          { key: 'reminders', enabled },
          { key: 'reschedule', enabled },
        ],
        paused: options.automationPaused === true,
      });
    }

    // ---- settings --------------------------------------------------------
    if (path === '/api/settings/focus') {
      const patch = (body ?? {}) as { dailyTarget?: number };
      if (method === 'PATCH' && typeof patch.dailyTarget === 'number') {
        dailyTarget = patch.dailyTarget;
      }
      return json({ dailyTarget, createdAt: ISO, updatedAt: ISO });
    }
    if (path === '/api/settings/notifications') {
      // workStart/workEnd are 9 and 18 so the onboarding prefill assertion can
      // prove the component actually read them off the server. A mock that
      // returned 0/23 would make "09:00" untestable and hide a broken prefill.
      return json({
        telegramChatId: null,
        // Quiet hours are "enabled" iff start !== end (OnboardingPage.tsx:79),
        // so a disabled config must carry equal values.
        quietStart: 0,
        quietEnd: 0,
        timezone: 'Asia/Kolkata',
        remindersEnabled: false,
        flexible24h: true,
        workStart: 9,
        workEnd: 18,
        createdAt: ISO,
        updatedAt: ISO,
      });
    }
    if (path === '/api/settings/rescheduling') {
      return json({ defaultMode: 'auto', maxMoves: 5, createdAt: ISO, updatedAt: ISO });
    }
    if (path === '/api/integrations/status') {
      return json({
        telegram: { configured: false, source: 'unset', webhookSecretConfigured: false },
        healthchecks: { configured: false },
      });
    }

    // ---- focus sessions --------------------------------------------------
    if (path === '/api/focus-sessions' && method === 'GET') {
      return json(options.focusSessions ?? []);
    }
    if (path === '/api/focus-sessions' && method === 'POST') {
      const input = (body ?? {}) as { taskId?: number; plannedMinutes?: number };
      const owner = tasks.find((t) => t.id === input.taskId) ?? tasks[0];
      return json(
        {
          id: 501,
          taskId: owner?.id ?? 0,
          plannedMinutes: input.plannedMinutes ?? 25,
          elapsedMinutes: 0,
          status: 'active',
          startedAt: ISO,
          endedAt: null,
          createdAt: ISO,
          updatedAt: ISO,
        },
        201,
      );
    }
    const focusSessionMatch = /^\/api\/focus-sessions\/(\d+)$/.exec(path);
    if (focusSessionMatch) {
      const input = (body ?? {}) as { status?: string; elapsedMinutes?: number };
      return json({
        id: Number(focusSessionMatch[1]),
        taskId: tasks[0]?.id ?? 0,
        plannedMinutes: 25,
        elapsedMinutes: input.elapsedMinutes ?? 0,
        status: input.status ?? 'paused',
        startedAt: ISO,
        endedAt: null,
        createdAt: ISO,
        updatedAt: ISO,
      });
    }

    // ---- memory ----------------------------------------------------------
    if (path === '/api/memory/facts') return json({ facts: options.memoryFacts ?? [] });
    if (path === '/api/memory/confirmations') {
      return json({ confirmations: options.confirmations ?? [] });
    }

    // ---- agent -----------------------------------------------------------
    if (path === '/api/agent/actions') return json({ actions: [] });
    if (path === '/api/agent/usage') {
      return json({
        usage: {
          totalTokensIn: 0,
          totalTokensOut: 0,
          totalCostEstimateCents: 0,
          totalCalls: 0,
          spendCeilingCents: 5000,
        },
      });
    }

    // Anything else is a contract drift, not a silent pass. Failing loudly is
    // the whole point: a new endpoint the app calls must be added here on
    // purpose, or this suite reports that it does not know the surface.
    return json(
      { error: 'unmocked_endpoint', path, method, message: `No mock for ${method} ${path}` },
      501,
    );
  });

  return handle;
}

// ---------------------------------------------------------------------------
// 2. Console / uncaught-error guard
// ---------------------------------------------------------------------------

export interface PageProblem {
  kind: 'console.error' | 'console.warn' | 'pageerror' | 'requestfailed';
  text: string;
}

export interface ProblemRecorder {
  readonly problems: PageProblem[];
  /**
   * Drops noise that is expected and not a defect: React Router future-flag
   * notices, the Vite HMR ping, and Clerk's own "no session" chatter while
   * `?test_auth=true` is in effect. Anything NOT matched here fails the test.
   */
  reset(): void;
  /** Asserts zero problems, printing each one. Never call before settling. */
  assertClean(context: string): void;
}

/**
 * Known-benign patterns. Kept deliberately short and specific: every entry here
 * is a place where a real error could hide, so the list must not grow lazily.
 */
const BENIGN: { re: RegExp; why: string }[] = [
  {
    re: /Clerk has been loaded with development keys/i,
    // A property of the local VITE_CLERK_PUBLISHABLE_KEY in .env.local, not of
    // the code under test, and it is a warn rather than an error. Removing it
    // would mean a Clerk test account, which is a credential this gate must not
    // need. Everything else still fails.
    why: 'Clerk development-key advisory; environment fact, not product code',
  },
  {
    re: /React Router Future Flag Warning/i,
    why: 'wouter/Router advisory, no behavioural effect',
  },
  {
    re: /\[vite\] connect(ing|ed) @?|vite/i,
    why: 'dev-server HMR chatter (dev-only build)',
  },
];

export function collectPageProblems(page: Page): ProblemRecorder {
  const problems: PageProblem[] = [];

  const push = (kind: PageProblem['kind'], text: string) => {
    const clean = text.trim();
    if (!clean) return;
    if (BENIGN.some((b) => b.re.test(clean))) return;
    problems.push({ kind, text: clean });
  };

  page.on('console', (msg) => {
    if (msg.type() === 'error') push('console.error', msg.text());
    else if (msg.type() === 'warning') push('console.warn', msg.text());
  });
  page.on('pageerror', (err) => push('pageerror', err.message ?? String(err)));
  page.on('requestfailed', (req) => {
    const failure = req.failure();
    const reason = failure?.errorText ?? 'unknown';

    // React Query cancels a superseded refetch whenever a second
    // `invalidateQueries` lands in the same tick -- TaskRow alone invalidates the
    // list and the summary twice per delete (its own `onSuccess` plus
    // `onRefresh`). Chromium reports the cancelled read as net::ERR_ABORTED.
    // Cancelling a READ is normal framework behaviour and never reaches the
    // user, so it is not a defect.
    //
    // Cancelling a WRITE would be a different matter -- a dropped mutation is a
    // lost user action -- so only GET is exempted, deliberately narrowly.
    if (reason === 'net::ERR_ABORTED' && req.method().toUpperCase() === 'GET') return;

    push('requestfailed', `${req.method()} ${req.url()} :: ${reason}`);
  });

  return {
    problems,
    reset() {
      problems.length = 0;
    },
    assertClean(context) {
      if (problems.length === 0) return;
      const detail = problems
        .map((p, i) => `  ${i + 1}. [${p.kind}] ${p.text}`)
        .join('\n');
      throw new Error(
        `${problems.length} console/network problem(s) observed during ${context}.\n` +
          'A design system that logs errors on load is not shippable, so these fail the test:\n' +
          detail,
      );
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Navigation that proves the route resolved
// ---------------------------------------------------------------------------

/** Routes the protected shell is expected to render. */
const APP_ROUTES = [
  '/today',
  '/inbox',
  '/focus',
  '/calendar',
  '/review',
  '/memory',
  '/onboarding',
  '/profile',
  '/settings',
];

/**
 * Navigates to `path` and asserts the protected shell actually mounted.
 *
 * This is the replacement for the old `if (!page.url().includes('/today')) return;`
 * pattern. If Clerk bounced us to `/`, if the route matched NotFound, or if the
 * module graph failed to load, this THROWS. It cannot pass vacuously.
 */
export async function gotoRoute(page: Page, path: string): Promise<void> {
  const url = new URL(path, 'http://localhost');
  url.searchParams.set('test_auth', 'true');

  // `commit` rather than `load`/`domcontentloaded`: a Vite dev SPA does not fire
  // DOMContentLoaded until every one of its (unbundled) module requests has been
  // transformed, so waiting on it couples the test to Vite's cold-start cost.
  // Committing early and then waiting on a rendered element tests the thing we
  // actually care about: did the app mount.
  await page.goto(url.pathname + url.search, { waitUntil: 'commit' });

  // The auth bypass must be active, otherwise the shell never mounts.
  await page.waitForFunction(() => {
    const stored = window.localStorage.getItem('cadence_test_auth');
    return stored === 'true' || window.location.search.includes('test_auth=true');
  }, undefined, { timeout: 30_000 });

  if (APP_ROUTES.includes(path)) {
    // A NotFound mount means wouter did not match the route.
    await expect(page.getByText(/page not found|404/i)).toHaveCount(0);
    // The shell's own control proves AppShell mounted.
    await expect(page.getByTestId('button-theme-toggle')).toBeVisible({
      timeout: 45_000,
    });
  }

  const landed = new URL(page.url()).pathname;
  expect(landed, `expected to land on ${path} but landed on ${landed}`).toBe(path);
}

// ---------------------------------------------------------------------------
// 4. Measurement helpers
//
// Everything in this section is a MEASUREMENT, not a restatement of the token
// table. The tokens are what is in question, so every number is read out of the
// browser: real resolved colours, real composited backgrounds, real hit tests.
// ---------------------------------------------------------------------------

/**
 * The in-page half of the colour measurement. Installed with
 * `page.addInitScript(CONTRAST_HELPER)`.
 *
 * WHY THE CANVAS: Tailwind v4 emits its palette as `oklch(...)`, and Chrome's
 * getComputedStyle returns that verbatim, not as rgb(). A regex parser silently
 * fails on those, which is how this suite's first draft reported four
 * perfectly-readable zinc-coloured labels as "MISSING". Rather than teach a
 * regex about every colour syntax the browser may grow, this asks the browser
 * itself: paint the colour into a 1x1 canvas and read the resulting sRGB bytes.
 * That is also literally what the display shows, including any gamut mapping,
 * so the number is the screen-truth rather than a re-implementation.
 */
export const CONTRAST_HELPER = `
window.__contrast = (function () {
  var canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  var ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Any CSS colour the browser understands -> exact sRGB bytes.
  function toRgb(colorStr, alpha) {
    if (!colorStr) return null;
    var s = String(colorStr).trim();
    if (!s || s === 'none') return null;
    ctx.clearRect(0, 0, 1, 1);
    // A sentinel: an unparseable value leaves fillStyle untouched, so we can
    // detect "not a colour" instead of silently measuring black.
    ctx.fillStyle = '#010203';
    ctx.fillStyle = s;
    var resolved = ctx.fillStyle;
    if (resolved === '#010203' && s.toLowerCase() !== '#010203') {
      // Could still legitimately be black; confirm by comparing painted bytes.
    }
    ctx.globalAlpha = typeof alpha === 'number' ? alpha : 1;
    ctx.fillRect(0, 0, 1, 1);
    var d = ctx.getImageData(0, 0, 1, 1).data;
    ctx.globalAlpha = 1;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  }

  function over(fg, bg) {
    var a = fg.a + bg.a * (1 - fg.a);
    if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
      g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
      b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
      a: a
    };
  }

  function lum(c) {
    var ch = function (v) {
      var x = v / 255;
      return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }

  function ratio(a, b) {
    var la = lum(a), lb = lum(b);
    return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
  }

  // Composites the ancestor chain to find the colour actually behind an element.
  function backdropOf(el) {
    var stack = [];
    var node = el;
    while (node && node.nodeType === 1) {
      var cs = getComputedStyle(node);
      var bg = toRgb(cs.backgroundColor);
      var hasImg = cs.backgroundImage && cs.backgroundImage !== 'none';
      if ((bg && bg.a > 0) || hasImg) {
        stack.push({ bg: bg, hasImg: hasImg, tag: node.tagName });
        if (bg && bg.a >= 0.999) break;
      }
      node = node.parentElement;
    }
    var htmlBg = toRgb(getComputedStyle(document.documentElement).backgroundColor);
    var white = { r: 255, g: 255, b: 255, a: 1 };
    var acc = htmlBg && htmlBg.a > 0 ? htmlBg : white;
    if (acc.a < 1) acc = over(acc, white);
    for (var i = stack.length - 1; i >= 0; i--) {
      if (stack[i].hasImg) return { color: acc, image: stack[i].tag };
      acc = over(stack[i].bg, acc);
    }
    return { color: acc, image: null };
  }

  function fmt(c) {
    return 'rgb(' + Math.round(c.r) + ', ' + Math.round(c.g) + ', ' + Math.round(c.b) + ')';
  }

  return {
    text: function (sel) {
      var el = document.querySelector(sel);
      if (!el) return { missing: 'selector matched nothing' };
      var cs = getComputedStyle(el);
      var fg = toRgb(cs.color);
      if (!fg) return { missing: 'computed color was not parseable: ' + cs.color };
      var bd = backdropOf(el);
      var eff = over(fg, bd.color);
      return {
        sample: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 26),
        color: cs.color,
        background: fmt(bd.color),
        fontSize: parseFloat(cs.fontSize),
        fontWeight: parseInt(cs.fontWeight, 10) || 400,
        ratio: ratio(eff, bd.color),
        backdropNode: bd.image
      };
    },

    border: function (sel) {
      var el = document.querySelector(sel);
      if (!el) return { missing: 'selector matched nothing' };
      var cs = getComputedStyle(el);
      if (parseFloat(cs.borderTopWidth) === 0) {
        return { missing: 'element has no top border (' + cs.borderTopWidth + ')' };
      }
      var bc = toRgb(cs.borderTopColor);
      if (!bc) return { missing: 'border colour not parseable: ' + cs.borderTopColor };
      var own = toRgb(cs.backgroundColor);
      var bd = backdropOf(el);
      var surface = bd.color;
      var from = 'ancestor';
      if (own && own.a > 0.5) { surface = over(own, bd.color); from = 'own-bg'; }
      return {
        borderColor: cs.borderTopColor,
        borderWidth: cs.borderTopWidth,
        surface: fmt(surface),
        surfaceFrom: from,
        ratio: ratio(over(bc, surface), surface),
        backdropNode: bd.image
      };
    },

    // Largest fully-hit-tested SQUARE centred on the control.
    tap: function (sel) {
      var el = document.querySelector(sel);
      if (!el) return { missing: 'selector matched nothing' };
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      var r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        return { missing: 'zero size (display:none or not laid out)' };
      }
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      // A half-extent h is valid only when EVERY sampled point in the square
      // hits this control. Growing h therefore cannot bleed into a neighbour:
      // the neighbour's area stops it, which is exactly the behaviour a tap
      // target has.
      //
      // Offsets are probed in 0.5px steps rather than whole pixels because
      // elementsFromPoint rounds to device pixels: a control that is exactly
      // 44px wide has its true boundary at +/-22, and probing at exactly 22
      // lands on the boundary pixel and misses. Probing at 21.5 and reporting
      // 2*21.5+1 = 44 is both honest and exact for a box of that size.
      var owns = function (x, y) {
        var stack = document.elementsFromPoint(x, y);
        for (var i = 0; i < stack.length; i++) {
          if (stack[i] === el || el.contains(stack[i])) return true;
        }
        return false;
      };
      var valid = function (hw, hh) {
        var pts = [
          [cx - hw, cy - hh], [cx, cy - hh], [cx + hw, cy - hh],
          [cx - hw, cy], [cx, cy], [cx + hw, cy],
          [cx - hw, cy + hh], [cx, cy + hh], [cx + hw, cy + hh]
        ];
        for (var i = 0; i < pts.length; i++) {
          var x = pts[i][0], y = pts[i][1];
          if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
          if (!owns(x, y)) return false;
        }
        return true;
      };
      var MAX = 40; // 80px square: far beyond any plausible control
      var STEP = 0.5;
      // Grow the square symmetrically so min(width, height) is exact.
      var half = 0;
      for (var h = STEP; h <= MAX; h += STEP) { if (valid(h, h)) half = h; else break; }
      // Then widen horizontally at the height we settled on, so a wide button
      // is not under-reported by the square scan.
      var wide = half;
      for (var w2 = half + STEP; w2 <= MAX; w2 += STEP) { if (valid(w2, half)) wide = w2; else break; }

      // A ROUNDED control needs a circular measurement too. Chrome's
      // elementsFromPoint honours border-radius, so a 'rounded-full' 44px
      // button is a 44px CIRCLE: its largest fully-owned square is only
      // 44/sqrt(2) = 31.1px. Measured, then wrongly reported as a failure.
      // Apple's HIG target is a 44pt circle, which is exactly what this
      // measures, so the floor is: owned square >= 44 OR owned circle >= 44.
      var COMPASS = [
        [-1, 0], [1, 0], [0, -1], [0, 1],
        [-0.7071, -0.7071], [0.7071, -0.7071],
        [-0.7071, 0.7071], [0.7071, 0.7071]
      ];
      var circleOwns = function (rad) {
        for (var i = 0; i < COMPASS.length; i++) {
          var x = cx + COMPASS[i][0] * rad;
          var y = cy + COMPASS[i][1] * rad;
          if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
          if (!owns(x, y)) return false;
        }
        return true;
      };
      var rad = 0;
      for (var rr = STEP; rr <= MAX; rr += STEP) { if (circleOwns(rr)) rad = rr; else break; }

      var owned = function (x) { return Math.round((2 * x + 1) * 100) / 100; };
      return {
        visualWidth: Math.round(r.width * 100) / 100,
        visualHeight: Math.round(r.height * 100) / 100,
        borderRadius: getComputedStyle(el).borderTopLeftRadius,
        ownedWidth: owned(wide),
        ownedHeight: owned(half),
        ownedSquare: owned(half),
        ownedCircle: owned(rad)
      };
    }
  };
})();
`;

/** A control's measured geometry. */
export interface TargetMeasurement {
  /** The selector used to find it, echoed into the failure report. */
  label: string;
  /** getBoundingClientRect() of the element itself -- the visual box. */
  visual: { width: number; height: number };
  /**
   * The largest rectangle centred on the control in which EVERY sampled point
   * hit-tests back to this control. This is the region a finger can actually
   * press, so it is the number the 44px floor is asserted against.
   */
  owned: { width: number; height: number };
  /** The largest fully-owned SQUARE, i.e. min(width, height) as a hit test. */
  ownedSquare: number;
  /**
   * The largest fully-owned CIRCLE diameter, measured with a compass probe.
   * Chrome's hit testing honours border-radius, so a `rounded-full` control is a
   * circle whose owned square is only d/sqrt(2). Apple's HIG target is a 44pt
   * circle, so the 44px floor is satisfied by `max(square, circle)`.
   */
  ownedCircle: number;
  /** The control's computed border-radius, for the report. */
  borderRadius: string;
  /** False when the selector matched nothing or the element is unmeasurable. */
  measurable: boolean;
  passes44: boolean;
  /** Why the measurement failed, when it did. */
  debug: string;
}

const TAP_PROBE_LIMIT = 40;

export async function measureTapTarget(
  page: Page,
  selector: string,
  label = selector,
): Promise<TargetMeasurement> {
  const raw = (await page.evaluate((sel: string) => {
    const helpers = (window as unknown as { __contrast?: { tap(s: string): unknown } }).__contrast;
    if (!helpers) return { missing: 'CONTRAST_HELPER was not installed' };
    return helpers.tap(sel);
  }, selector)) as Record<string, unknown>;

  if (raw && 'missing' in raw) {
    return {
      label,
      visual: { width: 0, height: 0 },
      owned: { width: 0, height: 0 },
      ownedSquare: 0,
      ownedCircle: 0,
      borderRadius: '-',
      measurable: false,
      passes44: false,
      debug: String(raw.missing),
    };
  }

  const r = raw as {
    visualWidth: number;
    visualHeight: number;
    ownedWidth: number;
    ownedHeight: number;
    ownedSquare: number;
    ownedCircle: number;
    borderRadius: string;
  };
  const best = Math.max(r.ownedSquare, r.ownedCircle);
  return {
    label,
    visual: { width: r.visualWidth, height: r.visualHeight },
    owned: { width: r.ownedWidth, height: r.ownedHeight },
    ownedSquare: r.ownedSquare,
    ownedCircle: r.ownedCircle,
    borderRadius: r.borderRadius,
    measurable: true,
    passes44: best >= 44,
    debug: best < 44 ? `largest owned shape is ${best}px` : '',
  };
}

/** Formats one tap measurement as a fixed-width report row. */
export function formatMeasurement(m: TargetMeasurement): string {
  const verdict = m.passes44 ? 'PASS' : 'FAIL';
  return (
    `  ${verdict}  ${m.label.padEnd(30)}` +
    `visual=${m.visual.width}x${m.visual.height}`.padEnd(20) +
    `owned=${m.owned.width}x${m.owned.height}`.padEnd(18) +
    `square=${m.ownedSquare}`.padEnd(14) +
    `circle=${m.ownedCircle}`.padEnd(14) +
    `radius=${m.borderRadius}` +
    (m.debug ? `  FAIL: ${m.debug}` : '')
  );
}

// --- contrast ---------------------------------------------------------------

/** WCAG "large text": >=24px, or >=18.66px when bold (>=700). */
export function requiredRatioFor(fontSizePx: number, fontWeight: number): number {
  const bold = fontWeight >= 700;
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && bold) ? 3 : 4.5;
}

interface RawContrast {
  sample?: string;
  color?: string;
  background?: string;
  fontSize?: number;
  fontWeight?: number;
  ratio?: number;
  borderColor?: string;
  borderWidth?: string;
  surface?: string;
  surfaceFrom?: string;
  backdropNode?: string | null;
  missing?: string;
}

/** A measured foreground/background pair for text. */
export interface ContrastMeasurement {
  label: string;
  selector: string;
  sample: string;
  foreground: string;
  background: string;
  fontSizePx: number;
  fontWeight: number;
  ratio: number;
  /** WCAG AA threshold for this size/weight: 3 for large text, else 4.5. */
  required: number;
  passes: boolean;
  measurable: boolean;
  debug: string;
  /**
   * Set when an ancestor paints a background IMAGE, so the composited colour is
   * only an approximation of what the user sees.
   */
  uncertainBecause: string | null;
}

export async function measureTextContrast(
  page: Page,
  selector: string,
  label: string,
): Promise<ContrastMeasurement> {
  const raw = (await page.evaluate((sel: string) => {
    const helpers = (window as unknown as { __contrast?: { text(s: string): unknown } }).__contrast;
    if (!helpers) return { missing: 'CONTRAST_HELPER was not installed' };
    return helpers.text(sel);
  }, selector)) as RawContrast;

  if (raw.missing) {
    return {
      label,
      selector,
      sample: '',
      foreground: '-',
      background: '-',
      fontSizePx: 0,
      fontWeight: 0,
      ratio: 0,
      required: 4.5,
      passes: false,
      measurable: false,
      debug: String(raw.missing),
      uncertainBecause: null,
    };
  }

  const required = requiredRatioFor(raw.fontSize ?? 0, raw.fontWeight ?? 400);
  return {
    label,
    selector,
    sample: raw.sample ?? '',
    foreground: raw.color ?? '-',
    background: raw.background ?? '-',
    fontSizePx: raw.fontSize ?? 0,
    fontWeight: raw.fontWeight ?? 400,
    ratio: raw.ratio ?? 0,
    required,
    passes: (raw.ratio ?? 0) >= required,
    measurable: true,
    debug: '',
    uncertainBecause: raw.backdropNode ?? null,
  };
}

/** A measured control-border / adjacent-surface pair (WCAG 1.4.11). */
export interface BorderContrastMeasurement {
  label: string;
  selector: string;
  borderColor: string;
  borderWidth: string;
  surface: string;
  surfaceFrom: string;
  ratio: number;
  required: 3;
  passes: boolean;
  measurable: boolean;
  debug: string;
  uncertainBecause: string | null;
}

export async function measureBorderContrast(
  page: Page,
  selector: string,
  label: string,
): Promise<BorderContrastMeasurement> {
  const raw = (await page.evaluate((sel: string) => {
    const helpers = (window as unknown as { __contrast?: { border(s: string): unknown } }).__contrast;
    if (!helpers) return { missing: 'CONTRAST_HELPER was not installed' };
    return helpers.border(sel);
  }, selector)) as RawContrast;

  if (raw.missing) {
    return {
      label,
      selector,
      borderColor: '-',
      borderWidth: '-',
      surface: '-',
      surfaceFrom: '-',
      ratio: 0,
      required: 3,
      passes: false,
      measurable: false,
      debug: String(raw.missing),
      uncertainBecause: null,
    };
  }

  return {
    label,
    selector,
    borderColor: raw.borderColor ?? '-',
    borderWidth: raw.borderWidth ?? '-',
    surface: raw.surface ?? '-',
    surfaceFrom: raw.surfaceFrom ?? '-',
    ratio: raw.ratio ?? 0,
    required: 3,
    passes: (raw.ratio ?? 0) >= 3,
    measurable: true,
    debug: '',
    uncertainBecause: raw.backdropNode ?? null,
  };
}

export function formatContrast(m: ContrastMeasurement | BorderContrastMeasurement): string {
  const verdict = m.passes ? 'PASS' : 'FAIL';
  const base =
    `  ${verdict}  ${m.label.padEnd(30)}` +
    `ratio=${String(m.ratio).padStart(6)}  need=${String(m.required).padEnd(4)}`;
  if (!m.measurable) return base + `  UNMEASURABLE [${m.debug}]`;
  if ('fontSizePx' in m) {
    return (
      base +
      `  ${m.fontSizePx}px/${m.fontWeight}`.padEnd(11) +
      `fg=${m.foreground}`.padEnd(30) +
      `bg=${m.background}`.padEnd(22) +
      `"${m.sample}"` +
      (m.uncertainBecause ? `  [uncertain: bg image on <${m.uncertainBecause}>]` : '')
    );
  }
  return (
    base +
    `  border=${m.borderColor} ${m.borderWidth}`.padEnd(34) +
    `surface=${m.surface} (${m.surfaceFrom})` +
    (m.uncertainBecause ? `  [uncertain: bg image on <${m.uncertainBecause}>]` : '')
  );
}

export { TAP_PROBE_LIMIT };

// ---------------------------------------------------------------------------
// 5. Extended `test`
// ---------------------------------------------------------------------------

export interface CadenceFixtures {
  /** Opens `path` with auth bypassed AND asserts the route mounted. */
  open: (path: string) => Promise<void>;
}

export const test = base.extend<CadenceFixtures>({
  open: async ({ page }, use) => {
    // Seed the auth bypass before ANY page script runs, rather than relying on
    // App.tsx:154-158 noticing the query param and writing localStorage. That
    // makes the bypass effective from the first paint, so a spec can never
    // observe the signed-out flash, and it survives client-side navigation where
    // the `?test_auth=true` query param is gone.
    //
    // Only honoured in DEV (App.tsx:147), which is what `pnpm run dev` serves --
    // so this cannot become a production auth bypass.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cadence_test_auth', 'true');
        (window as unknown as { __CADENCE_E2E__?: boolean }).__CADENCE_E2E__ = true;
        window.sessionStorage.setItem('__CADENCE_E2E__', 'true');
      } catch {
        /* storage unavailable: the ?test_auth=true query param still works */
      }
    });
    await use(async (path: string) => gotoRoute(page, path));
  },
});

export { expect } from '@playwright/test';

/** Re-exported so specs can create a context without importing @playwright/test twice. */
export type { BrowserContext };
