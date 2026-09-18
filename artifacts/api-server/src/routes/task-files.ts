import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { taskFilesTable, tasksTable, type DbTransaction } from "@workspace/db";
import {
  CreateTaskFileBody,
  CreateTaskFileParams,
  CreateTaskFileResponse,
  DeleteTaskFileParams,
  ListTaskFilesParams,
  ListTaskFilesResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { runWithRls } from "../lib/rls";

const router: IRouter = Router();

async function ownedTaskId(
  tx: DbTransaction,
  userId: string,
  taskId: number,
): Promise<boolean> {
  const [task] = await tx
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(and(eq(tasksTable.id, taskId), eq(tasksTable.userId, userId)));
  return !!task;
}

router.get(
  "/tasks/:id/files",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListTaskFilesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const files = await runWithRls(req, async (tx) => {
      if (!(await ownedTaskId(tx, req.userId!, params.data.id))) return null;
      return tx
        .select()
        .from(taskFilesTable)
        .where(
          and(
            eq(taskFilesTable.taskId, params.data.id),
            eq(taskFilesTable.userId, req.userId!),
          ),
        )
        .orderBy(asc(taskFilesTable.createdAt));
    });

    if (!files) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json(ListTaskFilesResponse.parse(files));
  },
);

router.post(
  "/tasks/:id/files",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = CreateTaskFileParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = CreateTaskFileBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const name = parsed.data.name?.trim() ? parsed.data.name.trim() : null;
    if (parsed.data.name !== undefined && parsed.data.name !== null && !name) {
      res.status(400).json({ error: "File name must not be blank." });
      return;
    }

    const file = await runWithRls(req, async (tx) => {
      if (!(await ownedTaskId(tx, req.userId!, params.data.id))) return null;
      const [created] = await tx
        .insert(taskFilesTable)
        .values({
          userId: req.userId!,
          taskId: params.data.id,
          url: parsed.data.url.trim(),
          name,
        })
        .returning();
      return created;
    });

    if (!file) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.status(201).json(CreateTaskFileResponse.parse(file));
  },
);

router.delete("/files/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteTaskFileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [file] = await runWithRls(req, async (tx) =>
    tx
      .delete(taskFilesTable)
      .where(
        and(
          eq(taskFilesTable.id, params.data.id),
          eq(taskFilesTable.userId, req.userId!),
        ),
      )
      .returning({ id: taskFilesTable.id }),
  );

  if (!file) {
    res.status(404).json({ error: "File link not found" });
    return;
  }

  res.status(204).send();
});

export default router;
