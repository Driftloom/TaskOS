import { describe, expect, it, vi } from "vitest";
import {
  CreateTaskReminderBody,
  UpdateNotificationSettingsBody,
  UpdateReminderBody,
} from "@workspace/api-zod";
import { formatReminder, parseTelegramCommand, TELEGRAM_HELP } from "./telegram";

describe("parseTelegramCommand", () => {
  it("parses done variants", () => {
    expect(parseTelegramCommand("/done 12")).toEqual({ action: "done", taskId: 12 });
    expect(parseTelegramCommand("done 7")).toEqual({ action: "done", taskId: 7 });
    expect(parseTelegramCommand("  COMPLETE  3 ")).toEqual({ action: "done", taskId: 3 });
  });
  it("parses snooze with default and explicit durations", () => {
    expect(parseTelegramCommand("snooze 5")).toEqual({ action: "snooze", taskId: 5, minutes: 60 });
    expect(parseTelegramCommand("/snooze 5 30m")).toEqual({ action: "snooze", taskId: 5, minutes: 30 });
    expect(parseTelegramCommand("snooze 5 2h")).toEqual({ action: "snooze", taskId: 5, minutes: 120 });
    expect(parseTelegramCommand("snooze 5 45 minutes")).toEqual({ action: "snooze", taskId: 5, minutes: 45 });
  });
  it("parses list and help", () => {
    expect(parseTelegramCommand("/list")).toEqual({ action: "list" });
    expect(parseTelegramCommand("list today")).toEqual({ action: "list" });
    expect(parseTelegramCommand("/start")).toEqual({ action: "help" });
    expect(TELEGRAM_HELP).toMatch("snooze");
  });
  it("parses proposal answers", () => {
    expect(parseTelegramCommand("accept 3")).toEqual({ action: "acceptProposal", proposalId: 3 });
    expect(parseTelegramCommand("/decline 3")).toEqual({ action: "declineProposal", proposalId: 3 });
    expect(parseTelegramCommand("accept")).toBeNull();
  });
  it("rejects anything else", () => {
    expect(parseTelegramCommand("done")).toBeNull();
    expect(parseTelegramCommand("done abc")).toBeNull();
    expect(parseTelegramCommand("remind me tomorrow")).toBeNull();
    expect(parseTelegramCommand("")).toBeNull();
  });
});

describe("formatReminder", () => {
  it("renders an exact, command-ready message", () => {
    expect(formatReminder(9, "Send proposal", new Date("2026-09-20T11:30:00.000Z"))).toBe(
      "Reminder: Send proposal\nDue: 2026-09-20 11:30 UTC\nReply: done 9 · snooze 9 1h",
    );
    expect(formatReminder(9, "No date", null)).toBe(
      "Reminder: No date\nDue: no due date\nReply: done 9 · snooze 9 1h",
    );
  });
});

describe("contract — reminder and settings shapes", () => {
  it("reminder bodies", () => {
    expect(
      CreateTaskReminderBody.safeParse({ remindAt: "2026-09-20T09:00:00.000Z" }).success,
    ).toBe(true);
    expect(UpdateReminderBody.safeParse({ status: "sent" }).success).toBe(false);
    expect(UpdateReminderBody.safeParse({ status: "canceled" }).success).toBe(true);
  });
  it("settings boundaries", () => {
    expect(
      UpdateNotificationSettingsBody.safeParse({
        telegramChatId: "12345",
        quietStart: 22,
        quietEnd: 7,
        timezone: "Asia/Kolkata",
        remindersEnabled: true,
      }).success,
    ).toBe(true);
    expect(
      UpdateNotificationSettingsBody.safeParse({ quietStart: 24 }).success,
    ).toBe(false);
    expect(
      UpdateNotificationSettingsBody.safeParse({ telegramChatId: "abc" }).success,
    ).toBe(false);
  });
});

describe("Telegram Webhook & Bot Metadata helpers", () => {
  it("getTelegramBotInfo parses successful response", async () => {
    const { getTelegramBotInfo } = await import("./telegram");
    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: {
          id: 123456,
          is_bot: true,
          first_name: "Cadence Bot",
          username: "CadenceTaskBot",
        },
      }),
    }) as any;

    const res = await getTelegramBotInfo("dummy-token");
    expect(res.ok).toBe(true);
    expect(res.bot?.username).toBe("CadenceTaskBot");
    global.fetch = origFetch;
  });

  it("getTelegramWebhookInfo parses webhook status", async () => {
    const { getTelegramWebhookInfo } = await import("./telegram");
    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: {
          url: "https://api.cadence.com/api/telegram/webhook",
          has_custom_certificate: false,
          pending_update_count: 0,
        },
      }),
    }) as any;

    const res = await getTelegramWebhookInfo("dummy-token");
    expect(res.ok).toBe(true);
    expect(res.info?.url).toContain("/api/telegram/webhook");
    global.fetch = origFetch;
  });

  it("setTelegramWebhook posts url and secret_token", async () => {
    const { setTelegramWebhook } = await import("./telegram");
    const origFetch = global.fetch;
    let capturedBody: any;
    global.fetch = vi.fn().mockImplementation(async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({ ok: true, description: "Webhook was set" }),
      };
    }) as any;

    const res = await setTelegramWebhook(
      "dummy-token",
      "https://api.cadence.com/api/telegram/webhook",
      "my_secret_token",
    );
    expect(res.ok).toBe(true);
    expect(capturedBody.url).toBe("https://api.cadence.com/api/telegram/webhook");
    expect(capturedBody.secret_token).toBe("my_secret_token");
    global.fetch = origFetch;
  });
});

