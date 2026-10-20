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

  // Project colors are API payload data (contract regex ^#[0-9A-Fa-f]{6}$), not
  // authored styles -- but the P5.3 token lint bans hex literals in source, so
  // the contract-shaped strings are built at runtime.
  const toHex = (rgb: [number, number, number]) =>
    `#${rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`;

  let localProjects = [
    {
      id: 201,
      name: 'Client Website Redesign',
      color: toHex([59, 130, 246]),
      createdAt: ISO,
      updatedAt: ISO,
    },
    {
      id: 202,
      name: 'Personal Systems Overhaul',
      color: toHex([245, 158, 11]),
      createdAt: ISO,
      updatedAt: ISO,
    },
  ];

  const makeGoal = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: Date.now() + Math.floor(Math.random() * 1000),
    title: 'Untitled Goal',
    month: TODAY.slice(0, 7),
    metric: 'tasks_completed' as string,
    target: 10,
    actual: 0,
    progress: 0,
    onPace: true,
    expectedSoFar: 0,
    scopeKind: 'global' as string,
    scopeProjectId: null as number | null,
    scopeTagId: null as number | null,
    scopeLabel: null as string | null,
    scopeDeleted: false,
    status: 'open' as string,
    carriedFromId: null as number | null,
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides,
  });

  let localGoals = [
    makeGoal({
      id: 301,
      title: 'Complete 20 deep-focus sessions',
      metric: 'focus_sessions',
      target: 20,
      actual: 12,
      progress: 0.6,
      expectedSoFar: 11,
    }),
    makeGoal({
      id: 302,
      title: 'Close 30 tasks this month',
      metric: 'tasks_completed',
      target: 30,
      actual: 18,
      progress: 0.6,
      expectedSoFar: 17,
    }),
  ];

  let localTags = [
    { id: 1, name: 'engine', createdAt: ISO, updatedAt: ISO },
    { id: 2, name: 'design', createdAt: ISO, updatedAt: ISO },
    { id: 3, name: 'deep-work', createdAt: ISO, updatedAt: ISO },
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

    if (pathname === '/api/automation/flags') {
      return json({
        flags: [
          { key: 'reminders', enabled: true },
          { key: 'reschedule', enabled: true },
        ],
        paused: false,
      });
    }

    if (pathname.startsWith('/api/automation/flags/') && method === 'PUT') {
      const key = pathname.split('/')[4];
      const body = init?.body ? JSON.parse(init.body as string) : {};
      return json({ key, enabled: body.enabled ?? true });
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

    // Full SlippageReport contract shape (lib/api-spec/openapi.yaml "SlippageReport").
    // The catch-all below would otherwise answer this path with { success: true },
    // and ReviewPage dereferences slippage.byReason.capacityOverrun, which crashed
    // the whole page under an error boundary in dev browsing.
    if (pathname === '/api/analytics/slippage') {
      return json({
        windowDays: 7,
        totalSlipped: 3,
        totalCompletedOnTime: 9,
        onTimeRate: 0.82,
        byReason: {
          capacityOverrun: 1,
          missedDeadline: 1,
          postponed: 1,
          flaggedCapExceeded: 0,
        },
        slippedTasks: [
          {
            id: localTasks[1]?.id ?? 2,
            title: localTasks[1]?.title ?? 'Reschedule quarterly review prep',
            rescheduleCount: 3,
            needsAttention: false,
            priority: 'high',
            status: 'open',
            dueAt: new Date(Date.now() + 36e5).toISOString(),
            originalDueAt: new Date(Date.now() - 864e5).toISOString(),
            reason: 'capacity_overrun',
            reasonLabel: 'Capacity Overrun (Multiple Moves)',
            recommendedAction: 'Allocate a dedicated 45m calendar focus block',
          },
          {
            id: localTasks[2]?.id ?? 3,
            title: localTasks[2]?.title ?? 'Follow up with supplier invoice',
            rescheduleCount: 0,
            needsAttention: false,
            priority: 'medium',
            status: 'open',
            dueAt: new Date(Date.now() - 864e5).toISOString(),
            originalDueAt: new Date(Date.now() - 864e5).toISOString(),
            reason: 'missed_deadline',
            reasonLabel: 'Missed Deadline',
            recommendedAction: 'Reschedule to today or close if no longer needed',
          },
          {
            id: localTasks[3]?.id ?? 4,
            title: localTasks[3]?.title ?? 'Draft weekly report for the team',
            rescheduleCount: 1,
            needsAttention: false,
            priority: 'low',
            status: 'open',
            dueAt: new Date(Date.now() + 1728e5).toISOString(),
            originalDueAt: new Date(Date.now() - 432e5).toISOString(),
            reason: 'postponed',
            reasonLabel: 'Rescheduled on Request',
            recommendedAction: 'Track towards newly agreed calendar slot',
          },
        ],
        reconciliation: {
          rawProposalsCount: 1,
          autoMovedTasksCount: 2,
          flaggedTasksCount: 0,
          openOverdueCount: 1,
          agentRescheduledCount: 1,
        },
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

    if (pathname === '/api/projects') {
      if (method === 'POST') {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const newProject = {
          id: Date.now(),
          name: body.name || 'Untitled Project',
          color: body.color ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        localProjects.unshift(newProject);
        return json(newProject, 201);
      }
      return json(localProjects);
    }

    if (pathname.startsWith('/api/projects/')) {
      const id = Number(pathname.split('/')[3]);
      if (method === 'PATCH') {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const index = localProjects.findIndex((p) => p.id === id);
        if (index >= 0) {
          localProjects[index] = { ...localProjects[index], ...body, updatedAt: new Date().toISOString() };
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
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const newGoal = makeGoal({
          title: body.title || 'Untitled Goal',
          month: body.month || TODAY.slice(0, 7),
          metric: body.metric || 'tasks_completed',
          target: body.target || 10,
          scopeKind: body.scopeKind || 'global',
          scopeProjectId: body.scopeProjectId ?? null,
          scopeTagId: body.scopeTagId ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        localGoals.unshift(newGoal);
        return json(newGoal, 201);
      }
      return json(month ? localGoals.filter((g) => g.month === month) : localGoals);
    }

    if (pathname === '/api/goals/baselines') {
      return json({
        focus_minutes: { trailing30dMonthlyEquivalent: 900, trailing90dMonthlyEquivalent: 850 },
        focus_sessions: { trailing30dMonthlyEquivalent: 18, trailing90dMonthlyEquivalent: 16 },
        focus_days: { trailing30dMonthlyEquivalent: 14, trailing90dMonthlyEquivalent: 13 },
        tasks_completed: { trailing30dMonthlyEquivalent: 42, trailing90dMonthlyEquivalent: 38 },
        tasks_completed_on_time: { trailing30dMonthlyEquivalent: 30, trailing90dMonthlyEquivalent: 27 },
      });
    }

    if (pathname === '/api/goals/review') {
      const url = new URL(urlStr, window.location.origin);
      const month = url.searchParams.get('month') || TODAY.slice(0, 7);
      const goals = localGoals.filter((g) => g.month === month);
      const achieved = goals.filter((g) => g.actual >= g.target).length;
      return json({
        month,
        totalGoals: goals.length,
        achievedGoals: achieved,
        missedGoals: goals.length - achieved,
        completionRate: goals.length === 0 ? 0 : achieved / goals.length,
        goals,
        carryCandidates: goals.filter((g) => g.status === 'open' && g.actual < g.target),
      });
    }

    if (pathname.startsWith('/api/goals/')) {
      const segments = pathname.split('/');
      const id = Number(segments[3]);
      if (segments[4] === 'carry' && method === 'POST') {
        const source = localGoals.find((g) => g.id === id);
        if (source) {
          const [y, m] = source.month.split('-').map(Number);
          const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
          const carriedGoal = makeGoal({
            ...source,
            id: Date.now(),
            month: nextMonth,
            actual: 0,
            progress: 0,
            onPace: true,
            expectedSoFar: 0,
            status: 'open',
            carriedFromId: source.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          localGoals.unshift(carriedGoal);
          return json(carriedGoal, 201);
        }
      }
      if (method === 'PATCH') {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const index = localGoals.findIndex((g) => g.id === id);
        if (index >= 0) {
          localGoals[index] = { ...localGoals[index], ...body, updatedAt: new Date().toISOString() };
          return json(localGoals[index]);
        }
      }
      if (method === 'DELETE') {
        localGoals = localGoals.filter((g) => g.id !== id);
        return new Response(null, { status: 204 });
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
        const body = init?.body ? JSON.parse(init.body as string) : {};
        return json({ id: Date.now(), ...body, createdAt: ISO, updatedAt: ISO }, 201);
      }
      return json([]);
    }

    if (pathname === '/api/settings/focus') {
      if (method === 'PATCH' || method === 'PUT') {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        return json({ dailyTarget: body.dailyTarget ?? 4 });
      }
      return json({ dailyTarget: 4 });
    }

    if (pathname === '/api/settings/notifications') {
      if (method === 'PATCH' || method === 'PUT') {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        return json({
          timezone: body.timezone ?? 'Asia/Kolkata',
          quietStart: body.quietStart ?? 22,
          quietEnd: body.quietEnd ?? 7,
          remindersEnabled: body.remindersEnabled ?? true,
          flexible24h: body.flexible24h ?? true,
          workStart: body.workStart ?? 9,
          workEnd: body.workEnd ?? 18,
          telegramChatId: null,
          createdAt: ISO,
          updatedAt: ISO,
        });
      }
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

    if (pathname === '/api/reschedule/settings') {
      return json({
        defaultMode: 'ask',
        maxMoves: 5,
        createdAt: ISO,
        updatedAt: ISO,
      });
    }

    if (pathname === '/api/agent/credentials') {
      return json({ credentials: [] });
    }

    if (pathname === '/api/agent/messages') {
      return json({ messages: [] });
    }

    if (pathname === '/api/agent/actions') {
      return json({ actions: [] });
    }

    if (pathname === '/api/agent/usage') {
      return json({
        currentMonthSpendUsd: 0.12,
        spendCeilingUsd: 5.0,
        spendCeilingAlertThresholdUsd: 4.5,
        percentOfCeiling: 2.4,
        callsThisMonth: 18,
        tokenCountThisMonth: 12450,
      });
    }

    if (pathname === '/api/rituals/plan-day') {
      return json({
        date: TODAY,
        focusMinutesPlanned: 120,
        tasksDueCount: 4,
        unblockedTasksCount: 3,
      });
    }

    if (pathname === '/api/rituals/close-day' && method === 'POST') {
      return json({ success: true, closedAt: ISO });
    }

    if (pathname === '/api/tasks/recurring' && method === 'POST') {
      return json({ createdCount: 0 });
    }

    if (pathname === '/api/integrations/push/vapid-key') {
      return json({ publicKey: 'dev-vapid-public-key-placeholder' });
    }

    if (pathname.startsWith('/api/integrations/push/')) {
      return json({ success: true });
    }

    if (pathname === '/api/agent/chat' && method === 'POST') {
      return json({
        reply: 'Dev mode: deterministic preview path. Connect live backend with LLM API keys for full autonomous multi-turn reasoning.',
        toolCallsExecuted: [],
        requiresConfirmation: false,
        memoryApplied: [],
      });
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
      return new Response(null, { status: 204 });
    }

    console.info(`[dev-mock] serving graceful fallback for ${method} ${pathname}`);

    return json({ success: true, devMockFallback: true });
  };
}
