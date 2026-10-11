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
import { canAcceptProposal, DEFAULT_MAX_MOVES } from "../lib/reschedule";
import { getTelegramBotTokenForChat } from "../lib/telegram-credentials";
import {
  answerTelegramCallbackQuery,
  parseTelegramCommand,
  sendTelegramMessage,
  TELEGRAM_HELP,
  type SendTelegramOptions,
  type TelegramInlineButton,
  type TelegramReplyMarkup,
} from "../lib/telegram";
import { executeAgentTool } from "../lib/agent/tools";
import { confirmPairing } from "../lib/telegram-pairing";
import { secretMatches } from "../lib/secret";
import { logger } from "../lib/logger";

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
    message_id?: number;
    text?: string;
    chat?: { id?: number | string; username?: string };
  };
  callback_query?: {
    id: string;
    from: { id: number | string; username?: string };
    message?: {
      message_id?: number;
      chat?: { id?: number | string };
    };
    data?: string;
  };
}

router.post("/telegram/webhook", async (req, res): Promise<void> => {
  try {
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.DISPATCH_SECRET;
    if (!webhookSecret) {
      res.status(503).json({ error: "Telegram webhook not configured." });
      return;
    }
    if (
      !secretMatches(
        req.header("x-telegram-bot-api-secret-token"),
        webhookSecret,
      )
    ) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

  const update = req.body as TelegramUpdate;
  const callbackQuery = update?.callback_query;
  const isCallback = Boolean(callbackQuery);
  const text = isCallback ? callbackQuery?.data : update?.message?.text;
  const chatIdRaw = isCallback
    ? (callbackQuery?.message?.chat?.id ?? callbackQuery?.from?.id)
    : update?.message?.chat?.id;

  // Resolved per-chat, not from process.env: an inbound update carries a
  // Telegram chat id but no Cadence user id until paired, and caching a
  // per-user token in the shared process env made the last connecting account
  // the bot owner for everyone.
  const token = chatIdRaw !== undefined
    ? await getTelegramBotTokenForChat(String(chatIdRaw))
    : "";

  if (isCallback && callbackQuery?.id && token) {
    await answerTelegramCallbackQuery(token, callbackQuery.id).catch(() => {});
  }

  const defaultReplyKeyboard: TelegramReplyMarkup = {
    keyboard: [
      [{ text: "📋 Today's Tasks" }, { text: "❓ Help" }],
      [{ text: "↩️ Undo Last Action" }],
    ],
    resize_keyboard: true,
  };

  const reply = async (
    targetChatId: string,
    replyText: string,
    options?: SendTelegramOptions,
  ): Promise<void> => {
    if (token) await sendTelegramMessage(token, targetChatId, replyText, options);
  };

  if (!text || chatIdRaw === undefined) {
    res.json({ ok: true, ignored: true });
    return;
  }
  const chatId = String(chatIdRaw);

  // QR Code Instant Pairing Intercept (Hermes Flow)
  const pairMatch = /^\/start\s+(pair_[a-zA-Z0-9_-]+)/i.exec(text.trim());
  if (pairMatch) {
    const pairToken = pairMatch[1];
    const pairing = confirmPairing(pairToken, chatId, update.message?.chat?.username);
    if (pairing.success && pairing.userId) {
      await db
        .update(notificationSettingsTable)
        .set({ telegramChatId: chatId, updatedAt: new Date() })
        .where(eq(notificationSettingsTable.userId, pairing.userId));

      await reply(
        chatId,
        `🎉 <b>Successfully paired with Cadence!</b>\n\nYour Telegram account has been linked via QR code (Chat ID: <code>${chatId}</code>).\n\nYou will now receive task reminders, focus alerts, and interactive controls here.\n\nTap <b>Today's Tasks</b> below to get started!`,
        { parse_mode: "HTML", reply_markup: defaultReplyKeyboard },
      );
      res.json({ ok: true, paired: true });
      return;
    }
  }

  const [link] = await db
    .select({ userId: notificationSettingsTable.userId })
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.telegramChatId, chatId));
  if (!link) {
    await reply(
      chatId,
      `⚠️ <b>Unlinked Chat</b>\n\nThis Telegram chat is not connected to a Cadence account yet.\nSave this chat ID in your Cadence Notification Settings:\n<code>${chatId}</code>`,
      { parse_mode: "HTML" },
    );
    res.json({ ok: true, linked: false });
    return;
  }
  const userId = link.userId;

  const command = parseTelegramCommand(text);
  if (!command) {
    await reply(chatId, TELEGRAM_HELP, {
      parse_mode: "HTML",
      reply_markup: defaultReplyKeyboard,
    });
    res.json({ ok: true });
    return;
  }

  if (command.action === "done") {
    const now = new Date();
    const [task] = await db
      .update(tasksTable)
      .set({ status: "completed", completedAt: now, updatedAt: now })
      .where(
        and(
          eq(tasksTable.id, command.taskId),
          eq(tasksTable.userId, userId),
          ne(tasksTable.status, "completed"),
        ),
      )
      .returning({ title: tasksTable.title });
    await reply(
      chatId,
      task
        ? `✅ <b>Completed!</b>\n\n<i>"${task.title}"</i> (#${command.taskId}) is marked complete in Cadence.`
        : `⚠️ <b>No open task found</b> with ID #${command.taskId}.`,
      { parse_mode: "HTML", reply_markup: defaultReplyKeyboard },
    );
    res.json({ ok: true });
    return;
  }

  if (command.action === "snooze") {
    const [task] = await db
      .select({ id: tasksTable.id, title: tasksTable.title })
      .from(tasksTable)
      .where(
        and(eq(tasksTable.id, command.taskId), eq(tasksTable.userId, userId)),
      );
    if (!task) {
      await reply(chatId, `⚠️ No open task found with ID #${command.taskId}.`, {
        parse_mode: "HTML",
        reply_markup: defaultReplyKeyboard,
      });
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
    const timeFormatted = at.toISOString().replace("T", " ").slice(0, 16) + " UTC";
    await reply(
      chatId,
      `⏰ <b>Snoozed!</b>\n\nTask <i>"${task.title}"</i> (#${task.id}) snoozed for ${command.minutes}m.\nNew reminder: <b>${timeFormatted}</b>`,
      { parse_mode: "HTML", reply_markup: defaultReplyKeyboard },
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
    const verdict = canAcceptProposal(task ?? null, settings?.maxMoves ?? DEFAULT_MAX_MOVES);
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

  if (command.action === "undo") {
    const undoResult = await executeAgentTool("undo_last_action", {}, { userId });
    if (undoResult.success) {
      await reply(
        chatId,
        `↩️ <b>Action Undone!</b>\n\n${undoResult.data?.message ?? "Your last change has been reverted."}`,
        { parse_mode: "HTML", reply_markup: defaultReplyKeyboard },
      );
    } else {
      await reply(
        chatId,
        `⚠️ <b>Cannot undo:</b> ${undoResult.error ?? "No previous action found to revert."}`,
        { parse_mode: "HTML", reply_markup: defaultReplyKeyboard },
      );
    }
    res.json({ ok: true });
    return;
  }

  if (command.action === "help") {
    await reply(chatId, TELEGRAM_HELP, {
      parse_mode: "HTML",
      reply_markup: defaultReplyKeyboard,
    });
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
    await reply(
      chatId,
      "🎉 <b>All caught up!</b>\n\nYou have no pending tasks scheduled for today in Cadence.",
      { parse_mode: "HTML", reply_markup: defaultReplyKeyboard },
    );
  } else {
    const lines = [
      `📋 <b>Today's Tasks (${due.length} active):</b>\n`,
    ];
    const inlineButtons: TelegramInlineButton[][] = [];
    for (const task of due) {
      const when = task.dueAt ? task.dueAt.toISOString().slice(11, 16) : "--:--";
      lines.push(`• <b>#${task.id} ${task.title}</b> (${when} UTC)`);
      inlineButtons.push([
        { text: `✅ Complete #${task.id}`, callback_data: `done:${task.id}` },
        { text: `⏰ Snooze 1h`, callback_data: `snooze:${task.id}:60` },
      ]);
    }
    lines.push("\n<i>Tap any button below to complete or snooze instantly!</i>");
    await reply(chatId, lines.join("\n"), {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: inlineButtons,
      },
    });
  }
  res.json({ ok: true });
} catch (err) {
  logger.error({ err }, "Telegram webhook handler encountered an error");
  res.status(200).json({ ok: false, error: String(err) });
}
});

export default router;
