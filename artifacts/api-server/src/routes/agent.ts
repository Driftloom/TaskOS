import { desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { agentActionLogTable, db, llmUsageTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { runAgentConversation } from "../lib/agent/engine";
import { undoLastAgentAction } from "../lib/agent/undo";
import { runWithRls } from "../lib/rls";

const router: IRouter = Router();

const ChatInputSchema = z.object({
  message: z.string().min(1),
  channel: z.enum(["app", "telegram"]).default("app"),
});

/**
 * Chat with the Cadence Agent (ReAct reasoning loop + memory context).
 */
router.post("/agent/chat", requireAuth, async (req, res): Promise<void> => {
  const parsed = ChatInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const output = await runAgentConversation({
    userId: req.userId!,
    message: parsed.data.message,
    channel: parsed.data.channel,
  });

  res.json(output);
});

/**
 * Undo the most recent agent action (Doc 09 Gap #2).
 */
router.post("/agent/undo", requireAuth, async (req, res): Promise<void> => {
  const result = await undoLastAgentAction(req.userId!);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result);
});

/**
 * List recent agent actions for audit and transparency.
 */
router.get("/agent/actions", requireAuth, async (req, res): Promise<void> => {
  const actions = await runWithRls(req, async (tx) => {
    return await tx
      .select()
      .from(agentActionLogTable)
      .where(eq(agentActionLogTable.userId, req.userId!))
      .orderBy(desc(agentActionLogTable.id))
      .limit(30);
  });

  res.json({ actions });
});

/**
 * Get current month token usage and spend estimation (Doc 08 Problem 5a).
 */
router.get("/agent/usage", requireAuth, async (req, res): Promise<void> => {
  const [usage] = await db
    .select({
      totalTokensIn: sql<number>`COALESCE(SUM(${llmUsageTable.tokensIn}), 0)::int`,
      totalTokensOut: sql<number>`COALESCE(SUM(${llmUsageTable.tokensOut}), 0)::int`,
      totalCostEstimateCents: sql<number>`COALESCE(SUM(${llmUsageTable.costEstimateCents}), 0)::real`,
      totalCalls: sql<number>`COUNT(*)::int`,
    })
    .from(llmUsageTable)
    .where(eq(llmUsageTable.userId, req.userId!));

  res.json({
    usage: {
      totalTokensIn: usage?.totalTokensIn ?? 0,
      totalTokensOut: usage?.totalTokensOut ?? 0,
      totalCostEstimateCents: usage?.totalCostEstimateCents ?? 0,
      totalCalls: usage?.totalCalls ?? 0,
      spendCeilingCents: 500, // ₹400–500 safety net ceiling
    },
  });
});

export default router;
