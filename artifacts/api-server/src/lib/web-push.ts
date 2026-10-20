import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { webPushSubscriptionsTable } from "@workspace/db/schema";
import { logger } from "./logger";

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

const DEFAULT_VAPID_SUBJECT = "mailto:support@cadence.app";

let vapidConfigured = false;
let warnedUnconfigured = false;

/**
 * Resolves VAPID credentials strictly from the environment. A well-known
 * example keypair used to be the silent fallback, which meant an unconfigured
 * deployment served a public key that every web-push tutorial also prints.
 * Unconfigured now degrades honestly: empty key for the client, no-op failure
 * for sends. `VAPID_SUBJECT` is a contact address, not a secret, so its
 * default stays.
 */
function ensureVapidConfig(): { publicKey: string; subject: string } {
  const publicKey = process.env.VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  const subject = process.env.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT;

  if (!publicKey || !privateKey) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      logger.warn(
        "Web Push not configured: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable push delivery.",
      );
    }
    return { publicKey: "", subject: "" };
  }

  if (!vapidConfigured) {
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      vapidConfigured = true;
    } catch (err: any) {
      logger.warn({ err: err.message }, "Failed to configure VAPID details for Web Push");
    }
  }

  return { publicKey, subject };
}

/**
 * Returns the active VAPID public key for frontend subscription.
 * Empty string when Web Push is not configured (no VAPID env vars).
 */
export function getVapidPublicKey(): string {
  const { publicKey } = ensureVapidConfig();
  return publicKey;
}

/**
 * Send a single Web Push notification to a specific push subscription.
 */
export async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushNotificationPayload,
): Promise<{ ok: boolean; isExpired?: boolean; error?: string }> {
  const { publicKey } = ensureVapidConfig();
  if (!publicKey) {
    return { ok: false, error: "Web Push not configured" };
  }

  const pushSubscription: webpush.PushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };

  const formattedPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    tag: payload.tag || "cadence-alert",
    data: payload.data || { url: "/today" },
  });

  try {
    await webpush.sendNotification(pushSubscription, formattedPayload, {
      TTL: 86400, // 24 hours retention on push gateways
    });
    return { ok: true };
  } catch (err: any) {
    const statusCode = err?.statusCode;
    // 404 Not Found or 410 Gone means the subscription is expired or uninstalled
    const isExpired = statusCode === 404 || statusCode === 410;
    return {
      ok: false,
      isExpired,
      error: err?.message || "Web Push delivery failed",
    };
  }
}

/**
 * Dispatch a push notification to all active browser/mobile devices registered for a user.
 * Automatically prunes expired (410/404) subscriptions from the database.
 */
export async function dispatchPushToUser(
  userId: string,
  payload: PushNotificationPayload,
): Promise<{ sent: number; failed: number; pruned: number }> {
  const { db } = await import("@workspace/db");
  const subscriptions = await db
    .select({
      id: webPushSubscriptionsTable.id,
      endpoint: webPushSubscriptionsTable.endpoint,
      p256dh: webPushSubscriptionsTable.p256dh,
      auth: webPushSubscriptionsTable.auth,
    })
    .from(webPushSubscriptionsTable)
    .where(eq(webPushSubscriptionsTable.userId, userId));

  if (!subscriptions.length) {
    return { sent: 0, failed: 0, pruned: 0 };
  }

  let sent = 0;
  let failed = 0;
  const expiredIds: number[] = [];

  for (const sub of subscriptions) {
    const result = await sendWebPush(sub, payload);
    if (result.ok) {
      sent += 1;
    } else {
      failed += 1;
      if (result.isExpired) {
        expiredIds.push(sub.id);
      }
    }
  }

  // Prune dead subscriptions so subsequent ticks do not waste outbound HTTP requests
  if (expiredIds.length > 0) {
    await db
      .delete(webPushSubscriptionsTable)
      .where(inArray(webPushSubscriptionsTable.id, expiredIds));
  }

  return { sent, failed, pruned: expiredIds.length };
}
