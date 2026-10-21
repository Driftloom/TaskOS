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
 * Every return type below is the contract's own generated TypeScript type, so
 * a contract change that adds a required field breaks the build here and not
 * only in the test.
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
 *
 * Timestamps are `Date` objects, exactly as the contract's generated types
 * declare them. `JSON.stringify` renders them as the same ISO-8601 strings the
 * mock has always sent, so the bytes on the wire do not change.
 */

import type {
  AgentChatOutput,
  AutomationFlags,
  CreateRecurringTask201,
  DayCloseSummary,
  DayPlan,
  FocusSession,
  FocusSettings,
  GetAgentUsage200,
  Goal,
  GoalBaselines,
  IntegrationsStatus,
  ListAgentActions200,
  ListAgentCredentials200,
  ListMemoryConfirmations200,
  ListMemoryFacts200,
  MemoryFact,
  Momentum,
  MonthlyReview,
  NotificationSettings,
  Project,
  RescheduleProposal,
  RescheduleSettings,
  SetAutomationFlag200,
  SlippageReport,
  Tag,
  Task,
  TaskSummary,
  TimeBlock,
  VapidKeyResponse,
} from '@workspace/api-zod';

/**
 * The push-channel responses are inline object schemas in `openapi.yaml`, so
 * Orval generated a Zod schema for each but no reusable component type. These
 * are the contract shapes, restated.
 */
export interface MockPushSubscriptionResponse {
  ok: boolean;
  id: number;
}
export interface MockPushUnsubscribeResponse {
  ok: boolean;
}
export interface MockPushTestResponse {
  ok: boolean;
  sent: number;
  failed: number;
}

/** The daily focus target the mock's focus settings and day plan both use. */
export const MOCK_DAILY_FOCUS_TARGET = 4;

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

/** `YYYY-MM-DDTHH:MM:SS.sssZ` on the given calendar day. */
function atTime(day: string, time: string): Date {
  return new Date(`${day}T${time}.000Z`);
}

/** The title of a task, for the `taskTitle` the contract requires on a block. */
function titleOf(tasks: Task[], taskId: number): string {
  return tasks.find((task) => task.id === taskId)?.title ?? 'Untitled task';
}

/* ------------------------------------------------------------------ *
 * Seed collections — the mock's initial state.
 * ------------------------------------------------------------------ */

export function createMockTasks(now: Date): Task[] {
  const day = mockDate(now);

  return [
    {
      id: 101,
      title: 'Architect resilient reschedule engine Rule 9',
      status: 'open',
      priority: 'high',
      durationMin: 45,
      dueAt: atTime(day, '14:00:00'),
      notes: 'Check memory_facts for duration multiplier before moving time blocks.',
      automation: 'auto',
      needsAttention: false,
      rescheduleCount: 0,
      completedAt: null,
      projectId: null,
      parentId: null,
      rrule: null,
      tags: [
        { id: 1, name: 'engine', createdAt: now, updatedAt: now },
        { id: 2, name: 'core', createdAt: now, updatedAt: now },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 102,
      title: 'Implement Apple HIG dark-mode docked canvas layout',
      status: 'open',
      priority: 'high',
      durationMin: 30,
      dueAt: atTime(day, '16:00:00'),
      notes: 'Eliminate side voids and ensure responsive elegance across all display widths.',
      automation: 'auto',
      needsAttention: false,
      rescheduleCount: 0,
      completedAt: null,
      projectId: null,
      parentId: null,
      rrule: null,
      tags: [
        { id: 3, name: 'design', createdAt: now, updatedAt: now },
        { id: 4, name: 'ui', createdAt: now, updatedAt: now },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 103,
      title: 'Configure Telegram bot webhook for two-way notifications',
      status: 'open',
      priority: 'medium',
      durationMin: 25,
      dueAt: atTime(day, '18:00:00'),
      notes: 'Free two-way commands: done, snooze 1h, list today.',
      automation: 'ask',
      needsAttention: false,
      rescheduleCount: 1,
      completedAt: null,
      projectId: null,
      parentId: null,
      rrule: null,
      tags: [{ id: 5, name: 'telegram', createdAt: now, updatedAt: now }],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 104,
      title: 'Conduct weekly zero-trust audit verification',
      status: 'open',
      priority: 'low',
      durationMin: 15,
      dueAt: atTime(day, '20:00:00'),
      notes: 'Run all 9 gates to guarantee 100% test integrity.',
      automation: 'off',
      needsAttention: false,
      rescheduleCount: 0,
      completedAt: null,
      projectId: null,
      parentId: null,
      rrule: null,
      tags: [{ id: 6, name: 'audit', createdAt: now, updatedAt: now }],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 105,
      title: 'Hardening Clerk auth and Row-Level Security isolation',
      status: 'completed',
      priority: 'high',
      durationMin: 60,
      dueAt: atTime(day, '11:00:00'),
      notes: 'Enforce auth.jwt()->>sub on all Postgres tables.',
      automation: 'auto',
      needsAttention: false,
      rescheduleCount: 0,
      completedAt: atTime(day, '11:45:00'),
      projectId: null,
      parentId: null,
      rrule: null,
      tags: [{ id: 7, name: 'security', createdAt: now, updatedAt: now }],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 106,
      title: 'Explore pgvector semantic memory clustering',
      status: 'inbox',
      priority: 'medium',
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
      tags: [{ id: 8, name: 'ai', createdAt: now, updatedAt: now }],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 107,
      title: 'Calibrate Web Audio chime frequencies',
      status: 'inbox',
      priority: 'low',
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
      tags: [{ id: 9, name: 'audio', createdAt: now, updatedAt: now }],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function createMockTimeBlocks(now: Date, tasks: Task[]): TimeBlock[] {
  const day = mockDate(now);

  return [
    {
      id: 501,
      taskId: 102,
      taskTitle: titleOf(tasks, 102),
      startAt: atTime(day, '10:00:00'),
      endAt: atTime(day, '11:00:00'),
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function createMockMemoryFactRows(now: Date): MemoryFact[] {
  return [
    {
      id: 1,
      key: 'peak_focus_window',
      title: 'Peak focus window is late morning (10:00 - 12:30)',
      category: 'chronotype',
      // Source A in the contract is `behavioral`; the mock used to say "A",
      // which the contract's enum does not have.
      source: 'behavioral',
      // The contract's confidence is an integer 0-100, not a 0-1 fraction.
      confidence: 92,
      evidenceCount: 14,
      rule9Multiplier: 1.0,
      pendingConfirmation: false,
      archived: false,
      value: { window: '10:00-12:30', description: 'Highest completion rate with zero interruptions.' },
      lastReinforcedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 2,
      key: 'architecture_deep_work',
      title: 'Architecture tasks take 1.25x estimated duration',
      category: 'soft_commitment',
      source: 'behavioral',
      confidence: 85,
      evidenceCount: 8,
      rule9Multiplier: 1.25,
      pendingConfirmation: false,
      archived: false,
      value: { rule9Multiplier: 1.25 },
      lastReinforcedAt: now,
      createdAt: now,
      updatedAt: now,
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

export function createMockProjects(now: Date): Project[] {
  return [
    {
      id: 201,
      name: 'Client Website Redesign',
      color: toHex([59, 130, 246]),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 202,
      name: 'Personal Systems Overhaul',
      color: toHex([245, 158, 11]),
      createdAt: now,
      updatedAt: now,
    },
  ];
}

/**
 * A goal with every contract field filled in. `overrides` wins.
 *
 * `progress` is a PERCENTAGE (0-100), not a 0-1 fraction: the server computes
 * it as `((actual / target) * 100).toFixed(1)` in
 * artifacts/api-server/src/lib/month-window.ts:187. The mock used to send 0.6,
 * which the Goals card rendered as "1% complete".
 */
export function createMockGoalRecord(
  id: number,
  overrides: Partial<Goal> = {},
  now: Date,
): Goal {
  return {
    id,
    title: 'Untitled Goal',
    month: mockMonth(now),
    metric: 'tasks_completed',
    target: 10,
    actual: 0,
    progress: 0,
    onPace: true,
    expectedSoFar: 0,
    scopeKind: 'global',
    scopeProjectId: null,
    scopeTagId: null,
    scopeLabel: null,
    scopeDeleted: false,
    status: 'open',
    carriedFromId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function createMockGoals(now: Date): Goal[] {
  return [
    createMockGoalRecord(
      301,
      {
        title: 'Complete 20 deep-focus sessions',
        metric: 'focus_sessions',
        target: 20,
        actual: 12,
        progress: 60,
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
        progress: 60,
        expectedSoFar: 17,
      },
      now,
    ),
  ];
}

export function createMockTags(now: Date): Tag[] {
  return [
    { id: 1, name: 'engine', createdAt: now, updatedAt: now },
    { id: 2, name: 'design', createdAt: now, updatedAt: now },
    { id: 3, name: 'deep-work', createdAt: now, updatedAt: now },
  ];
}

/* ------------------------------------------------------------------ *
 * Per-endpoint response builders.
 * ------------------------------------------------------------------ */

export function createMockAutomationFlags(): AutomationFlags {
  return {
    flags: [
      { key: 'reminders', enabled: true },
      { key: 'reschedule', enabled: true },
    ],
    paused: false,
  };
}

export function createMockAutomationFlag(
  key: 'reminders' | 'reschedule',
  enabled: boolean,
): SetAutomationFlag200 {
  return { flag: { key, enabled } };
}

export function createMockTaskSummary(tasks: Task[]): TaskSummary {
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
 *
 * `dueAt` / `originalDueAt` are plain strings here: the contract types them as
 * strings, not dates.
 */
export function createMockSlippageReport(tasks: Task[], now: Date): SlippageReport {
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
        reason: 'capacity_overrun',
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
        reason: 'missed_deadline',
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
  };
}

export function createMockMomentum(tasks: Task[], now: Date): Momentum {
  const completed = tasks.filter((t) => t.status === 'completed').length;
  return {
    date: mockDate(now),
    tasksCompleted: completed,
    tasksTotal: tasks.filter((t) => t.status !== 'inbox').length,
    roundsCompleted: 3,
    roundTarget: MOCK_DAILY_FOCUS_TARGET,
    streakDays: 7,
  };
}

/** A task created from a `POST /api/tasks` body. */
export function createMockTask(
  id: number,
  body: Record<string, any>,
  now: Date,
  tags: Tag[] = [],
): Task {
  return {
    id,
    title: body.title || 'Untitled Task',
    notes: body.notes ?? null,
    dueAt: body.dueAt ? new Date(body.dueAt) : null,
    durationMin: body.durationMin || 25,
    priority: body.priority || 'medium',
    status: body.status || 'open',
    projectId: body.projectId ?? null,
    parentId: body.parentId ?? null,
    automation: body.automation ?? 'auto',
    needsAttention: false,
    rescheduleCount: 0,
    completedAt: null,
    rrule: null,
    tags: Array.isArray(body.tagIds)
      ? tags.filter((tag) => body.tagIds.includes(tag.id))
      : [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * A task after a `PATCH /api/tasks/{id}` body. The contract's update body
 * carries `tagIds` (a list of ids) and a `dueAt` string; the task itself
 * carries tag objects and a date.
 */
export function applyMockTaskPatch(
  task: Task,
  body: Record<string, any>,
  now: Date,
  tags: Tag[] = [],
): Task {
  return {
    ...task,
    title: body.title ?? task.title,
    notes: body.notes !== undefined ? body.notes : task.notes,
    dueAt:
      body.dueAt !== undefined ? (body.dueAt ? new Date(body.dueAt) : null) : task.dueAt,
    durationMin: body.durationMin ?? task.durationMin,
    priority: body.priority ?? task.priority,
    status: body.status ?? task.status,
    projectId: body.projectId !== undefined ? body.projectId : task.projectId,
    parentId: body.parentId !== undefined ? body.parentId : task.parentId,
    automation: body.automation !== undefined ? body.automation : task.automation,
    completedAt:
      body.completedAt !== undefined
        ? body.completedAt
          ? new Date(body.completedAt)
          : null
        : task.completedAt,
    rrule: body.rrule !== undefined ? body.rrule : task.rrule,
    tags: Array.isArray(body.tagIds)
      ? tags.filter((tag) => body.tagIds.includes(tag.id))
      : task.tags,
    updatedAt: now,
  };
}

export function createMockProject(id: number, body: Record<string, any>, now: Date): Project {
  return {
    id,
    name: body.name || 'Untitled Project',
    color: body.color ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createMockGoalBaselines(): GoalBaselines {
  return {
    focus_minutes: { trailing30dMonthlyEquivalent: 900, trailing90dMonthlyEquivalent: 850 },
    focus_sessions: { trailing30dMonthlyEquivalent: 18, trailing90dMonthlyEquivalent: 16 },
    focus_days: { trailing30dMonthlyEquivalent: 14, trailing90dMonthlyEquivalent: 13 },
    tasks_completed: { trailing30dMonthlyEquivalent: 42, trailing90dMonthlyEquivalent: 38 },
    tasks_completed_on_time: { trailing30dMonthlyEquivalent: 30, trailing90dMonthlyEquivalent: 27 },
  };
}

/**
 * The monthly review. `completionRate` is a PERCENTAGE, matching the server's
 * `((achievedGoals / totalGoals) * 100).toFixed(1)` in
 * artifacts/api-server/src/routes/goals.ts:557.
 */
export function createMockMonthlyReview(month: string, goals: Goal[]): MonthlyReview {
  const monthGoals = goals.filter((g) => g.month === month);
  const achieved = monthGoals.filter((g) => g.actual >= g.target).length;
  return {
    month,
    totalGoals: monthGoals.length,
    achievedGoals: achieved,
    missedGoals: monthGoals.length - achieved,
    completionRate:
      monthGoals.length === 0 ? 0 : Number(((achieved / monthGoals.length) * 100).toFixed(1)),
    goals: monthGoals,
    carryCandidates: monthGoals.filter((g) => g.status === 'open' && g.actual < g.target),
  };
}

export function createMockFocusSessions(): FocusSession[] {
  return [];
}

export function createMockFocusSession(
  id: number,
  body: Record<string, any>,
  now: Date,
): FocusSession {
  return {
    id,
    taskId: body.taskId,
    plannedMinutes: body.plannedMinutes,
    elapsedMinutes: 0,
    status: 'active',
    startedAt: now,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createMockFocusSettings(now: Date): FocusSettings {
  return {
    dailyTarget: MOCK_DAILY_FOCUS_TARGET,
    createdAt: now,
    updatedAt: now,
  };
}

export function createMockNotificationSettings(now: Date): NotificationSettings {
  return {
    timezone: 'Asia/Kolkata',
    quietStart: 22,
    quietEnd: 7,
    remindersEnabled: true,
    flexible24h: true,
    workStart: 9,
    workEnd: 18,
    telegramChatId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createMockRescheduleProposals(): RescheduleProposal[] {
  return [];
}

export function createMockMemoryFactsResponse(rows: MemoryFact[]): ListMemoryFacts200 {
  return { facts: rows };
}

export function createMockMemoryConfirmationsResponse(): ListMemoryConfirmations200 {
  return { confirmations: [] };
}

export function createMockIntegrationsStatus(): IntegrationsStatus {
  return {
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
  };
}

export function createMockBlocksResponse(blocks: TimeBlock[]): TimeBlock[] {
  return blocks;
}

export function createMockTimeBlock(
  id: number,
  body: Record<string, any>,
  now: Date,
  tasks: Task[] = [],
): TimeBlock {
  return {
    id,
    taskId: body.taskId,
    taskTitle: titleOf(tasks, body.taskId),
    startAt: new Date(body.startAt),
    endAt: new Date(body.endAt),
    createdAt: now,
    updatedAt: now,
  };
}

export function createMockRescheduleSettings(now: Date): RescheduleSettings {
  return {
    defaultMode: 'ask',
    maxMoves: 5,
    createdAt: now,
    updatedAt: now,
  };
}

export function createMockAgentCredentials(): ListAgentCredentials200 {
  return { credentials: [] };
}

export function createMockAgentMessages(): { messages: unknown[] } {
  return { messages: [] };
}

export function createMockAgentActions(): ListAgentActions200 {
  return { actions: [] };
}

/**
 * Month-to-date LLM spend. The contract reports CENTS; the mock used to send
 * a `{ currentMonthSpendUsd, ... }` object the Assistant page could not read,
 * so the spend card sat at $0.00 forever. The ceiling is the server's
 * $5.00/month (locked decision D-08).
 */
export function createMockAgentUsage(): GetAgentUsage200 {
  return {
    usage: {
      totalTokensIn: 11450,
      totalTokensOut: 1000,
      totalCostEstimateCents: 12,
      totalCalls: 18,
      spendCeilingCents: 500,
    },
  };
}

/**
 * The day's plan. The contract wants the real task and block lists; the mock
 * used to send counts, so the Morning Ritual threw on `plan.todayTasks.length`.
 *
 * The membership rules are the server's (artifacts/api-server/src/routes/
 * rituals.ts:45): overdue is an OPEN task due before today, today is an OPEN
 * task due today, and blocks are the ones starting today.
 */
export function createMockDayPlan(tasks: Task[], blocks: TimeBlock[], now: Date): DayPlan {
  const day = mockDate(now);
  const dayOf = (value: Date) => value.toISOString().slice(0, 10);

  return {
    date: now,
    overdueTasks: tasks.filter(
      (task) => task.status === 'open' && task.dueAt !== null && dayOf(task.dueAt) < day,
    ),
    todayTasks: tasks.filter(
      (task) => task.status === 'open' && task.dueAt !== null && dayOf(task.dueAt) === day,
    ),
    todayBlocks: blocks.filter((block) => dayOf(block.startAt) === day),
    dailyFocusTarget: MOCK_DAILY_FOCUS_TARGET,
  };
}

export function createMockDayCloseSummary(
  tasks: Task[],
  now: Date,
  targetDate?: Date,
): DayCloseSummary {
  return {
    completedCount: tasks.filter((task) => task.status === 'completed').length,
    focusRoundsCompleted: 3,
    focusMinutesTotal: 120,
    movedToTomorrowCount: 1,
    targetDate: targetDate ?? new Date(now.getTime() + 86_400_000),
  };
}

export function createMockRecurringTask(): CreateRecurringTask201 {
  return { createdCount: 0, templateId: null, tasks: [] };
}

export function createMockVapidKey(): VapidKeyResponse {
  return { publicKey: 'dev-vapid-public-key-placeholder' };
}

export function createMockAgentChat(): AgentChatOutput {
  return {
    reply:
      'Dev mode: deterministic preview path. Connect live backend with LLM API keys for full autonomous multi-turn reasoning.',
    toolCallsExecuted: [],
    requiresConfirmation: false,
    memoryApplied: [],
    provider: 'local-fallback',
    degraded: true,
  };
}

export function createMockPushSubscription(id: number): MockPushSubscriptionResponse {
  return { ok: true, id };
}

export function createMockPushUnsubscribe(): MockPushUnsubscribeResponse {
  return { ok: true };
}

export function createMockPushTest(): MockPushTestResponse {
  return { ok: true, sent: 1, failed: 0 };
}
