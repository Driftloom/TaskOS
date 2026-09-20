import { describe, expect, it } from "vitest";
import {
  createPairingToken,
  confirmPairing,
  getPairingStatus,
} from "./telegram-pairing";

describe("Telegram QR Code Pairing Manager", () => {
  it("generates unique pairing tokens with expiration", () => {
    const session1 = createPairingToken("user-1");
    const session2 = createPairingToken("user-2");

    expect(session1.token).toMatch(/^pair_[a-f0-9]{16}$/);
    expect(session2.token).toMatch(/^pair_[a-f0-9]{16}$/);
    expect(session1.token).not.toEqual(session2.token);
    expect(session1.expiresAt).toBeGreaterThan(Date.now());
  });

  it("reports pending status before user scans", () => {
    const { token } = createPairingToken("user-3");
    const status = getPairingStatus(token);

    expect(status.exists).toBe(true);
    expect(status.confirmed).toBe(false);
    expect(status.expired).toBe(false);
    expect(status.chatId).toBeUndefined();
  });

  it("confirms pairing and returns userId when /start token is received", () => {
    const { token } = createPairingToken("user-4");
    const confirmResult = confirmPairing(token, "987654321", "rohit_cadence");

    expect(confirmResult.success).toBe(true);
    expect(confirmResult.userId).toBe("user-4");

    const status = getPairingStatus(token);
    expect(status.confirmed).toBe(true);
    expect(status.chatId).toBe("987654321");
    expect(status.username).toBe("rohit_cadence");
  });

  it("returns exists: false for invalid or unknown tokens", () => {
    const status = getPairingStatus("pair_nonexistent_token");
    expect(status.exists).toBe(false);
    expect(status.confirmed).toBe(false);
  });
});
