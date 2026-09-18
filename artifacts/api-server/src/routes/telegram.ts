import { and, eq, gte, lt, ne } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  notificationSettingsTable,
  remindersTable,
  rescheduleProposalsTable,
  rescheduleSettingsTable,
  tasksTable,
} from "@workspace/db";
import { dayBounds } from "../lib/date";
import { canAcceptProposal } from "../lib/reschedule";
import {
  parseTelegramCommand,
  sendTelegramMessage,
  TELEGRAM_HELP,
} from "../lib/telegram";

/**
 * Telegram inbound webhook (service context, like the dispatcher).
 * Telegram posts updates here; authenticity comes from the
 * X-Telegram-Bot-Api-Secret-Token header compared against
 * TELEGRAM_WEBHOOK_SECRET (fail-closed when unset).
 *
 * Identity: the sender's chat id must match a linked
 * notification_settings.telegram_chat_id. Unknown chats get setup help,
 * never data. Always answers 200 after best-effort handling — Telegram
 * retries anything else, which would double-apply commands.
 */

const router: IRouter = Router();

interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id?: number | string };
  };
}

router.post("/telegram/webhook", async (req, res): Promise<void> => {
  if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
    res.status(503).json({ error: "Telegram webhook not configured." });
    return;
  }
  if (req.header("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const update = req.body as TelegramUpdate;
  const text = update?.message?.text;
  const chatIdRaw = update?.message?.chat?.id;
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const reply = async (chatId: string, replyText: string): Promise<void> => {
    if (token) await sendTelegramMessage(token, chatId, replyText);
  };

  if (!text || chatIdRaw === undefined) {
    res.json({ ok: true, ignored: true });
    return;
  }
  const chatId = String(chatIdRaw);

  const [link] = await db
    .select({ userId: notificationSettingsTable.userId })
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.telegramChatId, chatId));
  if (!link) {
    await reply(
      chatId,
      "This chat is not linked to a Cadence account yet. Save this chat id in notification settings first:\n" +
        chatId,
    );
    res.json({ ok: true, linked: false });
    return;
  }
  const userId = link.userId;

  const command = parseTelegramCommand(text);
  if (!command) {
    await reply(chatId, TELEGRAM_HELP);
    res.json({ ok: true });
    return;
  }

  if (command.action === "done") {
    const [task] = await db
      .update(tasksTable)
      .set({ status: "completed", updatedAt: new Date() })
      .where(
        and(
          eq(tasksTable.id, command.taskId),
          eq(tasksTable.userId, userId),
          ne(tasksTable.status, "completed"),
        ),
      )
      .returning({ title: tasksTable.title });
    await reply(chatId, task ? `Done: ${task.title}` : `No open task #${command.taskId}.`);
    res.json({ ok: true });
    return;
  }

  if (command.action === "snooze") {
    const [task] = await db
      .select({ id: tasksTable.id })
      .from(tasksTable)
      .where(
        and(eq(tasksTable.id, command.taskId), eq(tasksTable.userId, userId)),
      );
    if (!task) {
      await reply(chatId, `No task #${command.taskId}.`);
      res.json({ ok: true });
      return;
    }
    const at = new Date(Date.now() + command.minutes * 60_000);
    await db.insert(remindersTable).values({
      userId,
      taskId: task.id,
      remindAt: at,
      channel: "telegram",
    });
    await reply(
      chatId,
      `Snoozed #${task.id} until ${at.toISOString().replace("T", " ").slice(0, 16)} UTC.`,
    );
    res.json({ ok: true });
    return;
  }

  if (command.action === "acceptProposal" || command.action === "declineProposal") {
    const [proposal] = await db
      .select()
      .from(rescheduleProposalsTable)
      .where(
        and(
          eq(rescheduleProposalsTable.id, command.proposalId),
          eq(rescheduleProposalsTable.userId, userId),
          eq(rescheduleProposalsTable.status, "pending"),
        ),
      );
    if (!proposal) {
      await reply(chatId, `No pending proposal #${command.proposalId}.`);
      res.json({ ok: true });
      return;
    }
    if (command.action === "declineProposal") {
      await db
        .update(rescheduleProposalsTable)
        .set({ status: "declined", updatedAt: new Date() })
        .where(eq(rescheduleProposalsTable.id, proposal.id));
      await reply(chatId, `Declined proposal #${proposal.id}. The task stays as-is.`);
      res.json({ ok: true });
      return;
    }
    const [task] = await db
      .select({
        id: tasksTable.id,
        title: tasksTable.title,
        status: tasksTable.status,
        rescheduleCount: tasksTable.rescheduleCount,
      })
      .from(tasksTable)
      .where(
        and(eq(tasksTable.id, proposal.taskId), eq(tasksTable.userId, userId)),
      );
    const [settings] = await db
      .select({ maxMoves: rescheduleSettingsTable.maxMoves })
      .from(rescheduleSettingsTable)
      .where(eq(rescheduleSettingsTable.userId, userId));
    const verdict = canAcceptProposal(task ?? null, settings?.maxMoves ?? 3);
    if (!task) {
      await db
        .update(rescheduleProposalsTable)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(rescheduleProposalsTable.id, proposal.id));
      await reply(chatId, `Proposal #${proposal.id} expired: task not found.`);
      res.json({ ok: true });
      return;
    }
    if (!verdict.ok) {
      await db
        .update(rescheduleProposalsTable)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(rescheduleProposalsTable.id, proposal.id));
      await db
        .update(tasksTable)
        .set({ needsAttention: true, updatedAt: new Date() })
        .where(eq(tasksTable.id, task.id));
      await reply(chatId, `Proposal #${proposal.id} expired: ${verdict.error}`);
      res.json({ ok: true });
      return;
    }
    await db
      .update(tasksTable)
      .set({
        dueAt: proposal.toDue,
        rescheduleCount: task.rescheduleCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(tasksTable.id, task.id));
    await db
      .update(rescheduleProposalsTable)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(rescheduleProposalsTable.id, proposal.id));
    await reply(
      chatId,
      `Accepted: "${task.title}" moved to ${proposal.toDue.toISOString().replace("T", " ").slice(0, 16)} UTC.`,
    );
    res.json({ ok: true });
    return;
  }

  // list: today's non-completed tasks in the user's timezone.
  const [settings] = await db
    .select({ timeZone: notificationSettingsTable.timeZone })
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.userId, userId));
  const { start, end } = dayBounds(undefined, settings?.timeZone ?? "UTC");
  const due = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      dueAt: tasksTable.dueAt,
    })
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.userId, userId),
        ne(tasksTable.status, "completed"),
        gte(tasksTable.dueAt, start),
        lt(tasksTable.dueAt, end),
      ),
    );
  if (due.length === 0) {
    await reply(chatId, "Nothing due today.");
  } else {
    await reply(
      chatId,
      due
        .map((task) => {
          const when = task.dueAt
            ? task.dueAt.toISOString().slice(11, 16)
            : "--:--";
          return `#${task.id} ${task.title} (${when})`;
        })
        .join("\n"),
    );
  }
  res.json({ ok: true });
});

export default router;
