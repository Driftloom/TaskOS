import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { memoryFactsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { runWithRls } from "../lib/rls";

const router: IRouter = Router();

const CreateMemoryFactSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  category: z
    .enum(["procrastination", "channel", "soft_commitment", "hackathon", "chronotype", "custom"])
    .default("custom"),
  source: z.enum(["behavioral", "conversational"]).default("conversational"),
  confidence: z.number().int().min(0).max(100).default(75),
  rule9Multiplier: z.number().optional().nullable(),
  value: z.record(z.string(), z.any()).default({}),
});

const UpdateMemoryFactSchema = z.object({
  title: z.string().min(1).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  archived: z.boolean().optional(),
  rule9Multiplier: z.number().optional().nullable(),
});

/**
 * List memory facts for the authenticated user (What Cadence Knows About Me).
 */
router.get("/memory/facts", requireAuth, async (req, res): Promise<void> => {
  const category = req.query.category as string | undefined;
  const includeArchived = req.query.archived === "true";

  const facts = await runWithRls(req, async (tx) => {
    const conditions = [eq(memoryFactsTable.userId, req.userId!)];
    if (category && category !== "all") {
      conditions.push(eq(memoryFactsTable.category, category));
    }
    if (!includeArchived) {
      conditions.push(eq(memoryFactsTable.archived, false));
    }

    return await tx
      .select()
      .from(memoryFactsTable)
      .where(and(...conditions))
      .orderBy(desc(memoryFactsTable.confidence));
  });

  res.json({ facts });
});

/**
 * Manually add a memory fact.
 */
router.post("/memory/facts", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateMemoryFactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const fact = await runWithRls(req, async (tx) => {
    const [created] = await tx
      .insert(memoryFactsTable)
      .values({
        userId: req.userId!,
        key: parsed.data.key,
        title: parsed.data.title,
        category: parsed.data.category,
        source: parsed.data.source,
        confidence: parsed.data.confidence,
        rule9Multiplier: parsed.data.rule9Multiplier ?? null,
        value: parsed.data.value,
        pendingConfirmation: false,
      })
      .returning();
    return created;
  });

  res.status(201).json({ fact });
});

/**
 * Update an existing memory fact (edit title, confidence, or toggle archived).
 */
router.patch("/memory/facts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid fact ID" });
    return;
  }

  const parsed = UpdateMemoryFactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updated = await runWithRls(req, async (tx) => {
    const [fact] = await tx
      .update(memoryFactsTable)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
      })
      .where(and(eq(memoryFactsTable.id, id), eq(memoryFactsTable.userId, req.userId!)))
      .returning();
    return fact;
  });

  if (!updated) {
    res.status(404).json({ error: "Memory fact not found." });
    return;
  }

  res.json({ fact: updated });
});

/**
 * Delete a memory fact.
 */
router.delete("/memory/facts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid fact ID" });
    return;
  }

  const deleted = await runWithRls(req, async (tx) => {
    const [fact] = await tx
      .delete(memoryFactsTable)
      .where(and(eq(memoryFactsTable.id, id), eq(memoryFactsTable.userId, req.userId!)))
      .returning();
    return fact;
  });

  if (!deleted) {
    res.status(404).json({ error: "Memory fact not found." });
    return;
  }

  res.json({ success: true });
});

/**
 * List pending confirmation facts (Source B conversational inferences).
 */
router.get("/memory/confirmations", requireAuth, async (req, res): Promise<void> => {
  const confirmations = await runWithRls(req, async (tx) => {
    return await tx
      .select()
      .from(memoryFactsTable)
      .where(
        and(
          eq(memoryFactsTable.userId, req.userId!),
          eq(memoryFactsTable.pendingConfirmation, true),
        ),
      );
  });

  res.json({ confirmations });
});

/**
 * Approve a pending conversational inference (promotes to confirmed fact).
 */
router.post("/memory/confirmations/:id/approve", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const updated = await runWithRls(req, async (tx) => {
    const [fact] = await tx
      .update(memoryFactsTable)
      .set({
        pendingConfirmation: false,
        confidence: 85,
        lastReinforcedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(memoryFactsTable.id, id), eq(memoryFactsTable.userId, req.userId!)))
      .returning();
    return fact;
  });

  if (!updated) {
    res.status(404).json({ error: "Confirmation not found." });
    return;
  }

  res.json({ fact: updated });
});

/**
 * Decline a pending conversational inference (archives it).
 */
router.post("/memory/confirmations/:id/decline", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const updated = await runWithRls(req, async (tx) => {
    const [fact] = await tx
      .update(memoryFactsTable)
      .set({
        pendingConfirmation: false,
        archived: true,
        updatedAt: new Date(),
      })
      .where(and(eq(memoryFactsTable.id, id), eq(memoryFactsTable.userId, req.userId!)))
      .returning();
    return fact;
  });

  if (!updated) {
    res.status(404).json({ error: "Confirmation not found." });
    return;
  }

  res.json({ success: true, fact: updated });
});

export default router;
