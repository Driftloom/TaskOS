import crypto from "node:crypto";

interface PairingSession {
  token: string;
  userId: string;
  createdAt: number;
  confirmed: boolean;
  chatId?: string;
  username?: string;
}

// In-memory token registry with 10-minute TTL
const pairingRegistry = new Map<string, PairingSession>();
const TTL_MS = 10 * 60 * 1000; // 10 minutes

export function createPairingToken(userId: string): { token: string; expiresAt: number } {
  const now = Date.now();

  // Purge expired tokens
  for (const [key, session] of pairingRegistry.entries()) {
    if (now - session.createdAt > TTL_MS) {
      pairingRegistry.delete(key);
    }
  }

  const token = `pair_${crypto.randomBytes(8).toString("hex")}`;
  pairingRegistry.set(token, {
    token,
    userId,
    createdAt: now,
    confirmed: false,
  });

  return { token, expiresAt: now + TTL_MS };
}

export function confirmPairing(
  token: string,
  chatId: string,
  username?: string,
): { success: boolean; userId?: string } {
  const session = pairingRegistry.get(token);
  if (!session) return { success: false };

  const now = Date.now();
  if (now - session.createdAt > TTL_MS) {
    pairingRegistry.delete(token);
    return { success: false };
  }

  session.confirmed = true;
  session.chatId = chatId;
  session.username = username;
  return { success: true, userId: session.userId };
}

export function getPairingStatus(token: string): {
  exists: boolean;
  confirmed: boolean;
  chatId?: string;
  username?: string;
  expired: boolean;
} {
  const session = pairingRegistry.get(token);
  if (!session) return { exists: false, confirmed: false, expired: true };

  const now = Date.now();
  if (now - session.createdAt > TTL_MS) {
    pairingRegistry.delete(token);
    return { exists: false, confirmed: false, expired: true };
  }

  return {
    exists: true,
    confirmed: session.confirmed,
    chatId: session.chatId,
    username: session.username,
    expired: false,
  };
}
