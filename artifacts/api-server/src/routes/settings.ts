import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { focusSettingsTable, notificationSettingsTable } from "@workspace/db";
import {
  GetFocusSettingsResponse,
  GetNotificationSettingsResponse,
  UpdateFocusSettingsBody,
  UpdateFocusSettingsResponse,
  UpdateNotificationSettingsBody,
  UpdateNotificationSettingsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { runWithRls } from "../lib/rls";

const router: IRouter = Router();

const DEFAULTS = {
  telegramChatId: null as string | null,
  quietStart: 22,
  quietEnd: 7,
  timezone: "UTC",
  remindersEnabled: true,
};

router.get(
  "/settings/notifications",
  requireAuth,
  async (req, res): Promise<void> => {
    const settings = await runWithRls(req, async (tx) => {
      const [existing] = await tx
        .select()
        .from(notificationSettingsTable)
        .where(eq(notificationSettingsTable.userId, req.userId!));
      if (existing) return existing;
      const [created] = await tx
        .insert(notificationSettingsTable)
        .values({ userId: req.userId!, ...DEFAULTS })
        .returning();
      return created;
    });

    res.json(GetNotificationSettingsResponse.parse(settings));
  },
);

router.patch(
  "/settings/notifications",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = UpdateNotificationSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    // Timezones fail CLOSED here (unlike query params): a stored bad zone
    // would silently shift every future reminder.
    if (parsed.data.timezone !== undefined) {
      try {
        new Intl.DateTimeFormat("en-US", {
          timeZone: parsed.data.timezone,
        }).format();
      } catch {
        res.status(400).json({ error: "Invalid IANA timezone." });
        return;
      }
    }

    const updates: {
      telegramChatId?: string | null;
      quietStart?: number;
      quietEnd?: number;
      timezone?: string;
      remindersEnabled?: boolean;
    } = {};
    if (parsed.data.telegramChatId !== undefined) {
      updates.telegramChatId = parsed.data.telegramChatId;
    }
    if (parsed.data.quietStart !== undefined) {
      updates.quietStart = parsed.data.quietStart;
    }
    if (parsed.data.quietEnd !== undefined) {
      updates.quietEnd = parsed.data.quietEnd;
    }
    if (parsed.data.timezone !== undefined) {
      updates.timezone = parsed.data.timezone;
    }
    if (parsed.data.remindersEnabled !== undefined) {
      updates.remindersEnabled = parsed.data.remindersEnabled;
    }

    const settings = await runWithRls(req, async (tx) => {
      const [updated] = await tx
        .update(notificationSettingsTable)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(notificationSettingsTable.userId, req.userId!))
        .returning();
      if (updated) return updated;
      const [created] = await tx
        .insert(notificationSettingsTable)
        .values({ userId: req.userId!, ...DEFAULTS, ...updates })
        .returning();
      return created;
    });

    res.json(UpdateNotificationSettingsResponse.parse(settings));
  },
);

router.get("/settings/focus", requireAuth, async (req, res): Promise<void> => {
  const settings = await runWithRls(req, async (tx) => {
    const [existing] = await tx
      .select()
      .from(focusSettingsTable)
      .where(eq(focusSettingsTable.userId, req.userId!));
    if (existing) return existing;
    const [created] = await tx
      .insert(focusSettingsTable)
      .values({ userId: req.userId!, dailyTarget: 4 })
      .returning();
    return created;
  });

  res.json(GetFocusSettingsResponse.parse(settings));
});

router.patch(
  "/settings/focus",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = UpdateFocusSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const settings = await runWithRls(req, async (tx) => {
      const updates: { dailyTarget?: number } = {};
      if (parsed.data.dailyTarget !== undefined) {
        updates.dailyTarget = parsed.data.dailyTarget;
      }
      const [updated] = await tx
        .update(focusSettingsTable)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(focusSettingsTable.userId, req.userId!))
        .returning();
      if (updated) return updated;
      const [created] = await tx
        .insert(focusSettingsTable)
        .values({ userId: req.userId!, dailyTarget: 4, ...updates })
        .returning();
      return created;
    });

    res.json(UpdateFocusSettingsResponse.parse(settings));
  },
);

export default router;
