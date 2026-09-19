/**
 * Reschedule engine rules (pure, every rule has a unit test).
 *
 * Corpus contracts honored here:
 * - Cap: 3 auto-moves per task by default, then flag "needs attention".
 * - Dial: off = flag only, ask = propose + confirm, auto = move + notify.
 * - Sweeps are batched; a task already flagged is never re-flagged or
 *   moved again until a human clears the flag (no thrash, no spam).
 * - A move shifts the due instant exactly +24h (deterministic, timezone
 *   free; a DST wall shift twice a year is accepted and documented).
 * - Inbox tasks with a due date are swept like open ones (they surface in
 *   Today via their due date); completed tasks and dateless tasks never are.
 */

export type AutomationMode = "off" | "ask" | "auto";

export interface SweepTask {
  id: number;
  status: string;
  dueAt: Date | null;
  rescheduleCount: number;
  needsAttention: boolean;
  automation: AutomationMode | null;
}

export interface SweepSettings {
  defaultMode: AutomationMode;
  maxMoves: number;
}

export interface Rule9Context {
  durationEstMin?: number | null;
  rule9Multiplier?: number | null;
}

export type RescheduleDecision =
  | { action: "move"; toDueAt: Date; rule9Multiplier?: number; effectiveDuration?: number }
  | { action: "propose"; toDueAt: Date; rule9Multiplier?: number; effectiveDuration?: number }
  | { action: "flag" }
  | { action: "skip" };

const DAY_MS = 24 * 3_600_000;

export function isOverdue(task: Pick<SweepTask, "status" | "dueAt">, now: Date): boolean {
  if (task.status !== "open" && task.status !== "inbox") return false;
  if (!task.dueAt) return false;
  return task.dueAt.getTime() < now.getTime();
}

export function nextDueAt(dueAt: Date): Date {
  return new Date(dueAt.getTime() + DAY_MS);
}

export function decideReschedule(
  task: SweepTask,
  settings: SweepSettings,
  now: Date,
  rule9Context?: Rule9Context,
): RescheduleDecision {
  if (!isOverdue(task, now)) return { action: "skip" };
  if (task.needsAttention) return { action: "skip" };
  const toDueAt = nextDueAt(task.dueAt as Date);
  if (task.rescheduleCount >= settings.maxMoves) return { action: "flag" };
  const mode = task.automation ?? settings.defaultMode;

  const rule9Multiplier = rule9Context?.rule9Multiplier;
  const effectiveDuration =
    rule9Multiplier && rule9Context?.durationEstMin
      ? Math.round(rule9Context.durationEstMin * rule9Multiplier)
      : undefined;

  const extra =
    rule9Multiplier && effectiveDuration
      ? { rule9Multiplier, effectiveDuration }
      : {};

  switch (mode) {
    case "off":
      return { action: "flag" };
    case "ask":
      return { action: "propose", toDueAt, ...extra };
    case "auto":
      return { action: "move", toDueAt, ...extra };
  }
}

/** Shared accept-time validity: the proposal target must still be open and
 *  under the cap. Used by both the HTTP accept endpoint and the Telegram
 *  accept command so the two surfaces can never diverge. */
export function canAcceptProposal(
  task: Pick<SweepTask, "status" | "rescheduleCount"> | null,
  maxMoves: number,
): { ok: true } | { ok: false; error: string } {
  if (!task) return { ok: false, error: "Task not found." };
  if (task.status === "completed") {
    return { ok: false, error: "Task is already completed." };
  }
  if (task.rescheduleCount >= maxMoves) {
    return { ok: false, error: "Move cap reached." };
  }
  return { ok: true };
}
