/**
 * dev-mock.ts — Dev-only transparent mock fallback.
 *
 * When testing locally without a live Clerk session (e.g. ?test_auth=true or dev testing),
 * this interceptor catches unauthenticated 401s from the local backend and serves
 * realistic, rich, enterprise-grade mock data so that every page, ring, chart, and
 * list renders completely without "The workspace could not load" errors.
 *
 * Tree-shaken in production. Real Clerk sessions pass directly to Supabase.
 */

export function setupDevMock(): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  if (typeof navigator !== 'undefined' && navigator.webdriver) return;
  if (typeof window !== 'undefined' && ((window as unknown as { __CADENCE_E2E__?: boolean }).__CADENCE_E2E__ || window.sessionStorage?.getItem('__CADENCE_E2E__') === 'true')) return;

  const rawFetch = window.fetch;
  const ISO = new Date().toISOString();
  const TODAY = ISO.split('T')[0];

  let localTasks = [
    {
      id: 101,
      title: 'Architect resilient reschedule engine Rule 9',
      status: 'open' as const,
      priority: 'high' as const,
      durationMin: 45,
      dueAt: `${TODAY}T14:00:00.000Z`,
      notes: 'Check memory_facts for duration multiplier before moving time blocks.',
      automation: 'auto' as const,
      needsAttention: false,
      rescheduleCount: 0,
      completedAt: null,
      projectId: null,
      parentId: null,
      rrule: null,
      tags: [{ id: 1, name: 'engine' }, { id: 2, name: 'core' }],
      createdAt: ISO,
      updatedAt: ISO,
    },
    {
      id: 102,
      title: 'Implement Apple HIG dark-mode docked canvas layout',
      status: 'open' as const,
      priority: 'high' as const,
      durationMin: 30,
      dueAt: `${TODAY}T16:00:00.000Z`,
      notes: 'Eliminate side voids and ensure responsive elegance across all display widths.',
      automation: 'auto' as const,
      needsAttention: false,
      rescheduleCount: 0,
      completedAt: null,
      projectId: null,
      parentId: null,
      rrule: null,
      tags: [{ id: 3, name: 'design' }, { id: 4, name: 'ui' }],
      createdAt: ISO,
      updatedAt: ISO,
    },
    {
      id: 103,
      title: 'Configure Telegram bot webhook for two-way notifications',
      status: 'open' as const,
      priority: 'medium' as const,
      durationMin: 25,
      dueAt: `${TODAY}T18:00:00.000Z`,
      notes: 'Free two-way commands: done, snooze 1h, list today.',
      automation: 'ask' as const,
      needsAttention: false,
      rescheduleCount: 1,
      completedAt: null,
      projectId: null,
      parentId: null,
      rrule: null,
      tags: [{ id: 5, name: 'telegram' }],
      createdAt: ISO,
      updatedAt: ISO,
    },
    {
      id: 104,
      title: 'Conduct weekly zero-trust audit verification',
      status: 'open' as const,
      priority: 'low' as const,
      durationMin: 15,
      dueAt: `${TODAY}T20:00:00.000Z`,
      notes: 'Run all 9 gates to guarantee 100% test integrity.',
      automation: 'off' as const,
      needsAttention: false,
      rescheduleCount: 0,
      completedAt: null,
      projectId: null,
      parentId: null,
      rrule: null,
      tags: [{ id: 6, name: 'audit' }],
      createdAt: ISO,
      updatedAt: ISO,
    },
    {
      id: 105,
      title: 'Hardening Clerk auth and Row-Level Security isolation',
      status: 'completed' as const,
      priority: 'high' as const,
      durationMin: 60,
      dueAt: `${TODAY}T11:00:00.000Z`,
      notes: 'Enforce auth.jwt()->>sub on all Postgres tables.',
      automation: 'auto' as const,
      needsAttention: false,
      rescheduleCount: 0,
      completedAt: `${TODAY}T11:45:00.000Z`,
      projectId: null,
      parentId: null,
      rrule: null,
      tags: [{ id: 7, name: 'security' }],
      createdAt: ISO,
      updatedAt: ISO,
    },
    {
      id: 106,
      title: 'Explore pgvector semantic memory clustering',
      status: 'inbox' as const,
      priority: 'medium' as const,
      durationMin: 35,
      dueAt: null,
      notes: 'Test embeddings pipeline for behavioral pattern discovery.',
      automation: null,
      needsAttention: false,
      rescheduleCount: 0,
      completedAt: null,
      projectId: null,
      parentId: null,
      rrule: null,
      tags: [{ id: 8, name: 'ai' }],
      createdAt: ISO,
      updatedAt: ISO,
    },
    {
      id: 107,
      title: 'Calibrate Web Audio chime frequencies',
      status: 'inbox' as const,
      priority: 'low' as const,
      durationMin: 20,
      dueAt: null,
      notes: 'Ensure C5-E5-G5 chords sound soothing with 2800Hz low-pass filter.',
      automation: null,
      needsAttention: false,
      rescheduleCount: 0,
      completedAt: null,
      projectId: null,
      parentId: null,
      rrule: null,
      tags: [{ id: 9, name: 'audio' }],
      createdAt: ISO,
      updatedAt: ISO,
    },
  ];

  let localBlocks = [
    {
      id: 501,
      taskId: 102,
      startAt: `${TODAY}T10:00:00.000Z`,
      endAt: `${TODAY}T11:00:00.000Z`,
      isFixed: false,
      createdAt: ISO,
      updatedAt: ISO,
    },
  ];

  let localMemoryFacts = [
    {
      id: 1,
      userId: 'dev-user',
      category: 'chronotype',
      key: 'peak_focus_window',
      title: 'Peak focus window is late morning (10:00 - 12:30)',
      confidence: 0.92,
      source: 'A',
      evidenceCount: 14,
      rule9Multiplier: 1.0,
      archived: false,
      value: { window: '10:00-12:30', description: 'Highest completion rate with zero interruptions.' },
      lastReinforcedAt: ISO,
      createdAt: ISO,
      updatedAt: ISO,
    },
    {
      id: 2,
      userId: 'dev-user',
      category: 'soft_commitment',
      key: 'architecture_deep_work',
      title: 'Architecture tasks take 1.25x estimated duration',
      confidence: 0.85,
      source: 'A',
      evidenceCount: 8,
      rule9Multiplier: 1.25,
      archived: false,
      value: { rule9Multiplier: 1.25 },
      lastReinforcedAt: ISO,
      createdAt: ISO,
      updatedAt: ISO,
    },
  ];

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

    // If not in test_auth mode, use real fetch
    if (!isTestAuth) {
      return rawFetch.call(window, input, init);
    }

    const hasClerkSession = Boolean((window as unknown as { Clerk?: { session?: unknown } }).Clerk?.session);
    if (hasClerkSession) {
      try {
        const response = await rawFetch.call(window, input, init);
        if (response.ok || response.status !== 401) return response;
      } catch {
        // Backend offline or unreachable: fall through to dev mock
      }
    }

    // Serve dev mock fallback for unauthenticated 401s in test_auth mode:
    const pathname = new URL(urlStr, window.location.origin).pathname;
    const method = init?.method?.toUpperCase() ?? 'GET';

    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

    if (pathname === '/api/automation/flags') {
      return json({ paused: false });
    }

    if (pathname === '/api/tasks/summary') {
      const open = localTasks.filter((t) => t.status === 'open').length;
      const completed = localTasks.filter((t) => t.status === 'completed').length;
      return json({
        total: open + completed,
        open,
        completed,
        focusMinutes: 60,
      });
    }

    if (pathname === '/api/momentum') {
      const completed = localTasks.filter((t) => t.status === 'completed').length;
      return json({
        tasksCompleted: completed,
        tasksTotal: localTasks.filter((t) => t.status !== 'inbox').length,
        roundsCompleted: 3,
        roundTarget: 4,
        streakDays: 7,
      });
    }

    if (pathname === '/api/tasks') {
      const url = new URL(urlStr, window.location.origin);
      const scope = url.searchParams.get('scope');

      if (method === 'POST') {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const newTask = {
          id: Date.now(),
          title: body.title || 'Untitled Task',
          status: body.status || 'open',
          priority: body.priority || 'medium',
          durationMin: body.durationMin || 25,
          dueAt: body.dueAt || null,
          notes: body.notes || null,
          automation: body.automation || 'auto',
          needsAttention: false,
          rescheduleCount: 0,
          completedAt: null,
          projectId: null,
          parentId: null,
          rrule: null,
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
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

    if (pathname.startsWith('/api/tasks/')) {
      const id = Number(pathname.split('/')[3]);
      if (method === 'PATCH') {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const index = localTasks.findIndex((t) => t.id === id);
        if (index >= 0) {
          localTasks[index] = { ...localTasks[index], ...body, updatedAt: new Date().toISOString() };
          return json(localTasks[index]);
        }
      }
      if (method === 'DELETE') {
        localTasks = localTasks.filter((t) => t.id !== id);
        return json({ success: true });
      }
    }

    if (pathname === '/api/focus-sessions') {
      return json([]);
    }

    if (pathname === '/api/settings/focus') {
      return json({ dailyTarget: 4 });
    }

    if (pathname === '/api/settings/notifications') {
      return json({
        timezone: 'Asia/Kolkata',
        quietStart: 22,
        quietEnd: 7,
        remindersEnabled: true,
        flexible24h: true,
        workStart: 9,
        workEnd: 18,
        telegramChatId: null,
        createdAt: ISO,
        updatedAt: ISO,
      });
    }

    if (pathname === '/api/reschedule/proposals') {
      return json([]);
    }

    if (pathname === '/api/memory/facts') {
      return json(localMemoryFacts);
    }

    if (pathname === '/api/memory/confirmations') {
      return json([]);
    }

    if (pathname === '/api/integrations/status') {
      return json({
        telegram: {
          configured: true,
          source: 'database',
          botUsername: 'cadence_task_bot',
          botFirstName: 'Cadence Bot',
          chatId: '987654321',
          webhookUrl: 'https://api.cadence.internal/api/telegram/webhook',
          webhookSecretConfigured: true,
        },
        healthchecks: {
          configured: true,
          dispatchPingUrl: 'https://hc-ping.com/fake-uuid-1',
          reschedulePingUrl: 'https://hc-ping.com/fake-uuid-2',
        },
      });
    }

    if (pathname === '/api/blocks') {
      if (method === 'POST') {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const newBlock = {
          id: Date.now(),
          taskId: body.taskId,
          startAt: body.startAt,
          endAt: body.endAt,
          isFixed: body.isFixed ?? false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        localBlocks.push(newBlock);
        return json(newBlock, 201);
      }
      return json(localBlocks);
    }

    return json({ success: true });
  };
}
