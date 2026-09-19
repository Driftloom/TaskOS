import { timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  automationFlagsTable,
  db,
  notificationSettingsTable,
  reminderRunsTable,
  remindersTable,
  rescheduleRunsTable,
  rescheduleProposalsTable,
  rescheduleSettingsTable,
  tasksTable,
} from "@workspace/db";
import {
  inQuietHours,
  isExpired,
  type QuietWindow,
} from "../lib/reminders";
import {
  decideReschedule,
  type AutomationMode,
} from "../lib/reschedule";
import { formatReminder, sendTelegramMessage } from "../lib/telegram";
import { computeSourceAArithmetic } from "../lib/memory";

/**
 * Service-context dispatch (NOT per-user RLS): the pool connects as owner,
 * which bypasses RLS by privilege — exactly like the owner-run migrations.
 * The gate is the shared DISPATCH_SECRET (x-dispatch-secret header), and
 * reminder_runs has no authenticated policies at all, so only this path
 * (and the owner) can write the watchdog log.
 *
 * Each tick: claim due rows atomically (FOR UPDATE SKIP LOCKED, so two
 * overlapping ticks never double-send), honor the kill switch / user
 * settings / quiet hours, send via Telegram, record everything in
 * reminder_runs (the missed-tick watchdog reads that table's recency).
 */

const BATCH_LIMIT = 100;
const MAX_ATTEMPTS = 3;

function dispatchSecretOk(provided: string | undefined): boolean {
  const expected = process.env.DISPATCH_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface ClaimedReminder {
  id: number;
  userId: string;
  taskId: number;
  remindAt: Date;
  channel: string;
  attempts: number;
}

const DEFAULT_WINDOW: QuietWindow = {
  quietStart: 22,
  quietEnd: 7,
  timeZone: "UTC",
};

const router: IRouter = Router();

router.post("/internal/dispatch", async (req, res): Promise<void> => {
  if (!process.env.DISPATCH_SECRET) {
    res.status(503).json({ error: "Dispatch not configured." });
    return;
  }
  if (!dispatchSecretOk(req.header("x-dispatch-secret"))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const now = new Date();
  const [run] = await db
    .insert(reminderRunsTable)
    .values({})
    .returning({ id: reminderRunsTable.id });

  const finish = async (summary: {
    checked: number;
    sent: number;
    failed: number;
    skipped: number;
    note: string | null;
  }) => {
    await db
      .update(reminderRunsTable)
      .set({ ...summary, finishedAt: new Date() })
      .where(eq(reminderRunsTable.id, run.id));
    res.json({ runId: run.id, ...summary });
  };

  const [flag] = await db
    .select({ enabled: automationFlagsTable.enabled })
    .from(automationFlagsTable)
    .where(eq(automationFlagsTable.key, "reminders"));
  if (!flag?.enabled) {
    await finish({
      checked: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      note: "killed by automation flag",
    });
    return;
  }

  const claimed = (
    await db.execute(sql`
      UPDATE ${remindersTable}
      SET status = 'sending',
          attempts = ${remindersTable.attempts} + 1,
          updated_at = now()
      WHERE ${remindersTable.id} IN (
        SELECT ${remindersTable.id} FROM ${remindersTable}
        WHERE ${remindersTable.status} = 'pending'
          AND ${remindersTable.remindAt} <= ${now}
        ORDER BY ${remindersTable.remindAt}
        LIMIT ${BATCH_LIMIT}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, user_id, task_id, remind_at, channel, attempts
    `)
  ).rows as unknown as Array<{
    id: number;
    user_id: string;
    task_id: number;
    remind_at: Date;
    channel: string;
    attempts: number;
  }>;

  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of claimed) {
    const reminder: ClaimedReminder = {
      id: row.id,
      userId: row.user_id,
      taskId: row.task_id,
      remindAt: new Date(row.remind_at),
      channel: row.channel,
      attempts: row.attempts,
    };
    // eslint-disable-next-line no-await-in-loop
    const outcome = await deliverOne(reminder, token, now);
    if (outcome === "sent") sent += 1;
    else if (outcome === "failed") failed += 1;
    else skipped += 1;
  }

  await finish({
    checked: claimed.length,
    sent,
    failed,
    skipped,
    note: token ? null : "no bot token configured",
  });
});

async function deliverOne(
  reminder: ClaimedReminder,
  token: string,
  now: Date,
): Promise<"sent" | "failed" | "skipped"> {
  const [task] = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      dueAt: tasksTable.dueAt,
      userId: tasksTable.userId,
    })
    .from(tasksTable)
    .where(eq(tasksTable.id, reminder.taskId));
  if (!task || task.userId !== reminder.userId) {
    await mark(reminder.id, {
      status: "failed",
      lastError: "task gone",
    });
    return "failed";
  }

  const [settings] = await db
    .select()
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.userId, reminder.userId));
  const enabled = settings?.remindersEnabled ?? true;
  const chatId = settings?.telegramChatId ?? null;
  const window: QuietWindow = {
    quietStart: settings?.quietStart ?? DEFAULT_WINDOW.quietStart,
    quietEnd: settings?.quietEnd ?? DEFAULT_WINDOW.quietEnd,
    timeZone: settings?.timeZone ?? DEFAULT_WINDOW.timeZone,
  };

  if (!enabled) {
    await mark(reminder.id, {
      status: "pending",
      lastError: "reminders disabled for user",
    });
    return "skipped";
  }
  if (isExpired(reminder.remindAt, now)) {
    await mark(reminder.id, {
      status: "canceled",
      lastError: "expired without sending",
    });
    return "skipped";
  }
  if (inQuietHours(now, window)) {
    await mark(reminder.id, {
      status: "pending",
      lastError: "deferred: quiet hours",
    });
    return "skipped";
  }
  if (!token || !chatId) {
    await mark(reminder.id, {
      status: "pending",
      lastError: "not configured: bot token or chat link missing",
    });
    return "skipped";
  }

  const sent = await sendTelegramMessage(
    token,
    chatId,
    formatReminder(task.id, task.title, task.dueAt),
  );
  if (sent.ok) {
    await mark(reminder.id, { status: "sent", sentAt: now, lastError: null });
    return "sent";
  }
  const exhausted = reminder.attempts >= MAX_ATTEMPTS;
  await mark(reminder.id, {
    status: exhausted ? "failed" : "pending",
    lastError: sent.error ?? "send failed",
  });
  return exhausted ? "failed" : "skipped";
}

async function mark(
  id: number,
  patch: {
    status: string;
    lastError?: string | null;
    sentAt?: Date;
  },
): Promise<void> {
  await db
    .update(remindersTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(remindersTable.id, id));
}

// Watchdog read for cron monitoring: same secret, JSON summary.
router.get("/internal/health", async (req, res): Promise<void> => {
  if (!process.env.DISPATCH_SECRET) {
    res.status(503).json({ error: "Dispatch not configured." });
    return;
  }
  if (!dispatchSecretOk(req.header("x-dispatch-secret"))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [lastRun] = await db
    .select({
      id: reminderRunsTable.id,
      startedAt: reminderRunsTable.startedAt,
      finishedAt: reminderRunsTable.finishedAt,
      checked: reminderRunsTable.checked,
      sent: reminderRunsTable.sent,
      failed: reminderRunsTable.failed,
      skipped: reminderRunsTable.skipped,
      note: reminderRunsTable.note,
    })
    .from(reminderRunsTable)
    .orderBy(desc(reminderRunsTable.id))
    .limit(1);
  const [pending] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(remindersTable)
    .where(and(eq(remindersTable.status, "pending"), lte(remindersTable.remindAt, new Date())));
  const [lastSweep] = await db
    .select({
      id: rescheduleRunsTable.id,
      startedAt: rescheduleRunsTable.startedAt,
      finishedAt: rescheduleRunsTable.finishedAt,
      checked: rescheduleRunsTable.checked,
      moved: rescheduleRunsTable.moved,
      flagged: rescheduleRunsTable.flagged,
      proposed: rescheduleRunsTable.proposed,
      note: rescheduleRunsTable.note,
    })
    .from(rescheduleRunsTable)
    .orderBy(desc(rescheduleRunsTable.id))
    .limit(1);
  const flags = await db
    .select({ key: automationFlagsTable.key, enabled: automationFlagsTable.enabled })
    .from(automationFlagsTable);

  res.json({
    lastRun: lastRun ?? null,
    pendingOverdue: pending?.count ?? 0,
    lastSweep: lastSweep ?? null,
    flags,
  });
});

// Reschedule sweep (service context, same gate as dispatch). Batched and
// idempotent: already-flagged tasks are skipped, ask-mode never duplicates
// proposals, moves are capped per task. Intended cadence: every 15–30 min
// plus an end-of-day run (pg_cron snippet in AUDIT).
router.post("/internal/reschedule", async (req, res): Promise<void> => {
  if (!process.env.DISPATCH_SECRET) {
    res.status(503).json({ error: "Dispatch not configured." });
    return;
  }
  if (!dispatchSecretOk(req.header("x-dispatch-secret"))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const now = new Date();
  const [run] = await db
    .insert(rescheduleRunsTable)
    .values({})
    .returning({ id: rescheduleRunsTable.id });

  const finish = async (summary: {
    checked: number;
    moved: number;
    flagged: number;
    proposed: number;
    note: string | null;
  }) => {
    await db
      .update(rescheduleRunsTable)
      .set({ ...summary, finishedAt: new Date() })
      .where(eq(rescheduleRunsTable.id, run.id));
    res.json({ runId: run.id, ...summary });
  };

  const [flag] = await db
    .select({ enabled: automationFlagsTable.enabled })
    .from(automationFlagsTable)
    .where(eq(automationFlagsTable.key, "reschedule"));
  if (!flag?.enabled) {
    await finish({ checked: 0, moved: 0, flagged: 0, proposed: 0, note: "killed by automation flag" });
    return;
  }

  const candidates = await db
    .select({
      id: tasksTable.id,
      userId: tasksTable.userId,
      title: tasksTable.title,
      status: tasksTable.status,
      dueAt: tasksTable.dueAt,
      rescheduleCount: tasksTable.rescheduleCount,
      needsAttention: tasksTable.needsAttention,
      automation: tasksTable.automation,
    })
    .from(tasksTable)
    .where(
      and(
        inArray(tasksTable.status, ["open", "inbox"]),
        lt(tasksTable.dueAt, now),
        eq(tasksTable.needsAttention, false),
      ),
    )
    .orderBy(tasksTable.dueAt)
    .limit(200);

  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  let moved = 0;
  let flagged = 0;
  let proposed = 0;

  for (const candidate of candidates) {
    const [settings] = await db
      .select({
        defaultMode: rescheduleSettingsTable.defaultMode,
        maxMoves: rescheduleSettingsTable.maxMoves,
      })
      .from(rescheduleSettingsTable)
      .where(eq(rescheduleSettingsTable.userId, candidate.userId));
    const decision = decideReschedule(
      {
        id: candidate.id,
        status: candidate.status,
        dueAt: candidate.dueAt,
        rescheduleCount: candidate.rescheduleCount,
        needsAttention: candidate.needsAttention,
        automation: candidate.automation as AutomationMode | null,
      },
      {
        defaultMode: (settings?.defaultMode ?? "ask") as AutomationMode,
        maxMoves: settings?.maxMoves ?? 5,
      },
      now,
    );

    if (decision.action === "move") {
      await db
        .update(tasksTable)
        .set({
          dueAt: decision.toDueAt,
          rescheduleCount: candidate.rescheduleCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(tasksTable.id, candidate.id));
      moved += 1;
      // Best-effort move notice: never fails the sweep.
      const [notify] = await db
        .select({ chatId: notificationSettingsTable.telegramChatId })
        .from(notificationSettingsTable)
        .where(eq(notificationSettingsTable.userId, candidate.userId));
      if (token && notify?.chatId) {
        await sendTelegramMessage(
          token,
          notify.chatId,
          `Moved to tomorrow: ${candidate.title}\nNew due: ${decision.toDueAt.toISOString().replace("T", " ").slice(0, 16)} UTC`,
        );
      }
    } else if (decision.action === "propose") {
      const [existing] = await db
        .select({ id: rescheduleProposalsTable.id })
        .from(rescheduleProposalsTable)
        .where(
          and(
            eq(rescheduleProposalsTable.taskId, candidate.id),
            eq(rescheduleProposalsTable.status, "pending"),
          ),
        );
      if (!existing && candidate.dueAt) {
        await db.insert(rescheduleProposalsTable).values({
          userId: candidate.userId,
          taskId: candidate.id,
          fromDue: candidate.dueAt,
          toDue: decision.toDueAt,
        });
        proposed += 1;
      }
    } else if (decision.action === "flag") {
      await db
        .update(tasksTable)
        .set({ needsAttention: true, updatedAt: new Date() })
        .where(eq(tasksTable.id, candidate.id));
      flagged += 1;
    }
  }

  await finish({
    checked: candidates.length,
    moved,
    flagged,
    proposed,
    note: token ? null : "no bot token configured (moves still applied)",
  });
});

/**
 * POST /internal/memory-extraction
 * Called nightly by pg_cron. Runs Source A arithmetic for every user
 * that has at least one completed task. Service-context only (DISPATCH_SECRET).
 */
router.post("/internal/memory-extraction", async (req, res): Promise<void> => {
  const secret = process.env.DISPATCH_SECRET ?? "";
  const provided = String(req.headers["x-dispatch-secret"] ?? "");
  if (
    secret.length === 0 ||
    provided.length !== secret.length ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))
  ) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Fetch all distinct user IDs with at least one completed task
  const userRows = await db
    .selectDistinct({ userId: tasksTable.userId })
    .from(tasksTable)
    .where(eq(tasksTable.status, "completed"));

  const results = [];
  for (const { userId } of userRows) {
    try {
      const result = await computeSourceAArithmetic(userId);
      results.push({ userId, ...result, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ userId, ok: false, error: msg });
    }
  }

  res.json({
    usersProcessed: userRows.length,
    results,
    runAt: new Date().toISOString(),
  });
});

export default router;
