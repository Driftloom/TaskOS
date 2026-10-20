import { and, eq, sql } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import {
  memoryFactsTable,
  notificationSettingsTable,
  webPushSubscriptionsTable,
  type MemoryFact,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { runWithRls } from "../lib/rls";
import {
  getTelegramBotInfo,
  getTelegramWebhookInfo,
  sendTelegramMessage,
  setTelegramWebhook,
} from "../lib/telegram";
import { createPairingToken, getPairingStatus } from "../lib/telegram-pairing";
import {
  GetUrlMetadataBody,
  GetUrlMetadataResponse,
  SubscribePushNotificationsBody,
  UnsubscribePushNotificationsBody,
} from "@workspace/api-zod";
import { parseUrlMetadata } from "../lib/url-metadata";
import { getVapidPublicKey, dispatchPushToUser } from "../lib/web-push";

const router: IRouter = Router();

const ConnectTelegramSchema = z.object({
  botToken: z.string().min(10, "Bot token must be at least 10 characters"),
  telegramChatId: z.string().optional().nullable(),
  webhookUrl: z.string().url().optional(),
});

/**
 * SSRF guard for the healthcheck ping. This handler makes the server issue an
 * outbound request to a caller-supplied URL, so without a host allowlist it is
 * a request-forgery primitive against anything the server can reach (cloud
 * metadata endpoints, internal services, localhost admin ports).
 */
const HEALTHCHECK_ALLOWED_HOSTS = new Set(["healthchecks.io", "hc-ping.com"]);

function healthcheckUrlError(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "Must be a valid URL";
  }
  if (parsed.protocol !== "https:") {
    return "Healthchecks.io ping URLs must use https";
  }
  if (!HEALTHCHECK_ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    return `Only ${[...HEALTHCHECK_ALLOWED_HOSTS].join(", ")} ping URLs are allowed`;
  }
  return null;
}

const HealthcheckTestSchema = z.object({
  url: z.string().url("Must be a valid URL"),
});

const HealthcheckSaveSchema = z
  .object({
    dispatchPingUrl: z.string().optional().nullable(),
    reschedulePingUrl: z.string().optional().nullable(),
  })
  .superRefine((val, ctx) => {
    for (const [field, value] of [
      ["dispatchPingUrl", val.dispatchPingUrl],
      ["reschedulePingUrl", val.reschedulePingUrl],
    ] as const) {
      if (!value) continue;
      const problem = healthcheckUrlError(value);
      if (problem) {
        ctx.addIssue({ code: "custom", path: [field], message: problem });
      }
    }
  });

/**
 * Helper to fetch a channel config fact from memory_facts
 *
 * Takes the real `Request`, never a hand-rolled `{ userId }` stand-in:
 * `runWithRls` derives Postgres claims from `req.authToken`, so a fake
 * request object yields `sub: null` claims, RLS matches nothing, and every
 * read silently returns empty (or the INSERT trips the policy's WITH CHECK).
 */
async function getConfigFact(
  req: Request,
  key: string,
): Promise<Record<string, any> | null> {
  const userId = req.userId!;
  const [fact] = await runWithRls(req, async (tx) => {
    return await tx
      .select()
      .from(memoryFactsTable)
      .where(
        and(
          eq(memoryFactsTable.userId, userId),
          eq(memoryFactsTable.key, key),
          eq(memoryFactsTable.archived, false),
        ),
      );
  });
  return (fact?.value as Record<string, any>) ?? null;
}

/**
 * Helper to upsert a channel config fact in memory_facts
 */
async function saveConfigFact(
  req: Request,
  key: string,
  title: string,
  value: Record<string, any>,
) {
  const userId = req.userId!;
  await runWithRls(req, async (tx) => {
    const [existing] = await tx
      .select()
      .from(memoryFactsTable)
      .where(and(eq(memoryFactsTable.userId, userId), eq(memoryFactsTable.key, key)));

    if (existing) {
      await tx
        .update(memoryFactsTable)
        .set({
          title,
          value,
          updatedAt: new Date(),
        })
        .where(eq(memoryFactsTable.id, existing.id));
    } else {
      await tx.insert(memoryFactsTable).values({
        userId,
        key,
        title,
        category: "channel",
        source: "conversational",
        confidence: 100,
        value,
      });
    }
  });
}

/**
 * GET /integrations/status
 * In-app Hermes-style integration status endpoint.
 * Returns live status of Telegram bot, webhook, and Healthchecks watchdog.
 */
router.get("/integrations/status", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  // 1. Get Telegram config from memory_facts or process.env
  const tgFact = await getConfigFact(req, "telegram_config");
  const botToken = tgFact?.botToken || process.env.TELEGRAM_BOT_TOKEN || "";
  const tokenSource = tgFact?.botToken ? "database" : process.env.TELEGRAM_BOT_TOKEN ? "env" : "none";

  // 2. Get user's linked Chat ID
  const [settings] = await runWithRls(req, async (tx) => {
    return await tx
      .select({ telegramChatId: notificationSettingsTable.telegramChatId })
      .from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.userId, userId));
  });

  // 3. Inspect Telegram live status if token is available
  let botUsername: string | undefined;
  let botFirstName: string | undefined;
  let webhookInfo: any = null;
  let botError: string | undefined;

  if (botToken) {
    const botCheck = await getTelegramBotInfo(botToken);
    if (botCheck.ok && botCheck.bot) {
      botUsername = botCheck.bot.username;
      botFirstName = botCheck.bot.first_name;
      const hookCheck = await getTelegramWebhookInfo(botToken);
      if (hookCheck.ok) {
        webhookInfo = hookCheck.info;
      }
    } else {
      botError = botCheck.error;
    }
  }

  // 4. Get Healthchecks config
  const hcFact = await getConfigFact(req, "healthchecks_config");
  const dispatchPingUrl = hcFact?.dispatchPingUrl || process.env.HEALTHCHECKS_DISPATCH_PING_URL || null;
  const reschedulePingUrl = hcFact?.reschedulePingUrl || process.env.HEALTHCHECKS_RESCHEDULE_PING_URL || null;

  // 5. Get Web Push subscription count
  const [pushCountRow] = await runWithRls(req, async (tx) => {
    return await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(webPushSubscriptionsTable)
      .where(eq(webPushSubscriptionsTable.userId, userId));
  });
  const pushDeviceCount = pushCountRow?.count ?? 0;

  res.json({
    telegram: {
      configured: Boolean(botToken && !botError),
      source: tokenSource,
      botUsername: botUsername ?? null,
      botFirstName: botFirstName ?? null,
      chatId: settings?.telegramChatId ?? null,
      webhookUrl: webhookInfo?.url ?? null,
      webhookHasCustomCert: webhookInfo?.has_custom_certificate ?? false,
      pendingUpdateCount: webhookInfo?.pending_update_count ?? 0,
      lastErrorDate: webhookInfo?.last_error_date ?? null,
      lastErrorMessage: webhookInfo?.last_error_message ?? null,
      error: botError ?? null,
      webhookSecretConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    },
    healthchecks: {
      configured: Boolean(dispatchPingUrl || reschedulePingUrl),
      dispatchPingUrl,
      reschedulePingUrl,
    },
    push: {
      enabled: pushDeviceCount > 0,
      deviceCount: pushDeviceCount,
    },
  });
});

/**
 * POST /integrations/telegram/connect
 * Hermes-style One-Click Setup:
 * 1. Validates bot token with Telegram
 * 2. Automatically sets webhook with Telegram's API (no curl needed!)
 * 3. Saves token & chat ID to DB and live server memory
 * 4. Sends a verification welcome message
 */
router.post("/integrations/telegram/connect", requireAuth, async (req, res): Promise<void> => {
  const parsed = ConnectTelegramSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
    return;
  }

  const { botToken, telegramChatId } = parsed.data;
  const userId = req.userId!;

  // Step 1: Verify token with Telegram
  const botInfo = await getTelegramBotInfo(botToken);
  if (!botInfo.ok || !botInfo.bot) {
    res.status(400).json({
      error: `Invalid Telegram Bot Token: ${botInfo.error ?? "Telegram rejected this token."}`,
    });
    return;
  }

  // Step 2: Determine Webhook URL
  const host = req.get("x-forwarded-host") || req.get("host") || "localhost:5000";
  const protocol = req.get("x-forwarded-proto") || req.protocol || "https";
  const defaultWebhookUrl = `${protocol}://${host}/api/telegram/webhook`;
  const webhookUrl = parsed.data.webhookUrl || defaultWebhookUrl;

  // Step 3: Register Webhook automatically
  // Fail closed: a committed, publicly-known fallback secret would let anyone
  // who reads the repo forge Telegram webhook deliveries.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.DISPATCH_SECRET;
  if (!secret) {
    res.status(503).json({
      error:
        "TELEGRAM_WEBHOOK_SECRET or DISPATCH_SECRET is not set on the server. Set it before connecting Telegram.",
    });
    return;
  }
  const hookResult = await setTelegramWebhook(botToken, webhookUrl, secret);

  if (!hookResult.ok) {
    res.status(502).json({
      error: `Telegram setWebhook failed: ${hookResult.error}`,
      botUsername: botInfo.bot.username,
    });
    return;
  }

  // Step 4: Persist Bot Token in memory_facts
  await saveConfigFact(req, "telegram_config", "Telegram Integration Credentials", {
    botToken,
    botUsername: botInfo.bot.username,
    botName: botInfo.bot.first_name,
    configuredAt: new Date().toISOString(),
  });

  // Step 5: Save Chat ID to notification_settings if supplied
  if (telegramChatId) {
    await runWithRls(req, async (tx) => {
      await tx
        .update(notificationSettingsTable)
        .set({ telegramChatId: telegramChatId.trim(), updatedAt: new Date() })
        .where(eq(notificationSettingsTable.userId, userId));
    });

    // Send instant welcome message
    await sendTelegramMessage(
      botToken,
      telegramChatId.trim(),
      `🎉 Cadence connected successfully!\n\nYour Telegram account is now paired with Cadence Task & Time OS. You'll receive real-time task nudges, reminders, and daily agendas right here.\n\nReply 'help' or 'list' anytime!`,
    );
  }

  // NOTE: deliberately does NOT write process.env.TELEGRAM_BOT_TOKEN.
  // The pool is process-wide, so doing so made one user's bot token global —
  // a second account connecting silently replaced the first, and the webhook
  // plus every dispatch sweep then used whoever connected last. Readers resolve
  // per-user (lib/telegram-credentials.ts) instead.

  res.json({
    ok: true,
    botUsername: botInfo.bot.username,
    botName: botInfo.bot.first_name,
    webhookUrl,
    message: "Telegram bot connected and webhook registered automatically!",
  });
});

/**
 * POST /integrations/telegram/test-message
 * Sends a test nudge to the user's linked Telegram chat.
 */
router.post("/integrations/telegram/test-message", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const tgFact = await getConfigFact(req, "telegram_config");
  const botToken = tgFact?.botToken || process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    res.status(400).json({ error: "Telegram bot token is not configured yet." });
    return;
  }

  const [settings] = await runWithRls(req, async (tx) => {
    return await tx
      .select({ telegramChatId: notificationSettingsTable.telegramChatId })
      .from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.userId, userId));
  });

  if (!settings?.telegramChatId) {
    res.status(400).json({
      error: "No Telegram Chat ID linked yet. Open your bot on Telegram and send /start to link your chat ID.",
    });
    return;
  }

  const testText =
    "⚡ Cadence Test Nudge:\n\nTwo-way communication is operational! You can reply with:\n• done <id> — complete a task\n• snooze <id> 1h — snooze a reminder\n• list — see today's agenda\n• undo — revert the last agent mutation";

  const result = await sendTelegramMessage(botToken, settings.telegramChatId, testText);

  if (!result.ok) {
    res.status(502).json({ error: `Telegram message send failed: ${result.error}` });
    return;
  }

  res.json({ ok: true, message: "Test message sent to Telegram successfully!" });
});

/**
 * POST /integrations/healthchecks/test
 * Immediately fires a ping to a Healthchecks.io URL and returns latency.
 */
router.post("/integrations/healthchecks/test", requireAuth, async (req, res): Promise<void> => {
  const parsed = HealthcheckTestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid URL" });
    return;
  }

  const blocked = healthcheckUrlError(parsed.data.url);
  if (blocked) {
    res.status(400).json({ error: blocked });
    return;
  }

  const start = Date.now();
  try {
    const response = await fetch(parsed.data.url, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - start;

    if (!response.ok) {
      res.status(400).json({
        ok: false,
        status: response.status,
        latencyMs,
        error: `Healthchecks.io returned HTTP ${response.status}`,
      });
      return;
    }

    res.json({
      ok: true,
      status: response.status,
      latencyMs,
      message: `Ping successful! Healthchecks.io responded in ${latencyMs}ms.`,
    });
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: `Network error pinging URL: ${String(err)}`,
    });
  }
});

/**
 * POST /integrations/healthchecks/save
 * Saves Healthchecks URLs in the user's own config. Sweeps resolve per-user
 * URLs at read time (see `getHealthcheckUrlsForUser`), so nothing is cached
 * into `process.env` here — the pool is shared and a per-user save must
 * never become global state.
 */
router.post("/integrations/healthchecks/save", requireAuth, async (req, res): Promise<void> => {
  const parsed = HealthcheckSaveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
    return;
  }

  const userId = req.userId!;
  const { dispatchPingUrl, reschedulePingUrl } = parsed.data;

  await saveConfigFact(req, "healthchecks_config", "Healthchecks.io Watchdog Settings", {
    dispatchPingUrl: dispatchPingUrl || null,
    reschedulePingUrl: reschedulePingUrl || null,
    updatedAt: new Date().toISOString(),
  });

  res.json({
    ok: true,
    message: "Healthchecks watchdog settings saved successfully!",
  });
});

/**
 * GET /integrations/telegram/pairing-token
 * Generates an interactive pairing nonce and returns deep-link + QR image URL.
 */
router.get("/integrations/telegram/pairing-token", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const tgFact = await getConfigFact(req, "telegram_config");
  const botToken = tgFact?.botToken || process.env.TELEGRAM_BOT_TOKEN;

  let botUsername = tgFact?.botUsername;
  if (!botUsername && botToken) {
    const info = await getTelegramBotInfo(botToken);
    if (info.ok && info.bot?.username) {
      botUsername = info.bot.username;
    }
  }

  // No fabricated fallback: an unconfigured bot must not render as a real,
  // clickable @handle. Fail with the reason instead.
  if (!botUsername) {
    res.status(400).json({
      error:
        "No Telegram bot is configured yet, so there is no pairing link to build. Connect a bot first.",
      configured: Boolean(botToken),
    });
    return;
  }

  const { token, expiresAt } = createPairingToken(userId);
  const deepLink = `https://t.me/${botUsername}?start=${token}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=12&format=svg&data=${encodeURIComponent(deepLink)}`;

  res.json({
    token,
    botUsername,
    deepLink,
    qrUrl,
    expiresAt,
  });
});

/**
 * GET /integrations/telegram/pairing-status
 * Polls the status of an active pairing session.
 */
router.get("/integrations/telegram/pairing-status", requireAuth, async (req, res): Promise<void> => {
  const token = String(req.query.token || "");
  if (!token) {
    res.status(400).json({ error: "Missing pairing token" });
    return;
  }

  const status = getPairingStatus(token);
  res.json(status);
});

/**
 * POST /integrations/url-metadata
 * Extracts title and metadata for an attached task reference URL.
 */
router.post("/integrations/url-metadata", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetUrlMetadataBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const metadata = await parseUrlMetadata(parsed.data.url);
    res.json(GetUrlMetadataResponse.parse(metadata));
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to resolve URL metadata" });
  }
});

/**
 * GET /integrations/push/vapid-key
 * Returns VAPID public key so client service workers can register Web Push subscriptions.
 */
router.get("/integrations/push/vapid-key", requireAuth, (_req, res): void => {
  res.json({ publicKey: getVapidPublicKey() });
});

/**
 * POST /integrations/push/subscribe
 * Registers or updates a browser Web Push subscription for the authenticated user.
 */
router.post("/integrations/push/subscribe", requireAuth, async (req, res): Promise<void> => {
  const parsed = SubscribePushNotificationsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid push subscription" });
    return;
  }

  const userId = req.userId!;
  const { endpoint, p256dh, auth, userAgent } = parsed.data;

  const [row] = await runWithRls(req, async (tx) => {
    const [existing] = await tx
      .select()
      .from(webPushSubscriptionsTable)
      .where(
        and(
          eq(webPushSubscriptionsTable.userId, userId),
          eq(webPushSubscriptionsTable.endpoint, endpoint),
        ),
      );

    if (existing) {
      await tx
        .update(webPushSubscriptionsTable)
        .set({
          p256dh,
          auth,
          userAgent: userAgent ?? null,
          updatedAt: new Date(),
        })
        .where(eq(webPushSubscriptionsTable.id, existing.id));
      return [existing];
    }

    return await tx
      .insert(webPushSubscriptionsTable)
      .values({
        userId,
        endpoint,
        p256dh,
        auth,
        userAgent: userAgent ?? null,
      })
      .returning();
  });

  res.json({ ok: true, id: row.id });
});

/**
 * POST /integrations/push/unsubscribe
 * De-registers a browser Web Push subscription for the authenticated user.
 */
router.post("/integrations/push/unsubscribe", requireAuth, async (req, res): Promise<void> => {
  const parsed = UnsubscribePushNotificationsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid unsubscribe payload" });
    return;
  }

  const userId = req.userId!;
  const { endpoint } = parsed.data;

  await runWithRls(req, async (tx) => {
    await tx
      .delete(webPushSubscriptionsTable)
      .where(
        and(
          eq(webPushSubscriptionsTable.userId, userId),
          eq(webPushSubscriptionsTable.endpoint, endpoint),
        ),
      );
  });

  res.json({ ok: true });
});

/**
 * POST /integrations/push/test
 * Sends an immediate test Web Push notification to all active devices of the authenticated user.
 */
router.post("/integrations/push/test", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const result = await dispatchPushToUser(userId, {
    title: "Cadence Web Push Test",
    body: "Lock-screen background notification verified successfully!",
    tag: "cadence-test-alert",
    data: { url: "/today" },
  });

  res.json({ ok: true, sent: result.sent, failed: result.failed });
});

export default router;
