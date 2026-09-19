import { and, desc, eq, inArray } from "drizzle-orm";
import {
  agentActionLogTable,
  db,
  tasksTable,
  timeBlocksTable,
  type Task,
} from "@workspace/db";

export interface ToolContext {
  userId: string;
  tx?: any;
}

export interface CreateTaskArgs {
  title: string;
  dueAt?: string | null;
  durationMin?: number;
  priority?: "low" | "medium" | "high" | "urgent";
  projectId?: number | null;
}

export interface UpdateTaskArgs {
  id: number;
  title?: string;
  dueAt?: string | null;
  priority?: "low" | "medium" | "high" | "urgent";
  status?: "open" | "in_progress" | "completed" | "canceled";
}

export interface BulkRescheduleArgs {
  taskIds: number[];
  targetDate: string; // ISO date string or YYYY-MM-DD
  confirmed?: boolean;
}

export const AGENT_TOOLS_DEFINITIONS = [
  {
    name: "create_task",
    description: "Create a new task with title, optional due date, duration, priority, and project.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        dueAt: { type: "string", description: "ISO date-time string when task is due" },
        durationMin: { type: "integer", description: "Estimated duration in minutes (default 30)" },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
        projectId: { type: "integer", description: "Optional project ID" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description: "Update an existing task's title, due date, priority, or status.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "integer", description: "Task ID" },
        title: { type: "string" },
        dueAt: { type: "string", description: "ISO date-time string or null" },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
        status: { type: "string", enum: ["open", "in_progress", "completed", "canceled"] },
      },
      required: ["id"],
    },
  },
  {
    name: "complete_task",
    description: "Mark a task as completed.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "integer", description: "Task ID to complete" },
      },
      required: ["id"],
    },
  },
  {
    name: "query_schedule",
    description: "Query tasks and time blocks scheduled for a specific date or date range.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Reference date in YYYY-MM-DD format" },
        rangeDays: { type: "integer", description: "Number of days forward to inspect (default 1)" },
      },
    },
  },
  {
    name: "bulk_reschedule",
    description: "Reschedule multiple tasks to a target date. Operations touching >10 tasks require explicit confirmation.",
    parameters: {
      type: "object",
      properties: {
        taskIds: { type: "array", items: { type: "integer" }, description: "Array of task IDs" },
        targetDate: { type: "string", description: "Target due date (ISO string or YYYY-MM-DD)" },
        confirmed: { type: "boolean", description: "Pass true to confirm bulk operations touching >10 tasks" },
      },
      required: ["taskIds", "targetDate"],
    },
  },
  {
    name: "undo_last_action",
    description: "Reverses the most recent agent mutation (task creation, update, completion, or reschedule) using before/after state diffs.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];

/**
 * Executes a tool with RLS context and automatic reversible diff logging.
 */
export async function executeAgentTool(
  toolName: string,
  args: any,
  ctx: ToolContext,
): Promise<{ success: boolean; data?: any; error?: string; requiresConfirmation?: boolean }> {
  const { userId } = ctx;

  switch (toolName) {
    case "create_task": {
      const { title, dueAt, durationMin, priority, projectId } = args as CreateTaskArgs;
      if (!title || typeof title !== "string" || !title.trim()) {
        return { success: false, error: "Task title is required." };
      }

      const [task] = await db
        .insert(tasksTable)
        .values({
          userId,
          title: title.trim(),
          dueAt: dueAt ? new Date(dueAt) : null,
          durationEstMin: durationMin ?? 30,
          priority: priority ?? "medium",
          projectId: projectId ?? null,
          status: "open",
        })
        .returning();

      // Log reversible action
      await db.insert(agentActionLogTable).values({
        userId,
        action: "create_task",
        targetType: "task",
        targetId: task.id,
        beforeState: null,
        afterState: task,
      });

      return { success: true, data: task };
    }

    case "update_task": {
      const { id, title, dueAt, priority, status } = args as UpdateTaskArgs;
      const [existing] = await db
        .select()
        .from(tasksTable)
        .where(and(eq(tasksTable.id, id), eq(tasksTable.userId, userId)));

      if (!existing) {
        return { success: false, error: `Task ${id} not found.` };
      }

      const updates: Partial<Task> = { updatedAt: new Date() };
      if (title !== undefined) updates.title = title.trim();
      if (dueAt !== undefined) updates.dueAt = dueAt ? new Date(dueAt) : null;
      if (priority !== undefined) updates.priority = priority;
      if (status !== undefined) {
        updates.status = status;
        if (status === "completed" && !existing.completedAt) {
          updates.completedAt = new Date();
        }
      }

      const [updated] = await db
        .update(tasksTable)
        .set(updates)
        .where(and(eq(tasksTable.id, id), eq(tasksTable.userId, userId)))
        .returning();

      // Log reversible action
      await db.insert(agentActionLogTable).values({
        userId,
        action: "update_task",
        targetType: "task",
        targetId: id,
        beforeState: existing,
        afterState: updated,
      });

      return { success: true, data: updated };
    }

    case "complete_task": {
      const id = Number(args.id);
      const [existing] = await db
        .select()
        .from(tasksTable)
        .where(and(eq(tasksTable.id, id), eq(tasksTable.userId, userId)));

      if (!existing) {
        return { success: false, error: `Task ${id} not found.` };
      }

      const [updated] = await db
        .update(tasksTable)
        .set({
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(tasksTable.id, id), eq(tasksTable.userId, userId)))
        .returning();

      await db.insert(agentActionLogTable).values({
        userId,
        action: "complete_task",
        targetType: "task",
        targetId: id,
        beforeState: existing,
        afterState: updated,
      });

      return { success: true, data: updated };
    }

    case "query_schedule": {
      const refDate = args.date ? new Date(args.date) : new Date();
      const rangeDays = args.rangeDays ?? 1;
      const startMs = refDate.setHours(0, 0, 0, 0);
      const endMs = startMs + rangeDays * 24 * 3600 * 1000;

      const tasks = await db
        .select()
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.userId, userId),
            eq(tasksTable.status, "open"),
          ),
        )
        .limit(50);

      const blocks = await db
        .select()
        .from(timeBlocksTable)
        .where(eq(timeBlocksTable.userId, userId))
        .limit(50);

      return { success: true, data: { tasks, blocks } };
    }

    case "bulk_reschedule": {
      const { taskIds, targetDate, confirmed } = args as BulkRescheduleArgs;
      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return { success: false, error: "taskIds must be a non-empty array." };
      }

      // INVIOLABLE RULE: Confirm before any bulk agent action touching >10 tasks (Doc 09 #2, Doc 10 §1)
      if (taskIds.length > 10 && !confirmed) {
        return {
          success: false,
          requiresConfirmation: true,
          error: "CONFIRMATION_REQUIRED",
          data: {
            message: `Action touches ${taskIds.length} tasks (threshold > 10). Explicit confirmation required before execution.`,
            affectedTaskCount: taskIds.length,
            targetDate,
          },
        };
      }

      const targetDue = new Date(targetDate);
      const tasksToMove = await db
        .select()
        .from(tasksTable)
        .where(and(eq(tasksTable.userId, userId), inArray(tasksTable.id, taskIds)));

      const movedTasks: Task[] = [];
      for (const t of tasksToMove) {
        const [updated] = await db
          .update(tasksTable)
          .set({ dueAt: targetDue, rescheduleCount: t.rescheduleCount + 1, updatedAt: new Date() })
          .where(eq(tasksTable.id, t.id))
          .returning();

        if (updated) {
          movedTasks.push(updated);
          await db.insert(agentActionLogTable).values({
            userId,
            action: "reschedule_task",
            targetType: "task",
            targetId: t.id,
            beforeState: t,
            afterState: updated,
          });
        }
      }

      return {
        success: true,
        data: {
          movedCount: movedTasks.length,
          targetDue: targetDue.toISOString(),
          tasks: movedTasks,
        },
      };
    }

    case "undo_last_action": {
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
        return { success: false, error: "No reversible agent actions found to undo." };
      }

      if (lastAction.action === "create_task") {
        if (lastAction.targetId) {
          await db
            .delete(tasksTable)
            .where(and(eq(tasksTable.id, lastAction.targetId), eq(tasksTable.userId, userId)));
        }
      } else if (
        lastAction.action === "update_task" ||
        lastAction.action === "complete_task" ||
        lastAction.action === "reschedule_task"
      ) {
        if (lastAction.targetId && lastAction.beforeState) {
          const prev = lastAction.beforeState as any;
          await db
            .update(tasksTable)
            .set({
              title: prev.title,
              dueAt: prev.dueAt ? new Date(prev.dueAt) : null,
              status: prev.status,
              priority: prev.priority,
              durationEstMin: prev.durationEstMin,
              rescheduleCount: prev.rescheduleCount,
              completedAt: prev.completedAt ? new Date(prev.completedAt) : null,
              updatedAt: new Date(),
            })
            .where(and(eq(tasksTable.id, lastAction.targetId), eq(tasksTable.userId, userId)));
        }
      }

      await db
        .update(agentActionLogTable)
        .set({ undone: true })
        .where(eq(agentActionLogTable.id, lastAction.id));

      return {
        success: true,
        data: {
          undoneAction: lastAction.action,
          targetId: lastAction.targetId,
          message: `Reversed action "${lastAction.action}" on target #${lastAction.targetId}.`,
        },
      };
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}
