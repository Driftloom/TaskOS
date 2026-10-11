import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import {
  agentActionLogTable,
  db,
  llmCredentialsTable,
  tasksTable,
  timeBlocksTable,
  type Task,
} from "@workspace/db";
import {
  inferProviderFromModel,
  PROVIDER_PRESETS,
  type ProviderId,
} from "./providers";

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
  {
    name: "create_time_block",
    description: "Schedule a task into a specific calendar time block [startAt, endAt).",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "integer", description: "Task ID to schedule" },
        startAt: { type: "string", description: "ISO date-time string when block starts" },
        endAt: { type: "string", description: "ISO date-time string when block ends" },
      },
      required: ["taskId", "startAt", "endAt"],
    },
  },
  {
    name: "switch_model",
    description: "Switch the active AI reasoning model or provider (e.g. 'gemini-2.0-flash', 'gemini-1.5-pro', 'llama-3.3-70b-versatile', 'meta/llama-3.1-70b-instruct').",
    parameters: {
      type: "object",
      properties: {
        model: {
          type: "string",
          description: "Target model identifier (e.g. 'gemini-2.0-flash', 'gemini-1.5-pro', 'llama-3.3-70b-versatile', 'meta/llama-3.1-70b-instruct').",
        },
        provider: {
          type: "string",
          enum: ["gemini", "nvidia_nim", "groq", "openrouter", "custom"],
          description: "Optional provider identifier. If omitted, will be inferred from the model identifier.",
        },
      },
      required: ["model"],
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
          durationMin: durationMin ?? 30,
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
      // `setHours` mutates, so read startMs before the second setHours would
      // otherwise be misread as a separate day boundary.
      const startDate = new Date(refDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + rangeDays);

      // The window is actually applied now. Previously startMs/endMs were
      // computed and discarded, so the query ignored the requested date and
      // always returned every open task regardless of when it was asked.
      const tasks = await db
        .select()
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.userId, userId),
            eq(tasksTable.status, "open"),
            gte(tasksTable.dueAt, startDate),
            lt(tasksTable.dueAt, endDate),
          ),
        )
        .limit(50);

      const blocks = await db
        .select()
        .from(timeBlocksTable)
        .where(
          and(
            eq(timeBlocksTable.userId, userId),
            gte(timeBlocksTable.startAt, startDate),
            lt(timeBlocksTable.startAt, endDate),
          ),
        )
        .limit(50);

      return { success: true, data: { tasks, blocks, window: { start: startDate.toISOString(), end: endDate.toISOString() } } };
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
      } else if (lastAction.action === "create_time_block") {
        if (lastAction.targetId) {
          await db
            .delete(timeBlocksTable)
            .where(and(eq(timeBlocksTable.id, lastAction.targetId), eq(timeBlocksTable.userId, userId)));
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
              durationMin: prev.durationMin,
              rescheduleCount: prev.rescheduleCount,
              completedAt: prev.completedAt ? new Date(prev.completedAt) : null,
              updatedAt: new Date(),
            })
            .where(and(eq(tasksTable.id, lastAction.targetId), eq(tasksTable.userId, userId)));
        }
      } else if (lastAction.action === "switch_model") {
        if (lastAction.targetId && lastAction.beforeState) {
          const prev = lastAction.beforeState as any;
          if (prev.model) {
            await db
              .update(llmCredentialsTable)
              .set({ model: prev.model, updatedAt: new Date() })
              .where(
                and(
                  eq(llmCredentialsTable.id, lastAction.targetId),
                  eq(llmCredentialsTable.userId, userId),
                ),
              );
          }
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

    case "create_time_block": {
      const { taskId, startAt, endAt } = args as { taskId: number; startAt: string; endAt: string };
      if (!taskId || !startAt || !endAt) {
        return { success: false, error: "taskId, startAt, and endAt are required." };
      }

      const startDate = new Date(startAt);
      const endDate = new Date(endAt);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return { success: false, error: "Invalid date format for startAt or endAt." };
      }
      if (endDate <= startDate) {
        return { success: false, error: "endAt must be after startAt." };
      }

      const [task] = await db
        .select()
        .from(tasksTable)
        .where(and(eq(tasksTable.id, taskId), eq(tasksTable.userId, userId)));

      if (!task) {
        return { success: false, error: `Task #${taskId} not found.` };
      }

      const [block] = await db
        .insert(timeBlocksTable)
        .values({
          userId,
          taskId,
          startAt: startDate,
          endAt: endDate,
        })
        .returning();

      await db.insert(agentActionLogTable).values({
        userId,
        action: "create_time_block",
        targetType: "time_block",
        targetId: block.id,
        beforeState: null,
        afterState: block,
      });

      return { success: true, data: block };
    }

    case "switch_model": {
      const { model, provider: rawProvider } = args as { model?: string; provider?: string };
      if (!model || typeof model !== "string" || !model.trim()) {
        return { success: false, error: "Model identifier is required." };
      }
      const targetModel = model.trim();
      const targetProvider = (rawProvider?.trim() || inferProviderFromModel(targetModel)) as ProviderId;

      // Check user's configured credentials
      const userCreds = await db
        .select()
        .from(llmCredentialsTable)
        .where(eq(llmCredentialsTable.userId, userId));

      // Match target provider, or if user has exactly 1 provider configured and didn't specify a provider, use that
      let targetCred = userCreds.find((c) => c.provider === targetProvider);
      if (!targetCred && userCreds.length === 1 && !rawProvider) {
        targetCred = userCreds[0];
      }

      if (!targetCred) {
        const preset = PROVIDER_PRESETS.find((p) => p.id === targetProvider);
        const providerName = preset?.label ?? targetProvider;
        return {
          success: false,
          error: `Provider "${providerName}" has no API key configured. You can add your API key in Settings > AI Co-Pilot (BYOK) to use ${targetModel}.`,
        };
      }

      const prevModel =
        targetCred.model ??
        PROVIDER_PRESETS.find((p) => p.id === targetCred.provider)?.defaultModel ??
        "default";

      const [updated] = await db
        .update(llmCredentialsTable)
        .set({ model: targetModel, updatedAt: new Date() })
        .where(eq(llmCredentialsTable.id, targetCred.id))
        .returning();

      // Log reversible action
      await db.insert(agentActionLogTable).values({
        userId,
        action: "switch_model",
        targetType: "llm_credential",
        targetId: targetCred.id,
        beforeState: { provider: targetCred.provider, model: prevModel },
        afterState: { provider: targetCred.provider, model: targetModel },
      });

      return {
        success: true,
        data: {
          provider: targetCred.provider,
          model: targetModel,
          previousModel: prevModel,
          message: `Switched active AI model to ${targetModel} (${targetCred.provider}).`,
        },
      };
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}
