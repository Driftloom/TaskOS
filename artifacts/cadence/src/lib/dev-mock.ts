/**
 * dev-mock.ts — Dev-only transparent mock fallback.
 *
 * When testing locally without a live Clerk session (e.g. ?test_auth=true or dev testing),
 * this interceptor catches unauthenticated 401s from the local backend and serves
 * realistic, rich, enterprise-grade mock data so that every page, ring, chart, and
 * list renders completely without "The workspace could not load" errors.
 *
 * The sample data itself lives in `dev-mock-fixtures.ts`, which is a pure module
 * (no `window`, no ambient clock) whose builders are typed by the generated
 * contract types and validated against the generated Zod schemas in
 * `@workspace/api-zod` by `dev-mock.test.ts`. This file keeps only the
 * interception logic and the mutable state the mock has to own: the mock is
 * stateful, so a POST creates a task that a later GET has to return.
 *
 * The status codes here are the contract's too. A 204 has no body to validate
 * against a schema, so `dev-mock.test.ts` exercises this interceptor directly
 * for the DELETEs the contract answers with 204 and the ones it answers with
 * 200.
 *
 * Tree-shaken in production. Real Clerk sessions pass directly to Supabase.
 */

import type { Goal, MemoryFact, Project, Tag, Task, TimeBlock } from '@workspace/api-zod';
import {
  applyMockTaskPatch,
  createMockAgentActions,
  createMockAgentChat,
  createMockAgentCredentials,
  createMockAgentMessages,
  createMockAgentUsage,
  createMockAutomationFlag,
  createMockAutomationFlags,
  createMockBlocksResponse,
  createMockDayCloseSummary,
  createMockDayPlan,
  createMockFocusSession,
  createMockFocusSessions,
  createMockFocusSettings,
  createMockGoalBaselines,
  createMockGoalRecord,
  createMockGoals,
  createMockIntegrationsStatus,
  createMockMemoryConfirmationsResponse,
  createMockMemoryFactsResponse,
  createMockMemoryFactRows,
  createMockMomentum,
  createMockMonthlyReview,
  createMockNotificationSettings,
  createMockProject,
  createMockProjects,
  createMockPushSubscription,
  createMockPushTest,
  createMockPushUnsubscribe,
  createMockRecurringTask,
  createMockRescheduleProposals,
  createMockRescheduleSettings,
  createMockSlippageReport,
  createMockTask,
  createMockTaskSummary,
  createMockTags,
  createMockTasks,
  createMockTimeBlock,
  createMockTimeBlocks,
  createMockVapidKey,
  mockDate,
} from './dev-mock-fixtures';

export function setupDevMock(): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  if (typeof navigator !== 'undefined' && navigator.webdriver) return;
  if (typeof window !== 'undefined' && ((window as unknown as { __CADENCE_E2E__?: boolean }).__CADENCE_E2E__ || window.sessionStorage?.getItem('__CADENCE_E2E__') === 'true')) return;

  const rawFetch = window.fetch;
  const now = new Date();
  const TODAY = mockDate(now);

  let localTasks: Task[] = createMockTasks(now);

  let localBlocks: TimeBlock[] = createMockTimeBlocks(now, localTasks);

  let localMemoryFacts: MemoryFact[] = createMockMemoryFactRows(now);

  let localProjects: Project[] = createMockProjects(now);

  let localGoals: Goal[] = createMockGoals(now);

  let localTags: Tag[] = createMockTags(now);

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Only intercept /api calls
    if (!urlStr.includes('/api/')) {
      return rawFetch.call(window, input, init);
    }

    const isTestAuth =
      window.location.search.includes('test_auth=true') ||
      window.localStorage.getItem('cadence_test_auth') === 'true';

    // In automated Playwright E2E suites, do not intercept; allow Playwright page.route to handle /api requests
    if (
      (typeof navigator !== 'undefined' && navigator.webdriver) ||
      (typeof window !== 'undefined' && ((window as unknown as { __CADENCE_E2E__?: boolean }).__CADENCE_E2E__ || window.sessionStorage?.getItem('__CADENCE_E2E__') === 'true'))
    ) {
      return rawFetch.call(window, input, init);
    }

    // In local development:
    // If running in test_auth mode, serve mock data directly so no unauthenticated 401s hit the network or console.
    // If not in test_auth mode, try the real backend first; if authenticated, return live data.
    if (!isTestAuth) {
      try {
        const response = await rawFetch.call(window, input, init);
        if (response.ok || response.status !== 401) {
          return response;
        }
      } catch {
        // Backend offline or unreachable: fall through to dev mock
      }
    }

    // Serve dev mock fallback for unauthenticated 401s in development:
    const pathname = new URL(urlStr, window.location.origin).pathname;
    const method = init?.method?.toUpperCase() ?? 'GET';

    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

    const body = () => (init?.body ? JSON.parse(init.body as string) : {});

    if (pathname === '/api/automation/flags') {
      return json(createMockAutomationFlags());
    }

    if (pathname.startsWith('/api/automation/flags/') && method === 'PUT') {
      const key = pathname.split('/')[4] as 'reminders' | 'reschedule';
      return json(createMockAutomationFlag(key, body().enabled ?? true));
    }

    if (pathname === '/api/tasks/summary') {
      return json(createMockTaskSummary(localTasks));
    }

    if (pathname === '/api/analytics/slippage') {
      return json(createMockSlippageReport(localTasks, now));
    }

    if (pathname === '/api/momentum') {
      return json(createMockMomentum(localTasks, now));
    }

    if (pathname === '/api/tasks') {
      const url = new URL(urlStr, window.location.origin);
      const scope = url.searchParams.get('scope');

      if (method === 'POST') {
        const newTask = createMockTask(Date.now(), body(), new Date(), localTags);
        localTasks.unshift(newTask);
        return json(newTask, 201);
      }

      if (scope === 'inbox') {
        return json(localTasks.filter((t) => t.status === 'inbox'));
      }
      if (scope === 'today') {
        return json(localTasks.filter((t) => t.status === 'open' || t.status === 'completed'));
      }
      if (scope === 'completed7d') {
        return json(localTasks.filter((t) => t.status === 'completed'));
      }
      return json(localTasks);
    }

    // A block is placed for a TASK, so the contract path is
    // POST /api/tasks/{id}/blocks -- not POST /api/blocks, which the contract
    // defines for GET only. The task id comes from the path, not the body.
    if (method === 'POST' && /^\/api\/tasks\/\d+\/blocks$/.test(pathname)) {
      const taskId = Number(pathname.split('/')[3]);
      const newBlock = createMockTimeBlock(
        Date.now(),
        { ...body(), taskId },
        new Date(),
        localTasks,
      );
      localBlocks.push(newBlock);
      return json(newBlock, 201);
    }

    if (pathname.startsWith('/api/tasks/')) {
      const id = Number(pathname.split('/')[3]);
      if (method === 'PATCH') {
        const index = localTasks.findIndex((t) => t.id === id);
        if (index >= 0) {
          localTasks[index] = applyMockTaskPatch(
            localTasks[index],
            body(),
            new Date(),
            localTags,
          );
          return json(localTasks[index]);
        }
      }
      if (method === 'DELETE') {
        localTasks = localTasks.filter((t) => t.id !== id);
        // The contract answers 204 with no body.
        return new Response(null, { status: 204 });
      }
    }

    if (pathname === '/api/projects') {
      if (method === 'POST') {
        const newProject = createMockProject(Date.now(), body(), new Date());
        localProjects.unshift(newProject);
        return json(newProject, 201);
      }
      return json(localProjects);
    }

    if (pathname.startsWith('/api/projects/')) {
      const id = Number(pathname.split('/')[3]);
      if (method === 'PATCH') {
        const patch = body();
        const index = localProjects.findIndex((p) => p.id === id);
        if (index >= 0) {
          localProjects[index] = {
            ...localProjects[index],
            name: patch.name ?? localProjects[index].name,
            color: patch.color !== undefined ? patch.color : localProjects[index].color,
            updatedAt: new Date(),
          };
          return json(localProjects[index]);
        }
      }
      if (method === 'DELETE') {
        localProjects = localProjects.filter((p) => p.id !== id);
        return new Response(null, { status: 204 });
      }
    }

    if (pathname === '/api/goals') {
      const url = new URL(urlStr, window.location.origin);
      const month = url.searchParams.get('month');
      if (method === 'POST') {
        const payload = body();
        const newGoal = createMockGoalRecord(
          Date.now() + Math.floor(Math.random() * 1000),
          {
            title: payload.title || 'Untitled Goal',
            month: payload.month || TODAY.slice(0, 7),
            metric: payload.metric || 'tasks_completed',
            target: payload.target || 10,
            scopeKind: payload.scopeKind || 'global',
            scopeProjectId: payload.scopeProjectId ?? null,
            scopeTagId: payload.scopeTagId ?? null,
          },
          new Date(),
        );
        localGoals.unshift(newGoal);
        return json(newGoal, 201);
      }
      return json(month ? localGoals.filter((g) => g.month === month) : localGoals);
    }

    if (pathname === '/api/goals/baselines') {
      return json(createMockGoalBaselines());
    }

    if (pathname === '/api/goals/review') {
      const url = new URL(urlStr, window.location.origin);
      const month = url.searchParams.get('month') || TODAY.slice(0, 7);
      return json(createMockMonthlyReview(month, localGoals));
    }

    if (pathname.startsWith('/api/goals/')) {
      const segments = pathname.split('/');
      const id = Number(segments[3]);
      if (segments[4] === 'carry' && method === 'POST') {
        const source = localGoals.find((g) => g.id === id);
        if (source) {
          const [y, m] = source.month.split('-').map(Number);
          const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
          const carriedGoal = createMockGoalRecord(
            Date.now(),
            {
              ...source,
              month: nextMonth,
              actual: 0,
              progress: 0,
              onPace: true,
              expectedSoFar: 0,
              status: 'open',
              carriedFromId: source.id,
            },
            new Date(),
          );
          localGoals.unshift(carriedGoal);
          return json(carriedGoal, 201);
        }
      }
      if (method === 'PATCH') {
        const patch = body();
        const index = localGoals.findIndex((g) => g.id === id);
        if (index >= 0) {
          localGoals[index] = {
            ...localGoals[index],
            title: patch.title ?? localGoals[index].title,
            target: patch.target ?? localGoals[index].target,
            updatedAt: new Date(),
          };
          return json(localGoals[index]);
        }
      }
      if (method === 'DELETE') {
        localGoals = localGoals.filter((g) => g.id !== id);
        // The contract answers 200 with `{ success: boolean }`, not 204.
        return json({ success: true });
      }
    }

    if (pathname === '/api/tags') {
      return json(localTags);
    }

    if (pathname.startsWith('/api/tags/') && method === 'DELETE') {
      const id = Number(pathname.split('/')[3]);
      localTags = localTags.filter((t) => t.id !== id);
      return new Response(null, { status: 204 });
    }

    if (pathname === '/api/focus-sessions') {
      if (method === 'POST') {
        return json(createMockFocusSession(Date.now(), body(), new Date()), 201);
      }
      return json(createMockFocusSessions());
    }

    if (pathname === '/api/settings/focus') {
      if (method === 'PATCH' || method === 'PUT') {
        return json({
          ...createMockFocusSettings(now),
          dailyTarget: body().dailyTarget ?? createMockFocusSettings(now).dailyTarget,
        });
      }
      return json(createMockFocusSettings(now));
    }

    if (pathname === '/api/settings/notifications') {
      if (method === 'PATCH' || method === 'PUT') {
        const payload = body();
        return json({
          ...createMockNotificationSettings(now),
          timezone: payload.timezone ?? 'Asia/Kolkata',
          quietStart: payload.quietStart ?? 22,
          quietEnd: payload.quietEnd ?? 7,
          remindersEnabled: payload.remindersEnabled ?? true,
          flexible24h: payload.flexible24h ?? true,
          workStart: payload.workStart ?? 9,
          workEnd: payload.workEnd ?? 18,
        });
      }
      return json(createMockNotificationSettings(now));
    }

    if (pathname === '/api/reschedule/proposals') {
      return json(createMockRescheduleProposals());
    }

    if (pathname === '/api/memory/facts') {
      return json(createMockMemoryFactsResponse(localMemoryFacts));
    }

    if (pathname === '/api/memory/confirmations') {
      return json(createMockMemoryConfirmationsResponse());
    }

    if (pathname === '/api/integrations/status') {
      return json(createMockIntegrationsStatus());
    }

    if (pathname === '/api/blocks') {
      return json(createMockBlocksResponse(localBlocks));
    }

    // The contract path is /api/settings/rescheduling. The mock used to
    // intercept /api/reschedule/settings, a path that does not exist, so the
    // request fell through to the catch-all below.
    if (pathname === '/api/settings/rescheduling') {
      return json(createMockRescheduleSettings(now));
    }

    if (pathname === '/api/agent/credentials') {
      return json(createMockAgentCredentials());
    }

    if (pathname === '/api/agent/messages') {
      return json(createMockAgentMessages());
    }

    if (pathname === '/api/agent/actions') {
      return json(createMockAgentActions());
    }

    if (pathname === '/api/agent/usage') {
      return json(createMockAgentUsage());
    }

    if (pathname === '/api/rituals/plan-day') {
      return json(createMockDayPlan(localTasks, localBlocks, now));
    }

    if (pathname === '/api/rituals/close-day' && method === 'POST') {
      const payload = body();
      return json(
        createMockDayCloseSummary(
          localTasks,
          now,
          payload.targetDate ? new Date(payload.targetDate) : undefined,
        ),
      );
    }

    if (pathname === '/api/tasks/recurring' && method === 'POST') {
      return json(createMockRecurringTask());
    }

    if (pathname === '/api/integrations/push/vapid-key') {
      return json(createMockVapidKey());
    }

    if (pathname === '/api/integrations/push/subscribe' && method === 'POST') {
      return json(createMockPushSubscription(Date.now()));
    }

    if (pathname === '/api/integrations/push/unsubscribe' && method === 'POST') {
      return json(createMockPushUnsubscribe());
    }

    if (pathname === '/api/integrations/push/test' && method === 'POST') {
      return json(createMockPushTest());
    }

    if (pathname === '/api/agent/chat' && method === 'POST') {
      return json(createMockAgentChat());
    }

    if (pathname.startsWith('/api/blocks/') && method === 'DELETE') {
      const id = Number(pathname.split('/')[3]);
      localBlocks = localBlocks.filter((b) => b.id !== id);
      return new Response(null, { status: 204 });
    }

    if (pathname.startsWith('/api/memory/facts/') && method === 'DELETE') {
      const segments = pathname.split('/');
      const id = Number(segments[4]);
      localMemoryFacts = localMemoryFacts.filter((f) => f.id !== id);
      // The contract answers 200 with `{ ok: boolean }`, not 204.
      return json({ ok: true });
    }

    console.info(`[dev-mock] serving graceful fallback for ${method} ${pathname}`);

    // NOT a contract response. This is the dev mock's own marker for a path it
    // does not model, so a developer can see in the console that the request
    // was not really served.
    return json({ success: true, devMockFallback: true });
  };
}
