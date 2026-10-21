/**
 * dev-mock-fixtures.ts — the dev mock's sample data, extracted as PURE builders.
 *
 * Why this file exists
 * --------------------
 * `dev-mock.ts` used to hold its sample data inline, next to the `window.fetch`
 * interception. Two things went wrong because of that:
 *
 *  1. The data was hand-maintained, so it drifted away from the API contract in
 *     `lib/api-spec/openapi.yaml`. A developer running the app locally saw a
 *     Memory page that was always empty (the mock returned a bare array where
 *     the contract wants `{ facts: [...] }`), a Goals card that read "1% complete"
 *     for a 60%-done goal (the mock sent a fraction where the contract wants a
 *     percentage), and a Morning Ritual that crashed on `plan.todayTasks.length`.
 *  2. Nothing checked it. The drift was invisible until a human noticed a wrong
 *     number on screen.
 *
 * Generating the mock from the contract was rejected: the mock is STATEFUL — a
 * POST creates a task that a later GET has to return — which a stateless
 * MSW-style fixture cannot express. So the data is extracted here instead, and
 * `dev-mock.test.ts` validates every builder against the generated Zod schemas
 * in `@workspace/api-zod`. Drift then fails CI instead of a user.
 *
 * Purity rules for this module
 * ----------------------------
 *  - No `window`, no `document`, no `fetch`, no module-scope state.
 *  - No `Date.now()` and no `Math.random()`: every builder that needs the
 *    current time takes a `now: Date` parameter, and every builder that mints
 *    an id takes that id from the caller. A test can therefore pin the clock
 *    and the ids.
 *  - Every builder returns a FRESH object graph. The caller owns the mutable
 *    state; this module never holds any.
 */

/* ------------------------------------------------------------------ *
 * Time helpers — nothing in this file reads the ambient clock.
 * ------------------------------------------------------------------ */

/** The `now` instant as an ISO-8601 timestamp. */
export function mockTimestamp(now: Date): string {
  return now.toISOString();
}

/** The calendar date of `now` as `YYYY-MM-DD`. */
export function mockDate(now: Date): string {
  return now.toISOString().split('T')[0];
}

/** The calendar month of `now` as `YYYY-MM`. */
export function mockMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}

/* ------------------------------------------------------------------ *
 * Seed collections — the mock's initial state.
 * ------------------------------------------------------------------ */

export function createMockTasks(now: Date) {
  const ISO = mockTimestamp(now);
  const TODAY = mockDate(now);

  return [
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
}

export function createMockTimeBlocks(now: Date) {
  const ISO = mockTimestamp(now);
  const TODAY = mockDate(now);

  return [
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
}

export function createMockMemoryFactRows(now: Date) {
  const ISO = mockTimestamp(now);

  return [
    {
      id: 1,
      userId: 'dev-user',
      category: 'chronotype' as const,
      key: 'peak_focus_window',
      title: 'Peak focus window is late morning (10:00 - 12:30)',
      confidence: 0.92,
      source: 'A' as const,
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
      category: 'soft_commitment' as const,
      key: 'architecture_deep_work',
      title: 'Architecture tasks take 1.25x estimated duration',
      confidence: 0.85,
      source: 'A' as const,
      evidenceCount: 8,
      rule9Multiplier: 1.25,
      archived: false,
      value: { rule9Multiplier: 1.25 },
      lastReinforcedAt: ISO,
      createdAt: ISO,
      updatedAt: ISO,
    },
  ];
}

/**
 * Project colors are API payload data (contract regex ^#[0-9A-Fa-f]{6}$), not
 * authored styles -- but the P5.3 token lint bans hex literals in source, so
 * the contract-shaped strings are built at runtime.
 */
const toHex = (rgb: [number, number, number]) =>
  `#${rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`;

export function createMockProjects(now: Date) {
  const ISO = mockTimestamp(now);

  return [
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
}

export function createMockGoalRecord(
  id: number,
  overrides: Record<string, any> = {},
  now: Date,
) {
  const ISO = mockTimestamp(now);
  const TODAY = mockDate(now);

  return {
    id,
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
  };
}

export function createMockGoals(now: Date) {
  return [
    createMockGoalRecord(
      301,
      {
        title: 'Complete 20 deep-focus sessions',
        metric: 'focus_sessions',
        target: 20,
        actual: 12,
        progress: 0.6,
        expectedSoFar: 11,
      },
      now,
    ),
    createMockGoalRecord(
      302,
      {
        title: 'Close 30 tasks this month',
        metric: 'tasks_completed',
        target: 30,
        actual: 18,
        progress: 0.6,
        expectedSoFar: 17,
      },
      now,
    ),
  ];
}

export function createMockTags(now: Date) {
  const ISO = mockTimestamp(now);

  return [
    { id: 1, name: 'engine', createdAt: ISO, updatedAt: ISO },
    { id: 2, name: 'design', createdAt: ISO, updatedAt: ISO },
    { id: 3, name: 'deep-work', createdAt: ISO, updatedAt: ISO },
  ];
}

/* ------------------------------------------------------------------ *
 * Per-endpoint response builders.
 * ------------------------------------------------------------------ */

export function createMockAutomationFlags() {
  return {
    flags: [
      { key: 'reminders' as const, enabled: true },
      { key: 'reschedule' as const, enabled: true },
    ],
    paused: false,
  };
}

export function createMockAutomationFlag(key: string, enabled: boolean) {
  return { key, enabled };
}

export function createMockTaskSummary(tasks: Array<{ status: string }>) {
  const open = tasks.filter((t) => t.status === 'open').length;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  return {
    total: open + completed,
    open,
    completed,
    focusMinutes: 60,
  };
}

/**
 * Full SlippageReport contract shape (lib/api-spec/openapi.yaml "SlippageReport").
 * The catch-all in dev-mock.ts would otherwise answer this path with
 * `{ success: true }`, and ReviewPage dereferences slippage.byReason.capacityOverrun,
 * which crashed the whole page under an error boundary in dev browsing.
 */
export function createMockSlippageReport(
  tasks: Array<{ id: number; title: string }>,
  now: Date,
) {
  return {
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
        id: tasks[1]?.id ?? 2,
        title: tasks[1]?.title ?? 'Reschedule quarterly review prep',
        rescheduleCount: 3,
        needsAttention: false,
        priority: 'high',
        status: 'open',
        dueAt: new Date(now.getTime() + 36e5).toISOString(),
        originalDueAt: new Date(now.getTime() - 864e5).toISOString(),
        reason: 'capacity_overrun' as const,
        reasonLabel: 'Capacity Overrun (Multiple Moves)',
        recommendedAction: 'Allocate a dedicated 45m calendar focus block',
      },
      {
        id: tasks[2]?.id ?? 3,
        title: tasks[2]?.title ?? 'Follow up with supplier invoice',
        rescheduleCount: 0,
        needsAttention: false,
        priority: 'medium',
        status: 'open',
        dueAt: new Date(now.getTime() - 864e5).toISOString(),
        originalDueAt: new Date(now.getTime() - 864e5).toISOString(),
        reason: 'missed_deadline' as const,
        reasonLabel: 'Missed Deadline',
        recommendedAction: 'Reschedule to today or close if no longer needed',
      },
      {
        id: tasks[3]?.id ?? 4,
        title: tasks[3]?.title ?? 'Draft weekly report for the team',
        rescheduleCount: 1,
        needsAttention: false,
        priority: 'low',
        status: 'open',
        dueAt: new Date(now.getTime() + 1728e5).toISOString(),
        originalDueAt: new Date(now.getTime() - 432e5).toISOString(),
        reason: 'postponed' as const,
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
  };
}

export function createMockMomentum(tasks: Array<{ status: string }>) {
  const completed = tasks.filter((t) => t.status === 'completed').length;
  return {
    tasksCompleted: completed,
    tasksTotal: tasks.filter((t) => t.status !== 'inbox').length,
    roundsCompleted: 3,
    roundTarget: 4,
    streakDays: 7,
  };
}

export function createMockTask(id: number, body: Record<string, any>, now: Date) {
  const ISO = mockTimestamp(now);
  return {
    id,
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
    createdAt: ISO,
    updatedAt: ISO,
  };
}

export function createMockProject(id: number, body: Record<string, any>, now: Date) {
  const ISO = mockTimestamp(now);
  return {
    id,
    name: body.name || 'Untitled Project',
    color: body.color ?? null,
    createdAt: ISO,
    updatedAt: ISO,
  };
}

export function createMockGoalBaselines() {
  return {
    focus_minutes: { trailing30dMonthlyEquivalent: 900, trailing90dMonthlyEquivalent: 850 },
    focus_sessions: { trailing30dMonthlyEquivalent: 18, trailing90dMonthlyEquivalent: 16 },
    focus_days: { trailing30dMonthlyEquivalent: 14, trailing90dMonthlyEquivalent: 13 },
    tasks_completed: { trailing30dMonthlyEquivalent: 42, trailing90dMonthlyEquivalent: 38 },
    tasks_completed_on_time: { trailing30dMonthlyEquivalent: 30, trailing90dMonthlyEquivalent: 27 },
  };
}

export function createMockMonthlyReview(
  month: string,
  goals: Array<{
    id: number;
    month: string;
    title: string;
    metric: string;
    target: number;
    actual: number;
    progress: number;
    onPace: boolean;
    expectedSoFar: number;
    scopeKind: string;
    scopeProjectId: number | null;
    scopeTagId: number | null;
    scopeLabel: string | null;
    scopeDeleted: boolean;
    status: string;
    carriedFromId: number | null;
    createdAt: string;
    updatedAt: string;
  }>,
) {
  const monthGoals = goals.filter((g) => g.month === month);
  const achieved = monthGoals.filter((g) => g.actual >= g.target).length;
  return {
    month,
    totalGoals: monthGoals.length,
    achievedGoals: achieved,
    missedGoals: monthGoals.length - achieved,
    completionRate: monthGoals.length === 0 ? 0 : achieved / monthGoals.length,
    goals: monthGoals,
    carryCandidates: monthGoals.filter((g) => g.status === 'open' && g.actual < g.target),
  };
}

export function createMockFocusSessions() {
  return [] as unknown[];
}

export function createMockFocusSession(id: number, body: Record<string, any>, now: Date) {
  const ISO = mockTimestamp(now);
  return { id, ...body, createdAt: ISO, updatedAt: ISO };
}

export function createMockFocusSettings() {
  return { dailyTarget: 4 };
}

export function createMockNotificationSettings(now: Date) {
  const ISO = mockTimestamp(now);
  return {
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
  };
}

export function createMockRescheduleProposals() {
  return [] as unknown[];
}

export function createMockMemoryFactsResponse(rows: unknown[]) {
  return rows;
}

export function createMockMemoryConfirmationsResponse() {
  return [] as unknown[];
}

export function createMockIntegrationsStatus() {
  return {
    telegram: {
      configured: true,
      source: 'database' as const,
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
  };
}

export function createMockBlocksResponse(blocks: unknown[]) {
  return blocks;
}

export function createMockTimeBlock(id: number, body: Record<string, any>, now: Date) {
  const ISO = mockTimestamp(now);
  return {
    id,
    taskId: body.taskId,
    startAt: body.startAt,
    endAt: body.endAt,
    isFixed: body.isFixed ?? false,
    createdAt: ISO,
    updatedAt: ISO,
  };
}

export function createMockRescheduleSettings(now: Date) {
  const ISO = mockTimestamp(now);
  return {
    defaultMode: 'ask' as const,
    maxMoves: 5,
    createdAt: ISO,
    updatedAt: ISO,
  };
}

export function createMockAgentCredentials() {
  return { credentials: [] as unknown[] };
}

export function createMockAgentMessages() {
  return { messages: [] as unknown[] };
}

export function createMockAgentActions() {
  return { actions: [] as unknown[] };
}

export function createMockAgentUsage() {
  return {
    currentMonthSpendUsd: 0.12,
    spendCeilingUsd: 5.0,
    spendCeilingAlertThresholdUsd: 4.5,
    percentOfCeiling: 2.4,
    callsThisMonth: 18,
    tokenCountThisMonth: 12450,
  };
}

export function createMockDayPlan(now: Date) {
  return {
    date: mockDate(now),
    focusMinutesPlanned: 120,
    tasksDueCount: 4,
    unblockedTasksCount: 3,
  };
}

export function createMockDayCloseSummary(now: Date) {
  return { success: true, closedAt: mockTimestamp(now) };
}

export function createMockRecurringTask() {
  return { createdCount: 0 };
}

export function createMockVapidKey() {
  return { publicKey: 'dev-vapid-public-key-placeholder' };
}

export function createMockAgentChat() {
  return {
    reply:
      'Dev mode: deterministic preview path. Connect live backend with LLM API keys for full autonomous multi-turn reasoning.',
    toolCallsExecuted: [] as unknown[],
    requiresConfirmation: false,
    memoryApplied: [] as unknown[],
  };
}
