import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { rescheduleProposalsTable, rescheduleSettingsTable, tasksTable } from "@workspace/db";
import {
  AcceptRescheduleProposalParams,
  AcceptRescheduleProposalResponse,
  DeclineRescheduleProposalParams,
  DeclineRescheduleProposalResponse,
  GetRescheduleSettingsResponse,
  ListRescheduleProposalsResponse,
  UpdateRescheduleSettingsBody,
  UpdateRescheduleSettingsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { runWithRls } from "../lib/rls";
import { canAcceptProposal } from "../lib/reschedule";

const router: IRouter = Router();

router.get(
  "/reschedule/proposals",
  requireAuth,
  async (req, res): Promise<void> => {
    const proposals = await runWithRls(req, async (tx) =>
      tx
        .select()
        .from(rescheduleProposalsTable)
        .where(
          and(
            eq(rescheduleProposalsTable.userId, req.userId!),
            eq(rescheduleProposalsTable.status, "pending"),
          ),
        )
        .orderBy(asc(rescheduleProposalsTable.createdAt)),
    );

    res.json(ListRescheduleProposalsResponse.parse(proposals));
  },
);

router.post(
  "/reschedule/proposals/:id/accept",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = AcceptRescheduleProposalParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const result = await runWithRls(req, async (tx) => {
      const [proposal] = await tx
        .select()
        .from(rescheduleProposalsTable)
        .where(
          and(
            eq(rescheduleProposalsTable.id, params.data.id),
            eq(rescheduleProposalsTable.userId, req.userId!),
            eq(rescheduleProposalsTable.status, "pending"),
          ),
        );
      if (!proposal) return null;
      const [task] = await tx
        .select({
          id: tasksTable.id,
          status: tasksTable.status,
          rescheduleCount: tasksTable.rescheduleCount,
        })
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.id, proposal.taskId),
            eq(tasksTable.userId, req.userId!),
          ),
        );
      const [settings] = await tx
        .select({ maxMoves: rescheduleSettingsTable.maxMoves })
        .from(rescheduleSettingsTable)
        .where(eq(rescheduleSettingsTable.userId, req.userId!));
      const verdict = canAcceptProposal(task ?? null, settings?.maxMoves ?? 3);
      if (!task) {
        const [expired] = await tx
          .update(rescheduleProposalsTable)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(rescheduleProposalsTable.id, proposal.id))
          .returning();
        return { expired: true as const, error: "Task not found.", proposal: expired };
      }
      if (!verdict.ok) {
        const [expired] = await tx
          .update(rescheduleProposalsTable)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(rescheduleProposalsTable.id, proposal.id))
          .returning();
        await tx
          .update(tasksTable)
          .set({ needsAttention: true, updatedAt: new Date() })
          .where(eq(tasksTable.id, task.id));
        return { expired: true as const, error: verdict.error, proposal: expired };
      }
      await tx
        .update(tasksTable)
        .set({
          dueAt: proposal.toDue,
          rescheduleCount: task.rescheduleCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(tasksTable.id, task.id));
      const [accepted] = await tx
        .update(rescheduleProposalsTable)
        .set({ status: "accepted", updatedAt: new Date() })
        .where(eq(rescheduleProposalsTable.id, proposal.id))
        .returning();
      return { expired: false as const, proposal: accepted };
    });

    if (!result) {
      res.status(404).json({ error: "Proposal not found" });
      return;
    }
    if (result.expired) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(AcceptRescheduleProposalResponse.parse(result.proposal));
  },
);

router.post(
  "/reschedule/proposals/:id/decline",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = DeclineRescheduleProposalParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [proposal] = await runWithRls(req, async (tx) =>
      tx
        .update(rescheduleProposalsTable)
        .set({ status: "declined", updatedAt: new Date() })
        .where(
          and(
            eq(rescheduleProposalsTable.id, params.data.id),
            eq(rescheduleProposalsTable.userId, req.userId!),
            eq(rescheduleProposalsTable.status, "pending"),
          ),
        )
        .returning(),
    );

    if (!proposal) {
      res.status(404).json({ error: "Proposal not found" });
      return;
    }
    res.json(DeclineRescheduleProposalResponse.parse(proposal));
  },
);

router.get(
  "/settings/rescheduling",
  requireAuth,
  async (req, res): Promise<void> => {
    const settings = await runWithRls(req, async (tx) => {
      const [existing] = await tx
        .select()
        .from(rescheduleSettingsTable)
        .where(eq(rescheduleSettingsTable.userId, req.userId!));
      if (existing) return existing;
      const [created] = await tx
        .insert(rescheduleSettingsTable)
        .values({ userId: req.userId!, defaultMode: "ask", maxMoves: 5 })
        .returning();
      return created;
    });

    res.json(GetRescheduleSettingsResponse.parse(settings));
  },
);

router.patch(
  "/settings/rescheduling",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = UpdateRescheduleSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const settings = await runWithRls(req, async (tx) => {
      const updates: { defaultMode?: "off" | "ask" | "auto"; maxMoves?: number } = {};
      if (parsed.data.defaultMode !== undefined) {
        updates.defaultMode = parsed.data.defaultMode;
      }
      if (parsed.data.maxMoves !== undefined) {
        updates.maxMoves = parsed.data.maxMoves;
      }
      const [updated] = await tx
        .update(rescheduleSettingsTable)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(rescheduleSettingsTable.userId, req.userId!))
        .returning();
      if (updated) return updated;
      const [created] = await tx
        .insert(rescheduleSettingsTable)
        .values({ userId: req.userId!, defaultMode: "ask", maxMoves: 5, ...updates })
        .returning();
      return created;
    });

    res.json(UpdateRescheduleSettingsResponse.parse(settings));
  },
);

export default router;
