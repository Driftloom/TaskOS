import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  monthlyGoalsTable,
  monthlyGoalSnapshotsTable,
  projectsTable,
  tagsTable,
} from "@workspace/db";
import {
  CarryGoalBody,
  CarryGoalParams,
  CarryGoalResponse,
  CreateGoalBody,
  CreateGoalResponse,
  DeleteGoalParams,
  DeleteGoalResponse,
  GetGoalBaselinesResponse,
  GetGoalHistoryResponse,
  GetMonthlyReviewResponse,
  ListGoalsQueryParams,
  ListGoalsResponse,
  UpdateGoalBody,
  UpdateGoalParams,
  UpdateGoalResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { runWithRls } from "../lib/rls";
import {
  computeBaselines,
  computeGoalActual,
  getUserTimezone,
} from "../lib/goals-metrics";
import {
  computeOnPace,
  currentMonthInZone,
  getDaysInMonth,
  getElapsedDays,
  resolveMonthWindow,
} from "../lib/month-window";

const router: IRouter = Router();

function getNextMonth(isoMonth: string): string {
  const [y, m] = isoMonth.split("-").map(Number);
  if (m === 12) {
    return `${y + 1}-01`;
  }
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

router.get("/goals", requireAuth, async (req, res): Promise<void> => {
  const parsedQuery = ListGoalsQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }

  const result = await runWithRls(req, async (tx) => {
    const tz = await getUserTimezone(tx, req.userId!);
    const month = parsedQuery.data.month || currentMonthInZone(tz);
    const window = resolveMonthWindow(month, tz);
    const totalDays = getDaysInMonth(month);
    const elapsedDays = getElapsedDays(month, tz);

    const goals = await tx
      .select()
      .from(monthlyGoalsTable)
      .where(
        and(
          eq(monthlyGoalsTable.userId, req.userId!),
          eq(monthlyGoalsTable.month, month),
        ),
      )
      .orderBy(monthlyGoalsTable.id);

    const enriched = await Promise.all(
      goals.map(async (g) => {
        const { actual, scopeDeleted, scopeLabel } = await computeGoalActual(
          tx,
          req.userId!,
          g,
          window,
          tz,
        );
        const { expectedSoFar, onPace, progress } = computeOnPace(
          g.target,
          actual,
          elapsedDays,
          totalDays,
        );
        return {
          id: g.id,
          title: g.title,
          month: g.month,
          metric: g.metric as any,
          target: g.target,
          actual,
          progress,
          onPace,
          expectedSoFar,
          scopeKind: g.scopeKind as any,
          scopeProjectId: g.scopeProjectId,
          scopeTagId: g.scopeTagId,
          scopeLabel,
          scopeDeleted,
          status: g.status as any,
          carriedFromId: g.carriedFromId,
          createdAt: g.createdAt,
          updatedAt: g.updatedAt,
        };
      }),
    );
    return enriched;
  });

  res.json(ListGoalsResponse.parse(result));
});

router.post("/goals", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateGoalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, month, metric, target, scopeKind, scopeProjectId, scopeTagId } =
    parsed.data;

  if (scopeKind === "global" && (scopeProjectId || scopeTagId)) {
    res.status(400).json({
      error: "Global goals must not specify a project or tag ID.",
    });
    return;
  }
  if (scopeKind === "project" && (!scopeProjectId || scopeTagId)) {
    res.status(400).json({
      error: "Project goals must specify a project ID and no tag ID.",
    });
    return;
  }
  if (scopeKind === "tag" && (!scopeTagId || scopeProjectId)) {
    res.status(400).json({
      error: "Tag goals must specify a tag ID and no project ID.",
    });
    return;
  }

  try {
    const created = await runWithRls(req, async (tx) => {
      const tz = await getUserTimezone(tx, req.userId!);
      if (scopeKind === "project" && scopeProjectId) {
        const [proj] = await tx
          .select({ id: projectsTable.id })
          .from(projectsTable)
          .where(
            and(
              eq(projectsTable.id, scopeProjectId),
              eq(projectsTable.userId, req.userId!),
            ),
          );
        if (!proj) {
          throw new Error("Project not found or not owned by user.");
        }
      }
      if (scopeKind === "tag" && scopeTagId) {
        const [tag] = await tx
          .select({ id: tagsTable.id })
          .from(tagsTable)
          .where(
            and(
              eq(tagsTable.id, scopeTagId),
              eq(tagsTable.userId, req.userId!),
            ),
          );
        if (!tag) {
          throw new Error("Tag not found or not owned by user.");
        }
      }

      const [row] = await tx
        .insert(monthlyGoalsTable)
        .values({
          userId: req.userId!,
          title: title.trim(),
          month,
          metric,
          target,
          scopeKind,
          scopeProjectId: scopeProjectId ?? null,
          scopeTagId: scopeTagId ?? null,
          status: "open",
        })
        .returning();

      const window = resolveMonthWindow(month, tz);
      const totalDays = getDaysInMonth(month);
      const elapsedDays = getElapsedDays(month, tz);
      const { actual, scopeDeleted, scopeLabel } = await computeGoalActual(
        tx,
        req.userId!,
        row,
        window,
        tz,
      );
      const { expectedSoFar, onPace, progress } = computeOnPace(
        row.target,
        actual,
        elapsedDays,
        totalDays,
      );

      return {
        id: row.id,
        title: row.title,
        month: row.month,
        metric: row.metric as any,
        target: row.target,
        actual,
        progress,
        onPace,
        expectedSoFar,
        scopeKind: row.scopeKind as any,
        scopeProjectId: row.scopeProjectId,
        scopeTagId: row.scopeTagId,
        scopeLabel,
        scopeDeleted,
        status: row.status as any,
        carriedFromId: row.carriedFromId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });

    res.status(201).json(CreateGoalResponse.parse(created));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create goal";
    res.status(400).json({ error: message });
  }
});

router.patch("/goals/:id", requireAuth, async (req, res): Promise<void> => {
  const parsedParams = UpdateGoalParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: parsedParams.error.message });
    return;
  }
  const parsedBody = UpdateGoalBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }

  const { title, target } = parsedBody.data;
  if (!title && target === undefined) {
    res.status(400).json({ error: "Nothing to update." });
    return;
  }

  const result = await runWithRls(req, async (tx) => {
    const [existing] = await tx
      .select()
      .from(monthlyGoalsTable)
      .where(
        and(
          eq(monthlyGoalsTable.id, parsedParams.data.id),
          eq(monthlyGoalsTable.userId, req.userId!),
        ),
      );
    if (!existing) {
      return { status: 404, error: "Goal not found." };
    }
    if (existing.status !== "open") {
      return { status: 400, error: "Cannot edit a closed goal." };
    }

    const updates: Partial<typeof monthlyGoalsTable.$inferInsert> = {};
    if (title) updates.title = title.trim();
    if (target !== undefined) updates.target = target;

    const [updated] = await tx
      .update(monthlyGoalsTable)
      .set(updates)
      .where(
        and(
          eq(monthlyGoalsTable.id, parsedParams.data.id),
          eq(monthlyGoalsTable.userId, req.userId!),
        ),
      )
      .returning();

    const tz = await getUserTimezone(tx, req.userId!);
    const window = resolveMonthWindow(updated.month, tz);
    const totalDays = getDaysInMonth(updated.month);
    const elapsedDays = getElapsedDays(updated.month, tz);
    const { actual, scopeDeleted, scopeLabel } = await computeGoalActual(
      tx,
      req.userId!,
      updated,
      window,
      tz,
    );
    const { expectedSoFar, onPace, progress } = computeOnPace(
      updated.target,
      actual,
      elapsedDays,
      totalDays,
    );

    return {
      data: {
        id: updated.id,
        title: updated.title,
        month: updated.month,
        metric: updated.metric as any,
        target: updated.target,
        actual,
        progress,
        onPace,
        expectedSoFar,
        scopeKind: updated.scopeKind as any,
        scopeProjectId: updated.scopeProjectId,
        scopeTagId: updated.scopeTagId,
        scopeLabel,
        scopeDeleted,
        status: updated.status as any,
        carriedFromId: updated.carriedFromId,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    };
  });

  if ("error" in result) {
    res.status(result.status ?? 400).json({ error: result.error });
    return;
  }

  res.json(UpdateGoalResponse.parse(result.data));
});

router.delete("/goals/:id", requireAuth, async (req, res): Promise<void> => {
  const parsedParams = DeleteGoalParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: parsedParams.error.message });
    return;
  }

  const result = await runWithRls(req, async (tx) => {
    const [existing] = await tx
      .select()
      .from(monthlyGoalsTable)
      .where(
        and(
          eq(monthlyGoalsTable.id, parsedParams.data.id),
          eq(monthlyGoalsTable.userId, req.userId!),
        ),
      );
    if (!existing) {
      return { status: 404, error: "Goal not found." };
    }
    if (existing.status !== "open") {
      return { status: 400, error: "Cannot delete a closed goal." };
    }

    await tx
      .delete(monthlyGoalsTable)
      .where(
        and(
          eq(monthlyGoalsTable.id, parsedParams.data.id),
          eq(monthlyGoalsTable.userId, req.userId!),
        ),
      );

    return { success: true };
  });

  if ("error" in result) {
    res.status(result.status ?? 400).json({ error: result.error });
    return;
  }

  res.json(DeleteGoalResponse.parse({ success: true }));
});

router.post("/goals/:id/carry", requireAuth, async (req, res): Promise<void> => {
  const parsedParams = CarryGoalParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: parsedParams.error.message });
    return;
  }
  const parsedBody = CarryGoalBody.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }

  const result = await runWithRls(req, async (tx) => {
    const [sourceGoal] = await tx
      .select()
      .from(monthlyGoalsTable)
      .where(
        and(
          eq(monthlyGoalsTable.id, parsedParams.data.id),
          eq(monthlyGoalsTable.userId, req.userId!),
        ),
      );
    if (!sourceGoal) {
      return { status: 404, error: "Source goal not found." };
    }

    const nextMonth = parsedBody.data.month || getNextMonth(sourceGoal.month);
    const newTitle = (parsedBody.data.title || sourceGoal.title).trim();
    const newTarget = parsedBody.data.target || sourceGoal.target;

    const tz = await getUserTimezone(tx, req.userId!);

    const [carried] = await tx
      .insert(monthlyGoalsTable)
      .values({
        userId: req.userId!,
        title: newTitle,
        month: nextMonth,
        metric: sourceGoal.metric,
        target: newTarget,
        scopeKind: sourceGoal.scopeKind,
        scopeProjectId: sourceGoal.scopeProjectId,
        scopeTagId: sourceGoal.scopeTagId,
        status: "open",
        carriedFromId: sourceGoal.id,
      })
      .returning();

    const window = resolveMonthWindow(nextMonth, tz);
    const totalDays = getDaysInMonth(nextMonth);
    const elapsedDays = getElapsedDays(nextMonth, tz);
    const { actual, scopeDeleted, scopeLabel } = await computeGoalActual(
      tx,
      req.userId!,
      carried,
      window,
      tz,
    );
    const { expectedSoFar, onPace, progress } = computeOnPace(
      carried.target,
      actual,
      elapsedDays,
      totalDays,
    );

    return {
      data: {
        id: carried.id,
        title: carried.title,
        month: carried.month,
        metric: carried.metric as any,
        target: carried.target,
        actual,
        progress,
        onPace,
        expectedSoFar,
        scopeKind: carried.scopeKind as any,
        scopeProjectId: carried.scopeProjectId,
        scopeTagId: carried.scopeTagId,
        scopeLabel,
        scopeDeleted,
        status: carried.status as any,
        carriedFromId: carried.carriedFromId,
        createdAt: carried.createdAt,
        updatedAt: carried.updatedAt,
      },
    };
  });

  if ("error" in result) {
    res.status(result.status ?? 400).json({ error: result.error });
    return;
  }

  res.status(201).json(CarryGoalResponse.parse(result.data));
});

router.get("/goals/baselines", requireAuth, async (req, res): Promise<void> => {
  const baselines = await runWithRls(req, async (tx) => {
    const tz = await getUserTimezone(tx, req.userId!);
    return computeBaselines(tx, req.userId!, tz);
  });

  res.json(GetGoalBaselinesResponse.parse(baselines));
});

router.get("/goals/review", requireAuth, async (req, res): Promise<void> => {
  const parsedQuery = ListGoalsQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }

  const review = await runWithRls(req, async (tx) => {
    const tz = await getUserTimezone(tx, req.userId!);
    const month = parsedQuery.data.month || currentMonthInZone(tz);
    const window = resolveMonthWindow(month, tz);
    const totalDays = getDaysInMonth(month);
    const elapsedDays = getElapsedDays(month, tz);

    const goals = await tx
      .select()
      .from(monthlyGoalsTable)
      .where(
        and(
          eq(monthlyGoalsTable.userId, req.userId!),
          eq(monthlyGoalsTable.month, month),
        ),
      )
      .orderBy(monthlyGoalsTable.id);

    const enrichedGoals = await Promise.all(
      goals.map(async (g) => {
        const { actual, scopeDeleted, scopeLabel } = await computeGoalActual(
          tx,
          req.userId!,
          g,
          window,
          tz,
        );
        const { expectedSoFar, onPace, progress } = computeOnPace(
          g.target,
          actual,
          elapsedDays,
          totalDays,
        );
        return {
          id: g.id,
          title: g.title,
          month: g.month,
          metric: g.metric as any,
          target: g.target,
          actual,
          progress,
          onPace,
          expectedSoFar,
          scopeKind: g.scopeKind as any,
          scopeProjectId: g.scopeProjectId,
          scopeTagId: g.scopeTagId,
          scopeLabel,
          scopeDeleted,
          status: g.status as any,
          carriedFromId: g.carriedFromId,
          createdAt: g.createdAt,
          updatedAt: g.updatedAt,
        };
      }),
    );

    const totalGoals = enrichedGoals.length;
    const achievedGoals = enrichedGoals.filter((g) => g.actual >= g.target).length;
    const missedGoals = totalGoals - achievedGoals;
    const completionRate =
      totalGoals > 0
        ? Number(((achievedGoals / totalGoals) * 100).toFixed(1))
        : 0;
    const carryCandidates = enrichedGoals.filter((g) => g.actual < g.target);

    return {
      month,
      totalGoals,
      achievedGoals,
      missedGoals,
      completionRate,
      goals: enrichedGoals,
      carryCandidates,
    };
  });

  res.json(GetMonthlyReviewResponse.parse(review));
});

router.get("/goals/history", requireAuth, async (req, res): Promise<void> => {
  const snapshots = await runWithRls(req, async (tx) => {
    return tx
      .select()
      .from(monthlyGoalSnapshotsTable)
      .where(eq(monthlyGoalSnapshotsTable.userId, req.userId!))
      .orderBy(
        desc(monthlyGoalSnapshotsTable.month),
        desc(monthlyGoalSnapshotsTable.id),
      );
  });

  res.json(
    GetGoalHistoryResponse.parse({
      snapshots: snapshots.map((s) => ({
        id: s.id,
        goalId: s.goalId,
        month: s.month,
        title: s.title,
        metric: s.metric as any,
        target: s.target,
        finalActual: s.finalActual,
        achieved: s.achieved,
        scopeKind: s.scopeKind,
        scopeLabel: s.scopeLabel,
        closedAt: s.closedAt,
      })),
    }),
  );
});

export default router;
