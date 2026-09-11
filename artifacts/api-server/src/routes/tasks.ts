import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, focusSessionsTable, tasksTable } from "@workspace/db";
import {
  CreateTaskBody,
  CreateTaskResponse,
  DeleteTaskParams,
  GetTaskSummaryQueryParams,
  GetTaskSummaryResponse,
  ListTasksQueryParams,
  ListTasksResponse,
  UpdateTaskBody,
  UpdateTaskParams,
  UpdateTaskResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { dayBounds } from "../lib/date";

const router: IRouter = Router();

router.get("/tasks", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListTasksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { date, scope, timezone } = parsed.data;
  const { start, end } = dayBounds(date, timezone);
  const conditions = [eq(tasksTable.userId, req.userId!)];

  if (scope === "inbox") {
    conditions.push(eq(tasksTable.status, "inbox"));
  } else if (scope === "today") {
    conditions.push(gte(tasksTable.dueAt, start), lt(tasksTable.dueAt, end));
  }

  const tasks = await db
    .select()
    .from(tasksTable)
    .where(and(...conditions))
    .orderBy(desc(tasksTable.createdAt));

  res.json(ListTasksResponse.parse(tasks));
});

router.post("/tasks", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [task] = await db
    .insert(tasksTable)
    .values({
      userId: req.userId!,
      title: parsed.data.title.trim(),
      notes: parsed.data.notes ?? null,
      dueAt: parsed.data.dueAt ?? null,
      durationMin: parsed.data.durationMin,
      priority: parsed.data.priority,
      status: parsed.data.status,
    })
    .returning();

  res.status(201).json(CreateTaskResponse.parse(task));
});

router.patch("/tasks/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates = Object.fromEntries(
    Object.entries(parsed.data).filter(([, value]) => value !== undefined),
  );

  const [task] = await db
    .update(tasksTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(
      and(eq(tasksTable.id, params.data.id), eq(tasksTable.userId, req.userId!)),
    )
    .returning();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json(UpdateTaskResponse.parse(task));
});

router.delete("/tasks/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [task] = await db
    .delete(tasksTable)
    .where(
      and(eq(tasksTable.id, params.data.id), eq(tasksTable.userId, req.userId!)),
    )
    .returning({ id: tasksTable.id });

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.status(204).send();
});

router.get("/tasks/summary", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetTaskSummaryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { start, end } = dayBounds(parsed.data.date, parsed.data.timezone);
  const tasks = await db
    .select({
      status: tasksTable.status,
      durationMin: tasksTable.durationMin,
    })
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.userId, req.userId!),
        gte(tasksTable.dueAt, start),
        lt(tasksTable.dueAt, end),
      ),
    );

  const focusSessions = await db
    .select({ elapsedMinutes: focusSessionsTable.elapsedMinutes })
    .from(focusSessionsTable)
    .where(
      and(
        eq(focusSessionsTable.userId, req.userId!),
        gte(focusSessionsTable.startedAt, start),
        lt(focusSessionsTable.startedAt, end),
        inArray(focusSessionsTable.status, ["paused", "completed"]),
      ),
    );

  const completed = tasks.filter((task) => task.status === "completed").length;
  const focusMinutes = focusSessions.reduce(
    (total, session) => total + session.elapsedMinutes,
    0,
  );
  res.json(
    GetTaskSummaryResponse.parse({
      total: tasks.length,
      completed,
      open: tasks.length - completed,
      focusMinutes,
    }),
  );
});

export default router;