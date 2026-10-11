/**
 * Telegram two-way surface (pure parsing/formatting, fully unit-tested).
 * Sending lives in the dispatcher (needs the bot token); this module never
 * touches the network except sendTelegramMessage with an explicit token.
 *
 * Commands ("/" prefix and case ignored):
 *   done <id>            — complete the task
 *   snooze <id> [N unit] — remind again in N minutes/hours (default 1h)
 *   list | today         — today's tasks
 *   accept <proposal>    — accept a reschedule proposal (moves the task)
 *   decline <proposal>   — decline a reschedule proposal
 *   start | help         — usage
 */
export type TelegramCommand =
  | { action: "done"; taskId: number }
  | { action: "snooze"; taskId: number; minutes: number }
  | { action: "list" }
  | { action: "acceptProposal"; proposalId: number }
  | { action: "declineProposal"; proposalId: number }
  | { action: "undo" }
  | { action: "help" };

export interface TelegramInlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramReplyMarkup {
  inline_keyboard?: TelegramInlineButton[][];
  keyboard?: Array<Array<{ text: string }>>;
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
}

export interface SendTelegramOptions {
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  reply_markup?: TelegramReplyMarkup;
}

export function parseTelegramCommand(text: string): TelegramCommand | null {
  const input = text.trim().replace(/^\/+/, "").toLowerCase().replace(/\s+/g, " ");

  let match = /^(?:done|complete|check)[:\s]+(\d+)$/.exec(input);
  if (match) return { action: "done", taskId: Number(match[1]) };

  match = /^snooze[:\s]+(\d+)(?:[:\s]+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)?)?$/.exec(
    input,
  );
  if (match) {
    if (match[2] === undefined) {
      return { action: "snooze", taskId: Number(match[1]), minutes: 60 };
    }
    const amount = Number(match[2]);
    const unit = match[3] ?? "m";
    const minutes = /^(m|min|mins|minute|minutes)$/.test(unit)
      ? amount
      : amount * 60;
    return { action: "snooze", taskId: Number(match[1]), minutes };
  }

  if (/^(list|today|list today|📋 today's tasks|today's tasks)$/.test(input)) return { action: "list" };

  match = /^(?:accept|approve)[:\s]+(\d+)$/.exec(input);
  if (match) return { action: "acceptProposal", proposalId: Number(match[1]) };

  match = /^(?:decline|reject)[:\s]+(\d+)$/.exec(input);
  if (match) return { action: "declineProposal", proposalId: Number(match[1]) };

  if (/^(undo|revert|↩️ undo last action|undo last action)$/.test(input)) return { action: "undo" };

  if (/^(start|help|❓ help|help & commands)$/.test(input)) return { action: "help" };
  return null;
}

export const TELEGRAM_HELP =
  "✨ <b>Cadence Task OS — Command Palette</b>\n\n" +
  "You can control Cadence anytime directly from Telegram:\n\n" +
  "📋 <b>Today's Tasks:</b>\n" +
  "• Tap <b>Today's Tasks</b> or reply <code>list</code>\n\n" +
  "✅ <b>Complete a Task:</b>\n" +
  "• Reply <code>done &lt;id&gt;</code> (e.g. <code>done 45</code>)\n" +
  "• Or tap the <b>[ Done ]</b> button on any task message\n\n" +
  "⏰ <b>Snooze a Reminder:</b>\n" +
  "• Reply <code>snooze &lt;id&gt; 1h</code> (default 1h)\n" +
  "• Or specify minutes: <code>snooze &lt;id&gt; 30m</code>\n\n" +
  "🔄 <b>Reschedule Proposals:</b>\n" +
  "• Reply <code>accept &lt;id&gt;</code> or <code>decline &lt;id&gt;</code>\n\n" +
  "↩️ <b>Mistake? Undo Anytime:</b>\n" +
  "• Reply <code>undo</code> to immediately revert your last change";

export function formatReminder(
  taskId: number,
  taskTitle: string,
  dueAt: Date | null,
): string {
  const due = dueAt
    ? dueAt.toISOString().replace("T", " ").slice(0, 16) + " UTC"
    : "no due date";
  return (
    `Reminder: ${taskTitle}\nDue: ${due}\nReply: done ${taskId} · snooze ${taskId} 1h`
  );
}

export async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
  options?: SendTelegramOptions,
): Promise<{ ok: boolean; error?: string }> {
  let response: Response;
  try {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
    };
    if (options?.parse_mode) payload.parse_mode = options.parse_mode;
    if (options?.reply_markup) payload.reply_markup = options.reply_markup;

    response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return { ok: false, error: String(error).slice(0, 200) };
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return { ok: false, error: `HTTP ${response.status}: ${body.slice(0, 200)}` };
  }
  const data = (await response.json().catch(() => null)) as {
    ok?: boolean;
    description?: string;
  } | null;
  if (data?.ok) return { ok: true };
  return { ok: false, error: String(data?.description ?? "unknown").slice(0, 200) };
}

export async function answerTelegramCallbackQuery(
  token: string,
  callbackQueryId: string,
  text?: string,
): Promise<{ ok: boolean }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
      }),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
}

export interface TelegramWebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
}

export async function getTelegramBotInfo(
  token: string,
): Promise<{ ok: boolean; bot?: TelegramBotInfo; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: TelegramBotInfo;
      description?: string;
    };
    if (data.ok && data.result) {
      return { ok: true, bot: data.result };
    }
    return { ok: false, error: data.description ?? "Failed to fetch bot info" };
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 200) };
  }
}

export async function getTelegramWebhookInfo(
  token: string,
): Promise<{ ok: boolean; info?: TelegramWebhookInfo; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: TelegramWebhookInfo;
      description?: string;
    };
    if (data.ok && data.result) {
      return { ok: true, info: data.result };
    }
    return { ok: false, error: data.description ?? "Failed to fetch webhook info" };
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 200) };
  }
}

export async function setTelegramWebhook(
  token: string,
  webhookUrl: string,
  secretToken?: string,
): Promise<{ ok: boolean; description?: string; error?: string }> {
  try {
    const body: Record<string, any> = {
      url: webhookUrl,
      allowed_updates: ["message"],
    };
    if (secretToken) {
      body.secret_token = secretToken;
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
    };
    if (data.ok) {
      return { ok: true, description: data.description };
    }
    return { ok: false, error: data.description ?? "Failed to set webhook" };
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 200) };
  }
}

