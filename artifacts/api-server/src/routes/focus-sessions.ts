import { and, asc, eq, gte, lt } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateFocusSessionBody,
  CreateFocusSessionResponse,
  ListFocusSessionsQueryParams,
  ListFocusSessionsResponse,
  UpdateFocusSessionBody,
  UpdateFocusSessionParams,
  UpdateFocusSessionResponse,
} from "@workspace/api-zod";
import {
  db,
  focusSessionsTable,
  tasksTable,
} from "@workspace/db";
import { dayBounds } from "../lib/date";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/focus-sessions", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListFocusSessionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { start, end } = dayBounds(parsed.data.date, parsed.data.timezone);
  const sessions = await db
    .select()
    .from(focusSessionsTable)
    .where(
      and(
        eq(focusSessionsTable.userId, req.userId!),
        gte(focusSessionsTable.startedAt, start),
        lt(focusSessionsTable.startedAt, end),
      ),
    )
    .orderBy(asc(focusSessionsTable.startedAt));

  res.json(ListFocusSessionsResponse.parse(sessions));
});

router.post("/focus-sessions", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateFocusSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [task] = await db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.id, parsed.data.taskId),
        eq(tasksTable.userId, req.userId!),
      ),
    );

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const [session] = await db
    .insert(focusSessionsTable)
    .values({
      userId: req.userId!,
      taskId: parsed.data.taskId,
      plannedMinutes: parsed.data.plannedMinutes,
      elapsedMinutes: 0,
      status: "active",
    })
    .returning();

  res.status(201).json(CreateFocusSessionResponse.parse(session));
});

router.patch(
  "/focus-sessions/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UpdateFocusSessionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = UpdateFocusSessionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const updates = Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined),
    );
    if (
      (parsed.data.status === "completed" ||
        parsed.data.status === "canceled") &&
      parsed.data.endedAt === undefined
    ) {
      updates.endedAt = new Date();
    }

    const [session] = await db
      .update(focusSessionsTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(
        and(
          eq(focusSessionsTable.id, params.data.id),
          eq(focusSessionsTable.userId, req.userId!),
        ),
      )
      .returning();

    if (!session) {
      res.status(404).json({ error: "Focus session not found" });
      return;
    }

    res.json(UpdateFocusSessionResponse.parse(session));
  },
);

export default router;