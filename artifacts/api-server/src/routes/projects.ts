import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { projectsTable } from "@workspace/db";
import {
  CreateProjectBody,
  CreateProjectResponse,
  DeleteProjectParams,
  ListProjectsResponse,
  UpdateProjectBody,
  UpdateProjectParams,
  UpdateProjectResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { runWithRls } from "../lib/rls";

const router: IRouter = Router();

router.get("/projects", requireAuth, async (req, res): Promise<void> => {
  const projects = await runWithRls(req, async (tx) =>
    tx
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.userId, req.userId!))
      .orderBy(asc(projectsTable.name)),
  );

  res.json(ListProjectsResponse.parse(projects));
});

router.post("/projects", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const name = parsed.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "Project name must not be blank." });
    return;
  }

  const [project] = await runWithRls(req, async (tx) =>
    tx
      .insert(projectsTable)
      .values({
        userId: req.userId!,
        name,
        color: parsed.data.color ?? null,
      })
      .returning(),
  );

  res.status(201).json(CreateProjectResponse.parse(project));
});

router.patch(
  "/projects/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UpdateProjectParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = UpdateProjectBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const updates: { name?: string; color?: string | null } = {};
    if (parsed.data.name !== undefined) {
      const name = parsed.data.name.trim();
      if (!name) {
        res.status(400).json({ error: "Project name must not be blank." });
        return;
      }
      updates.name = name;
    }
    if (parsed.data.color !== undefined) {
      updates.color = parsed.data.color;
    }

    const [project] = await runWithRls(req, async (tx) =>
      tx
        .update(projectsTable)
        .set({ ...updates, updatedAt: new Date() })
        .where(
          and(
            eq(projectsTable.id, params.data.id),
            eq(projectsTable.userId, req.userId!),
          ),
        )
        .returning(),
    );

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.json(UpdateProjectResponse.parse(project));
  },
);

router.delete(
  "/projects/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = DeleteProjectParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [project] = await runWithRls(req, async (tx) =>
      tx
        .delete(projectsTable)
        .where(
          and(
            eq(projectsTable.id, params.data.id),
            eq(projectsTable.userId, req.userId!),
          ),
        )
        .returning({ id: projectsTable.id }),
    );

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.status(204).send();
  },
);

export default router;
