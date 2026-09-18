import { and, asc, eq, gt, lt, ne } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  tasksTable,
  timeBlocksTable,
  type DbTransaction,
} from "@workspace/db";
import {
  CreateTaskBlockBody,
  CreateTaskBlockParams,
  CreateTaskBlockResponse,
  DeleteTaskBlockParams,
  ListBlocksQueryParams,
  ListBlocksResponse,
  ListTaskBlocksParams,
  ListTaskBlocksResponse,
  UpdateTaskBlockBody,
  UpdateTaskBlockParams,
  UpdateTaskBlockResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { runWithRls } from "../lib/rls";
import { dayBounds } from "../lib/date";
import { findOverlap } from "../lib/blocks";
import { ownedTaskId } from "./task-files";

const router: IRouter = Router();

async function blockWithTitle(tx: DbTransaction, userId: string, id: number) {
  const [row] = await tx
    .select({
      id: timeBlocksTable.id,
      taskId: timeBlocksTable.taskId,
      taskTitle: tasksTable.title,
      startAt: timeBlocksTable.startAt,
      endAt: timeBlocksTable.endAt,
      createdAt: timeBlocksTable.createdAt,
      updatedAt: timeBlocksTable.updatedAt,
    })
    .from(timeBlocksTable)
    .innerJoin(tasksTable, eq(timeBlocksTable.taskId, tasksTable.id))
    .where(
      and(eq(timeBlocksTable.id, id), eq(timeBlocksTable.userId, userId)),
    );
  return row ?? null;
}

/** Existing user blocks colliding with [startAt, endAt), optionally ignoring
 *  one id (resizes must not collide with themselves). */
async function collidingBlock(
  tx: DbTransaction,
  userId: string,
  startAt: Date,
  endAt: Date,
  ignoreId?: number,
) {
  const conditions = [
    eq(timeBlocksTable.userId, userId),
    gt(timeBlocksTable.endAt, startAt),
    lt(timeBlocksTable.startAt, endAt),
  ];
  if (ignoreId !== undefined) {
    conditions.push(ne(timeBlocksTable.id, ignoreId));
  }
  const rows = await tx
    .select({
      startAt: timeBlocksTable.startAt,
      endAt: timeBlocksTable.endAt,
    })
    .from(timeBlocksTable)
    .where(and(...conditions));
  return findOverlap({ startAt, endAt }, rows);
}

router.get("/blocks", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListBlocksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { start, end } = dayBounds(parsed.data.date, parsed.data.timezone);
  let rangeEnd = end;
  if (parsed.data.endDate !== undefined) {
    const endDay = dayBounds(parsed.data.endDate, parsed.data.timezone);
    if (endDay.start.getTime() < start.getTime()) {
      res.status(400).json({ error: "endDate must not be earlier than date." });
      return;
    }
    rangeEnd = endDay.end;
  }
  const blocks = await runWithRls(req, async (tx) =>
    tx
      .select({
        id: timeBlocksTable.id,
        taskId: timeBlocksTable.taskId,
        taskTitle: tasksTable.title,
        startAt: timeBlocksTable.startAt,
        endAt: timeBlocksTable.endAt,
        createdAt: timeBlocksTable.createdAt,
        updatedAt: timeBlocksTable.updatedAt,
      })
      .from(timeBlocksTable)
      .innerJoin(tasksTable, eq(timeBlocksTable.taskId, tasksTable.id))
      .where(
        and(
          eq(timeBlocksTable.userId, req.userId!),
          gt(timeBlocksTable.endAt, start),
          lt(timeBlocksTable.startAt, rangeEnd),
        ),
      )
      .orderBy(asc(timeBlocksTable.startAt)),
  );

  res.json(ListBlocksResponse.parse(blocks));
});

router.get(
  "/tasks/:id/blocks",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListTaskBlocksParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const blocks = await runWithRls(req, async (tx) => {
      if (!(await ownedTaskId(tx, req.userId!, params.data.id))) return null;
      return tx
        .select({
          id: timeBlocksTable.id,
          taskId: timeBlocksTable.taskId,
          taskTitle: tasksTable.title,
          startAt: timeBlocksTable.startAt,
          endAt: timeBlocksTable.endAt,
          createdAt: timeBlocksTable.createdAt,
          updatedAt: timeBlocksTable.updatedAt,
        })
        .from(timeBlocksTable)
        .innerJoin(tasksTable, eq(timeBlocksTable.taskId, tasksTable.id))
        .where(
          and(
            eq(timeBlocksTable.taskId, params.data.id),
            eq(timeBlocksTable.userId, req.userId!),
          ),
        )
        .orderBy(asc(timeBlocksTable.startAt));
    });

    if (!blocks) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json(ListTaskBlocksResponse.parse(blocks));
  },
);

router.post(
  "/tasks/:id/blocks",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = CreateTaskBlockParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = CreateTaskBlockBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const startAt = new Date(parsed.data.startAt);
    const endAt = new Date(parsed.data.endAt);
    if (endAt <= startAt) {
      res.status(400).json({ error: "endAt must be after startAt." });
      return;
    }

    const block = await runWithRls(req, async (tx) => {
      if (!(await ownedTaskId(tx, req.userId!, params.data.id))) return null;
      if (await collidingBlock(tx, req.userId!, startAt, endAt)) {
        return "overlap" as const;
      }
      const [created] = await tx
        .insert(timeBlocksTable)
        .values({
          userId: req.userId!,
          taskId: params.data.id,
          startAt,
          endAt,
        })
        .returning({ id: timeBlocksTable.id });
      return blockWithTitle(tx, req.userId!, created.id);
    });

    if (!block) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    if (block === "overlap") {
      res.status(400).json({ error: "Overlapping time block." });
      return;
    }
    res.status(201).json(CreateTaskBlockResponse.parse(block));
  },
);

router.patch(
  "/blocks/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UpdateTaskBlockParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateTaskBlockBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const updated = await runWithRls(req, async (tx) => {
      const current = await blockWithTitle(tx, req.userId!, params.data.id);
      if (!current) return null;
      const startAt = parsed.data.startAt
        ? new Date(parsed.data.startAt)
        : current.startAt;
      const endAt = parsed.data.endAt
        ? new Date(parsed.data.endAt)
        : current.endAt;
      if (endAt <= startAt) {
        return "invalid" as const;
      }
      if (await collidingBlock(tx, req.userId!, startAt, endAt, params.data.id)) {
        return "overlap" as const;
      }
      await tx
        .update(timeBlocksTable)
        .set({ startAt, endAt, updatedAt: new Date() })
        .where(
          and(
            eq(timeBlocksTable.id, params.data.id),
            eq(timeBlocksTable.userId, req.userId!),
          ),
        );
      return blockWithTitle(tx, req.userId!, params.data.id);
    });

    if (!updated) {
      res.status(404).json({ error: "Time block not found" });
      return;
    }
    if (updated === "invalid") {
      res.status(400).json({ error: "endAt must be after startAt." });
      return;
    }
    if (updated === "overlap") {
      res.status(400).json({ error: "Overlapping time block." });
      return;
    }
    res.json(UpdateTaskBlockResponse.parse(updated));
  },
);

router.delete("/blocks/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteTaskBlockParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [block] = await runWithRls(req, async (tx) =>
    tx
      .delete(timeBlocksTable)
      .where(
        and(
          eq(timeBlocksTable.id, params.data.id),
          eq(timeBlocksTable.userId, req.userId!),
        ),
      )
      .returning({ id: timeBlocksTable.id }),
  );

  if (!block) {
    res.status(404).json({ error: "Time block not found" });
    return;
  }

  res.status(204).send();
});

export default router;
