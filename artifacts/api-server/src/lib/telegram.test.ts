import { describe, expect, it } from "vitest";
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
