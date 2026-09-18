import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { remindersTable, tasksTable } from "@workspace/db";
import {
  CreateAutoRemindersBody,
  CreateAutoRemindersParams,
  CreateAutoRemindersResponse,
  CreateTaskReminderBody,
  CreateTaskReminderParams,
  CreateTaskReminderResponse,
  DeleteReminderParams,
  ListTaskRemindersParams,
  ListTaskRemindersResponse,
  UpdateReminderBody,
  UpdateReminderParams,
  UpdateReminderResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { runWithRls } from "../lib/rls";
import { computeTiers } from "../lib/reminders";
import { ownedTaskId } from "./task-files";

const router: IRouter = Router();

router.get(
  "/tasks/:id/reminders",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListTaskRemindersParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const reminders = await runWithRls(req, async (tx) => {
      if (!(await ownedTaskId(tx, req.userId!, params.data.id))) return null;
      return tx
        .select()
        .from(remindersTable)
        .where(
          and(
            eq(remindersTable.taskId, params.data.id),
            eq(remindersTable.userId, req.userId!),
          ),
        )
        .orderBy(asc(remindersTable.remindAt));
    });

    if (!reminders) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json(ListTaskRemindersResponse.parse(reminders));
  },
);

router.post(
  "/tasks/:id/reminders",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = CreateTaskReminderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = CreateTaskReminderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const reminder = await runWithRls(req, async (tx) => {
      if (!(await ownedTaskId(tx, req.userId!, params.data.id))) return null;
      const [created] = await tx
        .insert(remindersTable)
        .values({
          userId: req.userId!,
          taskId: params.data.id,
          remindAt: new Date(parsed.data.remindAt),
          channel: parsed.data.channel ?? "telegram",
        })
        .returning();
      return created;
    });

    if (!reminder) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.status(201).json(CreateTaskReminderResponse.parse(reminder));
  },
);

// Standard tiers (T-1 day, T-1 hour, at-time). Past tiers are skipped, and
// re-running never duplicates rows (matched by exact remind_at).
router.post(
  "/tasks/:id/reminders/auto",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = CreateAutoRemindersParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = CreateAutoRemindersBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const now = new Date();
    const result = await runWithRls(req, async (tx) => {
      const [task] = await tx
        .select({ id: tasksTable.id, dueAt: tasksTable.dueAt })
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.id, params.data.id),
            eq(tasksTable.userId, req.userId!),
          ),
        );
      if (!task) return null;
      const dueRaw = parsed.data.dueAt ?? task.dueAt;
      if (!dueRaw) return "no-due-date" as const;
      const tiers = computeTiers(new Date(dueRaw), now);
      const existing = await tx
        .select({ remindAt: remindersTable.remindAt })
        .from(remindersTable)
        .where(
          and(
            eq(remindersTable.taskId, task.id),
            eq(remindersTable.userId, req.userId!),
          ),
        );
      const have = new Set(existing.map((row) => row.remindAt.getTime()));
      for (const tier of tiers) {
        if (have.has(tier.at.getTime())) continue;
        await tx.insert(remindersTable).values({
          userId: req.userId!,
          taskId: task.id,
          remindAt: tier.at,
          channel: "telegram",
        });
        have.add(tier.at.getTime());
      }
      return tx
        .select()
        .from(remindersTable)
        .where(
          and(
            eq(remindersTable.taskId, task.id),
            eq(remindersTable.userId, req.userId!),
          ),
        )
        .orderBy(asc(remindersTable.remindAt));
    });

    if (!result) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    if (result === "no-due-date") {
      res.status(400).json({
        error: "Task has no due date: send dueAt to derive tiers from.",
      });
      return;
    }
    res.json(CreateAutoRemindersResponse.parse(result));
  },
);

router.patch(
  "/reminders/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UpdateReminderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateReminderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const updated = await runWithRls(req, async (tx) => {
      const [current] = await tx
        .select({ status: remindersTable.status })
        .from(remindersTable)
        .where(
          and(
            eq(remindersTable.id, params.data.id),
            eq(remindersTable.userId, req.userId!),
          ),
        );
      if (!current) return null;
      if (current.status !== "pending") {
        return "immutable" as const;
      }
      const updates: { remindAt?: Date; status?: string } = {};
      if (parsed.data.remindAt !== undefined) {
        updates.remindAt = new Date(parsed.data.remindAt);
      }
      if (parsed.data.status !== undefined) {
        updates.status = parsed.data.status;
      }
      const [row] = await tx
        .update(remindersTable)
        .set({ ...updates, updatedAt: new Date() })
        .where(
          and(
            eq(remindersTable.id, params.data.id),
            eq(remindersTable.userId, req.userId!),
          ),
        )
        .returning();
      return row;
    });

    if (!updated) {
      res.status(404).json({ error: "Reminder not found" });
      return;
    }
    if (updated === "immutable") {
      res.status(400).json({ error: "Only pending reminders can be changed." });
      return;
    }
    res.json(UpdateReminderResponse.parse(updated));
  },
);

router.delete(
  "/reminders/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = DeleteReminderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [reminder] = await runWithRls(req, async (tx) =>
      tx
        .delete(remindersTable)
        .where(
          and(
            eq(remindersTable.id, params.data.id),
            eq(remindersTable.userId, req.userId!),
          ),
        )
        .returning({ id: remindersTable.id }),
    );

    if (!reminder) {
      res.status(404).json({ error: "Reminder not found" });
      return;
    }

    res.status(204).send();
  },
);

export default router;
