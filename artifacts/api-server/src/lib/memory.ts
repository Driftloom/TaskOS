import { and, eq, sql } from "drizzle-orm";
import {
  db,
  focusSessionsTable,
  memoryFactsTable,
  tasksTable,
  type MemoryFact,
} from "@workspace/db";

export interface SourceAAnalysisResult {
  userId: string;
  durationMultipliersCreated: number;
  factsReinforced: number;
  factsDecayed: number;
  patternsDetected: Array<{
    key: string;
    multiplier: number;
    evidenceCount: number;
  }>;
}

/**
 * Calculates effective confidence after exponential time decay.
 * C_effective = max(10, round(C * e^(-0.02 * daysElapsed)))
 */
export function calculateDecayedConfidence(
  initialConfidence: number,
  lastReinforcedAt: Date,
  now: Date = new Date(),
): number {
  const diffMs = now.getTime() - lastReinforcedAt.getTime();
  const daysElapsed = Math.max(0, diffMs / (1000 * 60 * 60 * 24));
  const decayed = Math.round(initialConfidence * Math.exp(-0.02 * daysElapsed));
  return Math.max(10, Math.min(100, decayed));
}

/**
 * Source A Behavioral Arithmetic Engine (Doc 11 §2.2):
 * Runs pure SQL arithmetic comparing tasks.durationEstMin against actual
 * elapsed minutes in focus_sessions. Zero LLM hallucinations.
 * Auto-updates and reinforces facts without user confirmation.
 */
export async function computeSourceAArithmetic(
  userId: string,
  now: Date = new Date(),
): Promise<SourceAAnalysisResult> {
  // Query completed tasks with their total logged focus duration
  const taskRows = await db
    .select({
      taskId: tasksTable.id,
      title: tasksTable.title,
      durationEstMin: tasksTable.durationEstMin,
      totalElapsedSeconds: sql<number>`COALESCE(SUM(${focusSessionsTable.elapsedSeconds}), 0)::int`,
    })
    .from(tasksTable)
    .leftJoin(focusSessionsTable, eq(tasksTable.id, focusSessionsTable.taskId))
    .where(and(eq(tasksTable.userId, userId), eq(tasksTable.status, "completed")))
    .groupBy(tasksTable.id, tasksTable.title, tasksTable.durationEstMin);

  let durationMultipliersCreated = 0;
  let factsReinforced = 0;
  const patternsDetected: Array<{
    key: string;
    multiplier: number;
    evidenceCount: number;
  }> = [];

  // Group by title keyword or overall general work pattern
  const tasksWithFocus = taskRows.filter(
    (t) => t.durationEstMin && t.durationEstMin > 0 && t.totalElapsedSeconds > 60,
  );

  if (tasksWithFocus.length >= 2) {
    let sumEst = 0;
    let sumActual = 0;

    for (const t of tasksWithFocus) {
      sumEst += t.durationEstMin ?? 30;
      sumActual += Math.round(t.totalElapsedSeconds / 60);
    }

    const overallRatio = Math.round((sumActual / sumEst) * 10) / 10;

    if (overallRatio >= 1.2 || overallRatio <= 0.8) {
      const key = "overall_task_duration_multiplier";
      const title =
        overallRatio > 1.0
          ? `Tasks run ${overallRatio}x longer than estimated`
          : `Tasks finish in ${overallRatio}x of estimated time`;

      const confidence = Math.min(95, 60 + tasksWithFocus.length * 5);

      const [existing] = await db
        .select()
        .from(memoryFactsTable)
        .where(and(eq(memoryFactsTable.userId, userId), eq(memoryFactsTable.key, key)));

      if (existing) {
        await db
          .update(memoryFactsTable)
          .set({
            title,
            confidence,
            evidenceCount: tasksWithFocus.length,
            rule9Multiplier: overallRatio,
            value: {
              multiplier: overallRatio,
              sampleSize: tasksWithFocus.length,
              totalEstMin: sumEst,
              totalActualMin: sumActual,
            },
            lastReinforcedAt: now,
            updatedAt: now,
          })
          .where(eq(memoryFactsTable.id, existing.id));
        factsReinforced += 1;
      } else {
        await db.insert(memoryFactsTable).values({
          userId,
          key,
          title,
          category: overallRatio > 1.3 ? "procrastination" : "chronotype",
          source: "behavioral",
          confidence,
          evidenceCount: tasksWithFocus.length,
          rule9Multiplier: overallRatio,
          value: {
            multiplier: overallRatio,
            sampleSize: tasksWithFocus.length,
            totalEstMin: sumEst,
            totalActualMin: sumActual,
          },
          lastReinforcedAt: now,
        });
        durationMultipliersCreated += 1;
      }

      patternsDetected.push({
        key,
        multiplier: overallRatio,
        evidenceCount: tasksWithFocus.length,
      });
    }
  }

  // Decay older facts based on elapsed time
  const allUserFacts = await db
    .select()
    .from(memoryFactsTable)
    .where(and(eq(memoryFactsTable.userId, userId), eq(memoryFactsTable.archived, false)));

  let factsDecayed = 0;
  for (const fact of allUserFacts) {
    const decayedConfidence = calculateDecayedConfidence(
      fact.confidence,
      fact.lastReinforcedAt,
      now,
    );
    if (decayedConfidence !== fact.confidence) {
      const shouldArchive = decayedConfidence < 35 && fact.source === "behavioral";
      await db
        .update(memoryFactsTable)
        .set({
          confidence: decayedConfidence,
          archived: shouldArchive ? true : fact.archived,
          updatedAt: now,
        })
        .where(eq(memoryFactsTable.id, fact.id));
      factsDecayed += 1;
    }
  }

  return {
    userId,
    durationMultipliersCreated,
    factsReinforced,
    factsDecayed,
    patternsDetected,
  };
}

/**
 * Retrieves relevant active memory facts for scheduling or prompt context.
 * Prioritizes high-confidence and query-matching facts.
 */
export async function getRelevantMemoryFacts(
  userId: string,
  filterCategory?: string,
): Promise<MemoryFact[]> {
  const query = db
    .select()
    .from(memoryFactsTable)
    .where(
      filterCategory
        ? and(
            eq(memoryFactsTable.userId, userId),
            eq(memoryFactsTable.category, filterCategory),
            eq(memoryFactsTable.archived, false),
          )
        : and(
            eq(memoryFactsTable.userId, userId),
            eq(memoryFactsTable.archived, false),
          ),
    )
    .orderBy(sql`${memoryFactsTable.confidence} DESC`);

  return await query;
}
