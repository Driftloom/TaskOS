import { and, eq } from "drizzle-orm";
import {
  db,
  memoryFactsTable,
  notificationSettingsTable,
} from "@workspace/db";
import { logger } from "./logger";

/**
 * Resolves which Telegram bot token to use, without ever caching a per-user
 * secret into `process.env`.
 *
 * ## Why this module exists
 *
 * `POST /integrations/telegram/connect` used to do:
 *
 * ```ts
 * process.env.TELEGRAM_BOT_TOKEN = botToken;   // removed
 * ```
 *
 * so that "existing dispatch sweeps pick it up immediately". The pool is
 * process-wide, so that line made **one user's bot token global**: a second
 * account connecting silently overwrote the first, and every cron sweep then
 * dispatched through whichever user connected last. `routes/internal.ts` had
 * already fixed this exact bug on 2026-09-28 and documented the rule — this
 * call site was simply missed.
 *
 * `POST /telegram/webhook` also read the token straight from `process.env`,
 * which is why the write existed in the first place: a webhook update carries a
 * Telegram `chat_id` but no Cadence user id until the chat is paired. That path
 * now resolves through {@link getTelegramBotTokenForChat} instead.
 *
 * ## Precedence
 *
 * Database first, `process.env` second. The deployment-level env var is a
 * single-user convenience fallback; a key the user pasted in Settings is more
 * specific and must win. (`routes/internal.ts` used to check env first — that
 * ordering was inconsistent with `routes/integrations.ts`, which already read
 * DB-first. Now both paths agree.)
 */

const CONFIG_KEY = "telegram_config";

/**
 * Token stored by the authenticated user in Settings, else the env fallback.
 *
 * Scoped by `user_id` on purpose: an earlier version matched on `key` alone, so
 * any user's stored token was adopted for every other user.
 */
export async function getTelegramBotTokenForUser(userId: string): Promise<string> {
  try {
    const [fact] = await db
      .select({ value: memoryFactsTable.value })
      .from(memoryFactsTable)
      .where(
        and(
          eq(memoryFactsTable.userId, userId),
          eq(memoryFactsTable.key, CONFIG_KEY),
          eq(memoryFactsTable.archived, false),
        ),
      )
      .limit(1);

    const token = (fact?.value as Record<string, unknown> | undefined)?.botToken;
    if (typeof token === "string" && token.length > 0) return token;
  } catch (err) {
    // Logged, not swallowed: a silent catch here disabled Telegram delivery and
    // the dead-man's-switch ping with no trace.
    logger.error({ err, userId }, "telegram_config lookup failed");
  }

  return process.env.TELEGRAM_BOT_TOKEN ?? "";
}

/**
 * Token for the Telegram chat that sent an inbound update.
 *
 * The webhook has a `chat_id` before it has a user id, so the chat id is the
 * only key available. Joins `notification_settings.telegram_chat_id` back to the
 * owning user rather than trusting a process-wide token.
 */
export async function getTelegramBotTokenForChat(chatId: string): Promise<string> {
  const normalized = String(chatId).trim();
  if (normalized.length === 0) return process.env.TELEGRAM_BOT_TOKEN ?? "";

  try {
    const [settings] = await db
      .select({ userId: notificationSettingsTable.userId })
      .from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.telegramChatId, normalized))
      .limit(1);

    if (settings?.userId) return getTelegramBotTokenForUser(settings.userId);
  } catch (err) {
    logger.error({ err, chatId: normalized }, "telegram chat -> user lookup failed");
  }

  return process.env.TELEGRAM_BOT_TOKEN ?? "";
}