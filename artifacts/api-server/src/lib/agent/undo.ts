import { and, desc, eq } from "drizzle-orm";
import { agentActionLogTable, db, tasksTable } from "@workspace/db";

export interface UndoResult {
  success: boolean;
  action?: string;
  targetId?: number | null;
  restoredState?: any;
  error?: string;
}

/**
 * Reverts the most recent agent mutation logged in agent_action_log.
 * Satisfies Doc 09 Gap #2: "Expose an undo last agent action command in both
 * the chat panel and Telegram."
 */
export async function undoLastAgentAction(userId: string): Promise<UndoResult> {
  const [lastAction] = await db
    .select()
    .from(agentActionLogTable)
    .where(
      and(
        eq(agentActionLogTable.userId, userId),
        eq(agentActionLogTable.undone, false),
      ),
    )
    .orderBy(desc(agentActionLogTable.id))
    .limit(1);

  if (!lastAction) {
    return { success: false, error: "No reversible agent actions found." };
  }

  const { action, targetType, targetId, beforeState } = lastAction;

  if (targetType === "task" && targetId) {
    if (action === "create_task") {
      // Revert creation: delete the created task
      await db
        .delete(tasksTable)
        .where(and(eq(tasksTable.id, targetId), eq(tasksTable.userId, userId)));
    } else if (
      action === "update_task" ||
      action === "complete_task" ||
      action === "reschedule_task"
    ) {
      if (beforeState && typeof beforeState === "object") {
        const prev = beforeState as Record<string, any>;
        await db
          .update(tasksTable)
          .set({
            title: prev.title,
            dueAt: prev.dueAt ? new Date(prev.dueAt) : null,
            status: prev.status,
            priority: prev.priority,
            completedAt: prev.completedAt ? new Date(prev.completedAt) : null,
            rescheduleCount: prev.rescheduleCount ?? 0,
            needsAttention: prev.needsAttention ?? false,
            updatedAt: new Date(),
          })
          .where(and(eq(tasksTable.id, targetId), eq(tasksTable.userId, userId)));
      }
    }
  }

  // Mark action as undone
  await db
    .update(agentActionLogTable)
    .set({ undone: true })
    .where(eq(agentActionLogTable.id, lastAction.id));

  return {
    success: true,
    action,
    targetId,
    restoredState: beforeState,
  };
}
