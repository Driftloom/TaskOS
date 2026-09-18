import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  focusSessionsTable,
  projectsTable,
  tagsTable,
  tasksTable,
  taskTagsTable,
  type DbTransaction,
} from "@workspace/db";
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
import { runWithRls } from "../lib/rls";
import { resolveDueInput } from "../lib/natural-date";
import { wouldCycle } from "../lib/subtasks";
import { dayBounds } from "../lib/date";

const router: IRouter = Router();

interface TaskTagRow {
  id: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Tags for a batch of tasks in one query. RLS alone cannot stop a caller
 *  from linking another user's task id (link rows key on their own user_id),
 *  so every write path verifies task/tag ownership before touching
 *  task_tags — this helper only ever reads. */
async function tagsForTasks(
  tx: DbTransaction,
  userId: string,
  taskIds: number[],
): Promise<Map<number, TaskTagRow[]>> {
  const byTask = new Map<number, TaskTagRow[]>();
  if (taskIds.length === 0) return byTask;
  const rows = await tx
    .select({
      taskId: taskTagsTable.taskId,
      id: tagsTable.id,
      name: tagsTable.name,
      createdAt: tagsTable.createdAt,
      updatedAt: tagsTable.updatedAt,
    })
    .from(taskTagsTable)
    .innerJoin(tagsTable, eq(taskTagsTable.tagId, tagsTable.id))
    .where(
      and(
        eq(taskTagsTable.userId, userId),
        inArray(taskTagsTable.taskId, taskIds),
      ),
    );
  for (const row of rows) {
    const list = byTask.get(row.taskId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    byTask.set(row.taskId, list);
  }
  return byTask;
}

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

  const tasks = await runWithRls(req, async (tx) =>
    tx
      .select()
      .from(tasksTable)
      .where(and(...conditions))
      .orderBy(desc(tasksTable.createdAt)),
  );
  const tagMap = await runWithRls(req, async (tx) =>
    tagsForTasks(
      tx,
      req.userId!,
      tasks.map((task) => task.id),
    ),
  );

  res.json(
    ListTasksResponse.parse(
      tasks.map((task) => ({ ...task, tags: tagMap.get(task.id) ?? [] })),
    ),
  );
});

router.post("/tasks", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const resolved = resolveDueInput({
    dueAt: parsed.data.dueAt ?? null,
    dueText: parsed.data.dueText ?? null,
    timezone: parsed.data.timezone,
  });
  if (resolved.kind === "error") {
    res.status(400).json({ error: resolved.error });
    return;
  }

  const projectId = parsed.data.projectId ?? null;
  if (projectId !== null) {
    const [project] = await runWithRls(req, async (tx) =>
      tx
        .select({ id: projectsTable.id })
        .from(projectsTable)
        .where(
          and(
            eq(projectsTable.id, projectId),
            eq(projectsTable.userId, req.userId!),
          ),
        ),
    );
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
  }

  const tagIds = [...new Set(parsed.data.tagIds ?? [])];
  if (tagIds.length > 0) {
    const owned = await runWithRls(req, async (tx) =>
      tx
        .select({ id: tagsTable.id })
        .from(tagsTable)
        .where(
          and(
            eq(tagsTable.userId, req.userId!),
            inArray(tagsTable.id, tagIds),
          ),
        ),
    );
    if (owned.length !== tagIds.length) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }
  }

  // New tasks have no descendants yet, so no cycle is possible — only the
  // parent's ownership is verified. (Self-parenting is impossible without
  // an id and is rejected by the DB CHECK regardless.)
  const parentId = parsed.data.parentId ?? null;
  if (parentId !== null) {
    const [parent] = await runWithRls(req, async (tx) =>
      tx
        .select({ id: tasksTable.id })
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.id, parentId),
            eq(tasksTable.userId, req.userId!),
          ),
        ),
    );
    if (!parent) {
      res.status(404).json({ error: "Parent task not found" });
      return;
    }
  }

  const [task] = await runWithRls(req, async (tx) =>
    tx
      .insert(tasksTable)
      .values({
        userId: req.userId!,
        title: parsed.data.title.trim(),
        notes: parsed.data.notes ?? null,
        dueAt: resolved.kind === "set" ? resolved.dueAt : null,
        durationMin: parsed.data.durationMin,
        priority: parsed.data.priority,
        status: parsed.data.status,
        projectId,
        parentId,
        automation: parsed.data.automation ?? null,
      })
      .returning(),
  );

  if (tagIds.length > 0) {
    await runWithRls(req, async (tx) =>
      tx.insert(taskTagsTable).values(
        tagIds.map((tagId) => ({
          taskId: task.id,
          tagId,
          userId: req.userId!,
        })),
      ),
    );
  }
  const tagMap = await runWithRls(req, async (tx) =>
    tagsForTasks(tx, req.userId!, [task.id]),
  );

  res.status(201).json(
    CreateTaskResponse.parse({ ...task, tags: tagMap.get(task.id) ?? [] }),
  );
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

  const { dueText, timezone, projectId, tagIds, parentId, ...dateFree } = parsed.data;
  const resolved = resolveDueInput({
    dueAt: dateFree.dueAt ?? null,
    dueText: dueText ?? null,
    timezone,
  });
  if (resolved.kind === "error") {
    res.status(400).json({ error: resolved.error });
    return;
  }

  if (projectId !== undefined && projectId !== null) {
    const [project] = await runWithRls(req, async (tx) =>
      tx
        .select({ id: projectsTable.id })
        .from(projectsTable)
        .where(
          and(
            eq(projectsTable.id, projectId),
            eq(projectsTable.userId, req.userId!),
          ),
        ),
    );
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
  }

  // A present array REPLACES the full set (empty array clears all);
  // omitted/null keeps what is there.
  const replaceTagIds =
    tagIds === undefined || tagIds === null ? null : [...new Set(tagIds)];
  if (replaceTagIds && replaceTagIds.length > 0) {
    const owned = await runWithRls(req, async (tx) =>
      tx
        .select({ id: tagsTable.id })
        .from(tagsTable)
        .where(
          and(
            eq(tagsTable.userId, req.userId!),
            inArray(tagsTable.id, replaceTagIds),
          ),
        ),
    );
    if (owned.length !== replaceTagIds.length) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }
  }

  const updates = Object.fromEntries(
    Object.entries(dateFree).filter(([, value]) => value !== undefined),
  );
  delete updates.dueAt;
  if (resolved.kind === "set") {
    updates.dueAt = resolved.dueAt;
  }
  if (projectId !== undefined) {
    updates.projectId = projectId;
  }

  if (parentId !== undefined) {
    if (parentId === null) {
      updates.parentId = null;
    } else {
      if (parentId === params.data.id) {
        res.status(400).json({ error: "A task cannot be its own parent." });
        return;
      }
      const [parent] = await runWithRls(req, async (tx) =>
        tx
          .select({ id: tasksTable.id })
          .from(tasksTable)
          .where(
            and(
              eq(tasksTable.id, parentId),
              eq(tasksTable.userId, req.userId!),
            ),
          ),
      );
      if (!parent) {
        res.status(404).json({ error: "Parent task not found" });
        return;
      }
      const cyclic = await runWithRls(req, async (tx) =>
        wouldCycle(params.data.id, parentId, async (id) => {
          const [row] = await tx
            .select({ parentId: tasksTable.parentId })
            .from(tasksTable)
            .where(
              and(
                eq(tasksTable.id, id),
                eq(tasksTable.userId, req.userId!),
              ),
            );
          return row?.parentId ?? null;
        }),
      );
      if (cyclic) {
        res
          .status(400)
          .json({ error: "Cyclic subtask assignment rejected." });
        return;
      }
      updates.parentId = parentId;
    }
  }

  const [task] = await runWithRls(req, async (tx) =>
    tx
      .update(tasksTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(
        and(eq(tasksTable.id, params.data.id), eq(tasksTable.userId, req.userId!)),
      )
      .returning(),
  );

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  if (replaceTagIds !== null) {
    await runWithRls(req, async (tx) => {
      await tx
        .delete(taskTagsTable)
        .where(
          and(
            eq(taskTagsTable.taskId, task.id),
            eq(taskTagsTable.userId, req.userId!),
          ),
        );
      if (replaceTagIds.length > 0) {
        await tx.insert(taskTagsTable).values(
          replaceTagIds.map((tagId) => ({
            taskId: task.id,
            tagId,
            userId: req.userId!,
          })),
        );
      }
    });
  }
  const tagMap = await runWithRls(req, async (tx) =>
    tagsForTasks(tx, req.userId!, [task.id]),
  );

  res.json(UpdateTaskResponse.parse({ ...task, tags: tagMap.get(task.id) ?? [] }));
});

router.delete("/tasks/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [task] = await runWithRls(req, async (tx) =>
    tx
      .delete(tasksTable)
      .where(
        and(eq(tasksTable.id, params.data.id), eq(tasksTable.userId, req.userId!)),
      )
      .returning({ id: tasksTable.id }),
  );

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
  const tasks = await runWithRls(req, async (tx) =>
    tx
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
      ),
  );

  const focusSessions = await runWithRls(req, async (tx) =>
    tx
      .select({ elapsedMinutes: focusSessionsTable.elapsedMinutes })
      .from(focusSessionsTable)
      .where(
        and(
          eq(focusSessionsTable.userId, req.userId!),
          gte(focusSessionsTable.startedAt, start),
          lt(focusSessionsTable.startedAt, end),
          inArray(focusSessionsTable.status, ["paused", "completed"]),
        ),
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