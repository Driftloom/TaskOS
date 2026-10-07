import { and, desc, eq, sql } from "drizzle-orm";
import {
  agentConversationsTable,
  db,
  llmUsageTable,
  notificationSettingsTable,
  tasksTable,
  timeBlocksTable,
  type MemoryFact,
} from "@workspace/db";
import { getRelevantMemoryFacts } from "../memory";
import {
  AGENT_TOOLS_DEFINITIONS,
  executeAgentTool,
  type ToolContext,
} from "./tools";
import {
  classifyAgentIntent,
  generateScheduleClarification,
} from "./intent";

export interface AgentChatInput {
  userId: string;
  message: string;
  channel?: "app" | "telegram";
}

export interface AgentChatOutput {
  reply: string;
  toolCallsExecuted: Array<{
    name: string;
    arguments: any;
    result: any;
  }>;
  memoryApplied: Array<{
    key: string;
    title: string;
    confidence: number;
    rule9Multiplier?: number | null;
  }>;
  spendAlert?: {
    totalMonthCostCents: number;
    exceededCeiling: boolean;
  };
}

export const MONTHLY_SPEND_CEILING_CENTS = 500; // ~₹400–500 / month ($5 USD)

export interface DynamicAgentContext {
  userId: string;
  timeZone: string;
  currentTimeFormatted: string;
  currentDateIso: string;
  tomorrowDateFormatted: string;
  tomorrowDateIso: string;
  workHours: {
    start: number;
    end: number;
    flexible24h: boolean;
  };
  openTasks: Array<{
    id: number;
    title: string;
    priority?: string;
    durationMin?: number;
    dueAt?: string | null;
  }>;
  scheduledTimeBlocks: Array<{
    id: number;
    taskId: number;
    startAt: string;
    endAt: string;
  }>;
  memoryFacts: MemoryFact[];
  recentHistory: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  lastAssistantMessage?: string;
}

/**
 * Assembles live dynamic context from real-time database state:
 * - User timezone & wall-clock time
 * - Working hours & rhythm
 * - Live open backlog tasks with durations & priorities
 * - Live scheduled calendar time blocks for today & tomorrow
 * - Active behavioral memory facts (Rule 9 duration calibration)
 * - Multi-turn conversational transcript
 */
export async function assembleAgentContext(userId: string): Promise<DynamicAgentContext> {
  // 1. Behavioral Memory Facts
  let memoryFacts: MemoryFact[] = [];
  try {
    memoryFacts = await getRelevantMemoryFacts(userId);
  } catch {
    memoryFacts = [];
  }

  // 2. Recent conversation history and last assistant message
  let recentHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
  let lastAssistantMessage: string | undefined;
  try {
    const rawConversations = await db
      .select({
        role: agentConversationsTable.role,
        content: agentConversationsTable.content,
      })
      .from(agentConversationsTable)
      .where(eq(agentConversationsTable.userId, userId))
      .orderBy(desc(agentConversationsTable.id))
      .limit(6);

    const reversed = rawConversations
      .filter((r) => r.role === "user" || r.role === "assistant")
      .reverse();

    recentHistory = reversed as Array<{ role: "user" | "assistant"; content: string }>;
    const lastAssistant = rawConversations.find((r) => r.role === "assistant");
    if (lastAssistant) {
      lastAssistantMessage = lastAssistant.content;
    }
  } catch {
    recentHistory = [];
  }

  // 3. User notification & timezone settings
  let timeZone = "Asia/Kolkata";
  let workStart = 9;
  let workEnd = 18;
  let flexible24h = true;
  try {
    const [settings] = await db
      .select()
      .from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.userId, userId))
      .limit(1);
    if (settings) {
      if (settings.timeZone) timeZone = settings.timeZone;
      if (settings.workStart !== undefined) workStart = settings.workStart;
      if (settings.workEnd !== undefined) workEnd = settings.workEnd;
      if (settings.flexible24h !== undefined) flexible24h = settings.flexible24h;
    }
  } catch {
    // default
  }

  // 4. Real-time clock and calendar calculations
  const now = new Date();
  let currentTimeFormatted = "";
  try {
    currentTimeFormatted = new Intl.DateTimeFormat("en-US", {
      timeZone,
      dateStyle: "full",
      timeStyle: "short",
    }).format(now);
  } catch {
    currentTimeFormatted = now.toUTCString();
    timeZone = "UTC";
  }

  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  let tomorrowDateFormatted = "";
  try {
    tomorrowDateFormatted = new Intl.DateTimeFormat("en-US", {
      timeZone,
      dateStyle: "full",
    }).format(tomorrow);
  } catch {
    tomorrowDateFormatted = tomorrow.toDateString();
  }

  // 5. Live open backlog tasks
  let openTasks: DynamicAgentContext["openTasks"] = [];
  try {
    const tasks = await db
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.userId, userId), eq(tasksTable.status, "open")))
      .limit(10);
    openTasks = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority ?? "medium",
      durationMin: t.durationMin ?? 30,
      dueAt: t.dueAt ? new Date(t.dueAt).toISOString() : null,
    }));
  } catch {
    openTasks = [];
  }

  // 6. Scheduled calendar time blocks
  let scheduledTimeBlocks: DynamicAgentContext["scheduledTimeBlocks"] = [];
  try {
    const blocks = await db
      .select()
      .from(timeBlocksTable)
      .where(eq(timeBlocksTable.userId, userId))
      .limit(10);
    scheduledTimeBlocks = blocks.map((b) => ({
      id: b.id,
      taskId: b.taskId,
      startAt: new Date(b.startAt).toISOString(),
      endAt: new Date(b.endAt).toISOString(),
    }));
  } catch {
    scheduledTimeBlocks = [];
  }

  return {
    userId,
    timeZone,
    currentTimeFormatted,
    currentDateIso: now.toISOString(),
    tomorrowDateFormatted,
    tomorrowDateIso: tomorrow.toISOString(),
    workHours: { start: workStart, end: workEnd, flexible24h },
    openTasks,
    scheduledTimeBlocks,
    memoryFacts,
    recentHistory,
    lastAssistantMessage,
  };
}

/**
 * Generates an enterprise-grounded system prompt embedding live user context,
 * cognitive psychology guidelines (CLT, Zeigarnik, Ultradian Rhythms), and
 * inviolable safety rules (Rule 1, Rule 7, Rule 9, D-05).
 */
export function formatDynamicSystemPrompt(ctx: DynamicAgentContext): string {
  const taskList =
    ctx.openTasks.length > 0
      ? ctx.openTasks
          .map(
            (t) =>
              `- #${t.id}: "${t.title}" [Priority: ${t.priority ?? "medium"}, Est: ${t.durationMin ?? 30}m${t.dueAt ? `, Due: ${t.dueAt}` : ""}]`,
          )
          .join("\n")
      : "No open backlog tasks currently.";

  const blocksList =
    ctx.scheduledTimeBlocks.length > 0
      ? ctx.scheduledTimeBlocks
          .map(
            (b) =>
              `- Block #${b.id}: Task #${b.taskId} from ${b.startAt.slice(11, 16)} to ${b.endAt.slice(11, 16)}`,
          )
          .join("\n")
      : "No conflicting time blocks scheduled.";

  const memoryList =
    ctx.memoryFacts.length > 0
      ? ctx.memoryFacts
          .map(
            (f) =>
              `- ${f.title} (${f.confidence}% confidence${f.rule9Multiplier ? `, Duration multiplier: ${f.rule9Multiplier}x` : ""})`,
          )
          .join("\n")
      : "No behavioral memory facts recorded yet.";

  return `You are Cadence, an Apple-inspired personal time and task co-pilot. Keep responses direct, elegant, and actionable. Zero patronizing motivational phrases (no "You got this!", no cheerleading).

### LIVE USER ENVIRONMENT & REAL-TIME GROUND TRUTH:
- Current Local Time: ${ctx.currentTimeFormatted} (${ctx.timeZone})
- Today Date: ${ctx.currentDateIso.slice(0, 10)}
- Tomorrow Date: ${ctx.tomorrowDateIso.slice(0, 10)} (${ctx.tomorrowDateFormatted})
- Configured Work Hours: ${ctx.workHours.flexible24h ? "Flexible 24h rhythm" : `${ctx.workHours.start}:00 to ${ctx.workHours.end}:00`}

### USER'S LIVE OPEN BACKLOG:
${taskList}

### CURRENTLY SCHEDULED CALENDAR BLOCKS (NEXT 48H):
${blocksList}

### ACTIVE BEHAVIORAL MEMORY & WORK PATTERNS:
${memoryList}

### REASONING & BEHAVIOR RULES (Ground Truth):
1. **Dynamic Tool Calling**: You have full tool execution capabilities:
   - \`create_task\`: Create a new task item.
   - \`create_time_block\`: Place a task onto the calendar at a specific [startAt, endAt) ISO interval.
   - \`complete_task\`: Mark a task as completed.
   - \`update_task\`: Modify an existing task.
   - \`query_schedule\`: Query schedule for a date range.
   - \`bulk_reschedule\`: Reschedule tasks. (Threshold > 10 requires confirmation).
   - \`undo_last_action\`: Revert the last mutation.
2. **Cognitive Load & Underspecified Requests**:
   - If the user provides an underspecified scheduling prompt (e.g. "schedule tomorrow 9 to 5" or "plan tomorrow" without naming tasks):
     - DO NOT assume or guess random tasks blindly without asking.
     - Proactively clarify using the 3 pillars:
       • **WHAT (Tasks & Work Scope)**: Suggest filling with their actual backlog tasks (name them from their open tasks!) or creating a dedicated focus session.
       • **WHY (Priority & Theme)**: Ask what the primary focus is.
       • **HOW (Pacing & Breaks)**: Recommend pacing (e.g. 90-minute Ultradian rhythm focus sprints with 15-minute breaks and lunch).
     - Propose 2-3 structured, 1-tap numbered options (Option 1, Option 2, Option 3).
3. **Follow-ups & Choices**:
   - If the user replies with a choice (e.g. "1", "Option 2", "yes schedule top tasks", "put sprint 1 first"):
     - Immediately invoke the required tools (\`create_task\`, \`create_time_block\`) for the chosen option!
4. **Calendar Scheduling Constraints**:
   - In Cadence, calendar time blocks are attached to tasks. If scheduling new sessions, create the task first if needed, then create the time block.
   - Respect existing scheduled blocks. Avoid overlapping unless explicitly asked.
   - Rule 1: Never move fixed calendar events.
   - Rule 9: If a memory fact has a duration multiplier, apply it when estimating task durations.`;
}

/**
 * Executes dynamic LLM reasoning via LiteLLM / NVIDIA NIM / Gemini gateway with
 * function tool calling.
 */
export async function executeLlmGateway(
  context: DynamicAgentContext,
  userMessage: string,
  toolCtx: ToolContext,
): Promise<{
  success: boolean;
  replyText?: string;
  toolCallsExecuted: Array<{
    name: string;
    arguments: any;
    result: any;
  }>;
  tokensIn: number;
  tokensOut: number;
  model: string;
  error?: string;
}> {
  let gatewayUrl = process.env.LITELLM_BASE_URL;
  let apiKey = process.env.LITELLM_API_KEY;
  let model = process.env.NVIDIA_NIM_MODEL || "meta/llama-3.1-70b-instruct";

  if (!gatewayUrl && process.env.NVIDIA_NIM_API_KEY) {
    gatewayUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
    apiKey = process.env.NVIDIA_NIM_API_KEY;
  } else if (!gatewayUrl && process.env.GEMINI_API_KEY) {
    gatewayUrl =
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
    apiKey = process.env.GEMINI_API_KEY;
    model = "gemini-1.5-flash";
  }

  if (!gatewayUrl || !apiKey) {
    return {
      success: false,
      toolCallsExecuted: [],
      tokensIn: 0,
      tokensOut: 0,
      model: "none",
      error: "NO_GATEWAY_CONFIGURED",
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const systemPrompt = formatDynamicSystemPrompt(context);

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    for (const h of context.recentHistory) {
      messages.push({ role: h.role, content: h.content });
    }

    messages.push({ role: "user", content: userMessage });

    const response = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        tools: AGENT_TOOLS_DEFINITIONS.map((t) => ({
          type: "function",
          function: t,
        })),
        temperature: 0.2,
        max_tokens: 600,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        toolCallsExecuted: [],
        tokensIn: 0,
        tokensOut: 0,
        model,
        error: `HTTP_${response.status}`,
      };
    }

    const data = (await response.json()) as any;
    const choice = data.choices?.[0]?.message;
    const toolCallsExecuted: Array<{
      name: string;
      arguments: any;
      result: any;
    }> = [];

    let replyText = choice?.content || "";

    if (choice?.tool_calls && Array.isArray(choice.tool_calls)) {
      for (const call of choice.tool_calls) {
        const name = call.function?.name;
        let args = {};
        try {
          args = call.function?.arguments
            ? JSON.parse(call.function.arguments)
            : {};
        } catch {
          args = {};
        }

        const result = await executeAgentTool(name, args, toolCtx);
        toolCallsExecuted.push({ name, arguments: args, result });
      }

      if (!replyText && toolCallsExecuted.length > 0) {
        const descriptions = toolCallsExecuted.map((t) => {
          if (t.name === "create_task") {
            return `Created task "${t.result?.data?.title ?? t.arguments?.title}"`;
          }
          if (t.name === "create_time_block") {
            return `Scheduled calendar time block`;
          }
          if (t.name === "complete_task") {
            return `Completed task #${t.arguments?.id}`;
          }
          if (t.name === "bulk_reschedule") {
            return `Rescheduled ${t.result?.data?.movedCount ?? 0} task(s)`;
          }
          if (t.name === "undo_last_action") {
            return `Reverted last action`;
          }
          return `Executed ${t.name}`;
        });
        replyText = descriptions.join(". ") + ".";
      }
    }

    const tokensIn =
      data.usage?.prompt_tokens ??
      Math.round((systemPrompt.length + userMessage.length) / 4);
    const tokensOut =
      data.usage?.completion_tokens ?? Math.round(replyText.length / 4);

    return {
      success: true,
      replyText: replyText || "I've reviewed your schedule.",
      toolCallsExecuted,
      tokensIn: Math.round(tokensIn),
      tokensOut: Math.round(tokensOut),
      model,
    };
  } catch (err: any) {
    return {
      success: false,
      toolCallsExecuted: [],
      tokensIn: 0,
      tokensOut: 0,
      model,
      error: err?.message ?? "NETWORK_ERROR",
    };
  }
}

/**
 * Resilient deterministic & local resolution engine. Serves as:
 * 1. Offline fallback when external LLM gateways are unconfigured or fail.
 * 2. Deterministic execution for explicit commands and multi-turn follow-ups.
 */
export async function runLocalAgentResolution(
  context: DynamicAgentContext,
  userMessage: string,
  toolCtx: ToolContext,
): Promise<{
  replyText: string;
  toolCallsExecuted: Array<{
    name: string;
    arguments: any;
    result: any;
  }>;
}> {
  const { userId, openTasks, memoryFacts, lastAssistantMessage } = context;
  const toolCallsExecuted: Array<{
    name: string;
    arguments: any;
    result: any;
  }> = [];

  let replyText = "";

  // 1. Check if user is responding to a pending clarification dialogue
  const normalizedLower = userMessage.trim().toLowerCase();
  const isOption1 =
    /^(1|option 1|opt 1|first|#1)\b/i.test(normalizedLower) ||
    normalizedLower.includes("schedule top backlog tasks");
  const isOption2 =
    /^(2|option 2|opt 2|second|#2)\b/i.test(normalizedLower) ||
    normalizedLower.includes("deep work focus block");
  const isOption3 =
    /^(3|option 3|opt 3|third|#3)\b/i.test(normalizedLower) ||
    normalizedLower.includes("90-minute") ||
    normalizedLower.includes("sprints");

  const hasClarificationPending = Boolean(
    lastAssistantMessage &&
      (lastAssistantMessage.includes("Quick Options") ||
        lastAssistantMessage.includes("WHAT (Tasks & Work Scope)")),
  );

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 1);

  if (hasClarificationPending && (isOption1 || isOption2 || isOption3)) {
    if (isOption1) {
      let candidateTasks = openTasks;
      if (candidateTasks.length === 0) {
        const dbTasks = await db
          .select()
          .from(tasksTable)
          .where(and(eq(tasksTable.userId, userId), eq(tasksTable.status, "open")))
          .limit(3);
        candidateTasks = dbTasks.map((t) => ({ id: t.id, title: t.title }));
      }

      if (candidateTasks.length === 0) {
        const taskRes = await executeAgentTool(
          "create_task",
          { title: "General Work Session", durationMin: 240 },
          toolCtx,
        );
        toolCallsExecuted.push({
          name: "create_task",
          arguments: { title: "General Work Session" },
          result: taskRes,
        });
        if (taskRes.success && taskRes.data?.id) {
          const startAt = new Date(targetDate);
          startAt.setHours(9, 0, 0, 0);
          const endAt = new Date(targetDate);
          endAt.setHours(17, 0, 0, 0);
          const blockRes = await executeAgentTool(
            "create_time_block",
            {
              taskId: taskRes.data.id,
              startAt: startAt.toISOString(),
              endAt: endAt.toISOString(),
            },
            toolCtx,
          );
          toolCallsExecuted.push({
            name: "create_time_block",
            arguments: {
              taskId: taskRes.data.id,
              startAt: startAt.toISOString(),
              endAt: endAt.toISOString(),
            },
            result: blockRes,
          });
          replyText = `Created "General Work Session" and scheduled it for tomorrow from 9:00 AM to 5:00 PM with lunch at 1:00 PM.`;
        }
      } else {
        const slots = [
          { startH: 9, startM: 0, endH: 11, endM: 0 },
          { startH: 11, startM: 15, endH: 13, endM: 0 },
          { startH: 14, startM: 0, endH: 17, endM: 0 },
        ];
        const scheduledTitles: string[] = [];
        for (let i = 0; i < candidateTasks.length && i < slots.length; i++) {
          const t = candidateTasks[i];
          const slot = slots[i];
          const startAt = new Date(targetDate);
          startAt.setHours(slot.startH, slot.startM, 0, 0);
          const endAt = new Date(targetDate);
          endAt.setHours(slot.endH, slot.endM, 0, 0);
          const blockRes = await executeAgentTool(
            "create_time_block",
            {
              taskId: t.id,
              startAt: startAt.toISOString(),
              endAt: endAt.toISOString(),
            },
            toolCtx,
          );
          toolCallsExecuted.push({
            name: "create_time_block",
            arguments: {
              taskId: t.id,
              startAt: startAt.toISOString(),
              endAt: endAt.toISOString(),
            },
            result: blockRes,
          });
          scheduledTitles.push(`"${t.title}"`);
        }
        replyText = `Scheduled ${scheduledTitles.length} backlog task(s) (${scheduledTitles.join(
          ", ",
        )}) for tomorrow between 9:00 AM and 5:00 PM with a 1-hour lunch break at 1:00 PM.`;
      }
    } else if (isOption2) {
      const taskRes = await executeAgentTool(
        "create_task",
        { title: "Deep Work Focus Block", durationMin: 480, priority: "high" },
        toolCtx,
      );
      toolCallsExecuted.push({
        name: "create_task",
        arguments: { title: "Deep Work Focus Block" },
        result: taskRes,
      });
      if (taskRes.success && taskRes.data?.id) {
        const startAt = new Date(targetDate);
        startAt.setHours(9, 0, 0, 0);
        const endAt = new Date(targetDate);
        endAt.setHours(17, 0, 0, 0);
        const blockRes = await executeAgentTool(
          "create_time_block",
          {
            taskId: taskRes.data.id,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
          },
          toolCtx,
        );
        toolCallsExecuted.push({
          name: "create_time_block",
          arguments: {
            taskId: taskRes.data.id,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
          },
          result: blockRes,
        });
        replyText = `Created task "Deep Work Focus Block" and scheduled it for tomorrow from 9:00 AM to 5:00 PM.`;
      }
    } else if (isOption3) {
      const sprintSlots = [
        { title: "Focus Sprint 1", startH: 9, startM: 0, endH: 10, endM: 30 },
        { title: "Focus Sprint 2", startH: 10, startM: 45, endH: 12, endM: 15 },
        { title: "Focus Sprint 3", startH: 13, startM: 15, endH: 14, endM: 45 },
        { title: "Focus Sprint 4", startH: 15, startM: 0, endH: 16, endM: 30 },
      ];
      for (const s of sprintSlots) {
        const taskRes = await executeAgentTool(
          "create_task",
          { title: s.title, durationMin: 90 },
          toolCtx,
        );
        toolCallsExecuted.push({
          name: "create_task",
          arguments: { title: s.title },
          result: taskRes,
        });
        if (taskRes.success && taskRes.data?.id) {
          const startAt = new Date(targetDate);
          startAt.setHours(s.startH, s.startM, 0, 0);
          const endAt = new Date(targetDate);
          endAt.setHours(s.endH, s.endM, 0, 0);
          const blockRes = await executeAgentTool(
            "create_time_block",
            {
              taskId: taskRes.data.id,
              startAt: startAt.toISOString(),
              endAt: endAt.toISOString(),
            },
            toolCtx,
          );
          toolCallsExecuted.push({
            name: "create_time_block",
            arguments: {
              taskId: taskRes.data.id,
              startAt: startAt.toISOString(),
              endAt: endAt.toISOString(),
            },
            result: blockRes,
          });
        }
      }
      replyText = `Created and scheduled 4 focus sprint blocks for tomorrow with 15-minute breaks and lunch between 12:15 PM and 1:15 PM.`;
    }
  } else {
    // 2. Classify intent with colloquial tolerance and typo correction
    const intent = classifyAgentIntent(userMessage);

    if (intent.type === "undo") {
      const res = await executeAgentTool("undo_last_action", {}, toolCtx);
      toolCallsExecuted.push({ name: "undo_last_action", arguments: {}, result: res });
      replyText = res.success
        ? `Undone: ${res.data?.message ?? "Last action successfully reverted."}`
        : `Cannot undo: ${res.error}`;
    } else if (intent.type === "create_task") {
      if (intent.isUnderspecified || !intent.entities.taskTitle) {
        replyText = "What is the title or goal of the task you'd like to create?";
      } else {
        const title = intent.entities.taskTitle;
        const multiplierFact = memoryFacts.find(
          (f) => f.rule9Multiplier && f.rule9Multiplier > 1.0,
        );
        const durationMin = multiplierFact?.rule9Multiplier
          ? Math.round(30 * multiplierFact.rule9Multiplier)
          : 30;

        const res = await executeAgentTool("create_task", { title, durationMin }, toolCtx);
        toolCallsExecuted.push({ name: "create_task", arguments: { title, durationMin }, result: res });

        if (res.success) {
          replyText =
            `Created task: "${title}".` +
            (multiplierFact
              ? ` Duration adjusted to ${durationMin}m based on your learned work pattern (${multiplierFact.title}).`
              : "");
        } else {
          replyText = `Failed to create task: ${res.error}`;
        }
      }
    } else if (intent.type === "complete_task") {
      if (intent.entities.taskId) {
        const id = intent.entities.taskId;
        const res = await executeAgentTool("complete_task", { id }, toolCtx);
        toolCallsExecuted.push({ name: "complete_task", arguments: { id }, result: res });
        replyText = res.success
          ? `Task #${id} marked completed.`
          : `Could not complete task: ${res.error}`;
      } else {
        let tasksToList = openTasks;
        if (tasksToList.length === 0) {
          const rows = await db
            .select({ id: tasksTable.id, title: tasksTable.title })
            .from(tasksTable)
            .where(and(eq(tasksTable.userId, userId), eq(tasksTable.status, "open")))
            .limit(5);
          tasksToList = rows;
        }

        if (tasksToList.length > 0) {
          replyText =
            `Which task would you like to mark completed? Here are your current open tasks:\n` +
            tasksToList.map((t) => `#${t.id}: "${t.title}"`).join("\n") +
            `\nReply with "complete task [ID]".`;
        } else {
          replyText = "You have no open tasks to complete.";
        }
      }
    } else if (intent.type === "create_schedule") {
      if (intent.isUnderspecified) {
        let tasksToList = openTasks;
        if (tasksToList.length === 0) {
          const rows = await db
            .select({ id: tasksTable.id, title: tasksTable.title })
            .from(tasksTable)
            .where(and(eq(tasksTable.userId, userId), eq(tasksTable.status, "open")))
            .limit(5);
          tasksToList = rows;
        }
        replyText = generateScheduleClarification(intent, tasksToList);
      } else {
        const title = intent.entities.taskTitle!;
        const taskRes = await executeAgentTool("create_task", { title }, toolCtx);
        toolCallsExecuted.push({ name: "create_task", arguments: { title }, result: taskRes });

        if (taskRes.success && intent.entities.timeWindow && taskRes.data?.id) {
          const windowDate = new Date();
          if (intent.entities.dateRef === "tomorrow") {
            windowDate.setDate(windowDate.getDate() + 1);
          }
          const startAt = new Date(windowDate);
          startAt.setHours(
            intent.entities.timeWindow.startHour,
            intent.entities.timeWindow.startMinute,
            0,
            0,
          );
          const endAt = new Date(windowDate);
          endAt.setHours(
            intent.entities.timeWindow.endHour,
            intent.entities.timeWindow.endMinute,
            0,
            0,
          );

          const blockRes = await executeAgentTool(
            "create_time_block",
            { taskId: taskRes.data.id, startAt: startAt.toISOString(), endAt: endAt.toISOString() },
            toolCtx,
          );
          toolCallsExecuted.push({
            name: "create_time_block",
            arguments: {
              taskId: taskRes.data.id,
              startAt: startAt.toISOString(),
              endAt: endAt.toISOString(),
            },
            result: blockRes,
          });

          replyText = `Created task "${title}" and scheduled it for ${intent.entities.dateRef ?? "today"} from ${intent.entities.timeWindow.formatted}.`;
        } else if (taskRes.success) {
          replyText = `Created task: "${title}".`;
        } else {
          replyText = `Failed to create schedule: ${taskRes.error}`;
        }
      }
    } else if (intent.type === "bulk_reschedule") {
      const idMatches = intent.entities.taskIds ?? [];
      if (idMatches.length > 0) {
        const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        const res = await executeAgentTool(
          "bulk_reschedule",
          { taskIds: idMatches, targetDate: tomorrow },
          toolCtx,
        );
        toolCallsExecuted.push({
          name: "bulk_reschedule",
          arguments: { taskIds: idMatches, targetDate: tomorrow },
          result: res,
        });
        if (res.requiresConfirmation) {
          replyText = `Confirmation required: This operation will move ${idMatches.length} tasks. Please confirm to proceed.`;
        } else {
          replyText = `Rescheduled ${res.data?.movedCount ?? 0} task(s) to tomorrow.`;
        }
      } else {
        replyText =
          "Please specify which task IDs you would like to reschedule (e.g. 'reschedule task 3 to tomorrow').";
      }
    } else if (intent.type === "query_schedule") {
      const rangeDays = intent.entities.dateRef === "tomorrow" ? 2 : 1;
      const res = await executeAgentTool("query_schedule", { rangeDays }, toolCtx);
      toolCallsExecuted.push({ name: "query_schedule", arguments: { rangeDays }, result: res });
      const count = res.data?.tasks?.length ?? 0;
      const when = intent.entities.dateRef ? `for ${intent.entities.dateRef}` : "on your schedule";
      replyText = `You have ${count} open task(s) ${when}.`;
    } else {
      if (memoryFacts.length > 0) {
        const topFact = memoryFacts[0];
        replyText = `I'm Cadence, your task co-pilot. I currently know that: "${topFact.title}" (${topFact.confidence}% confidence). How can I help with your schedule or tasks today?`;
      } else {
        replyText =
          "I'm Cadence, your task co-pilot. I can help you create tasks, plan time blocks, adjust your schedule, or track focus habits. What would you like to work on today?";
      }
    }
  }

  return { replyText, toolCallsExecuted };
}

/**
 * Main conversational agent pipeline:
 * 1. Gathers dynamic live context (timezone, clocks, open tasks, time blocks, memory facts).
 * 2. Invokes dynamic LLM gateway with function tool calling when configured.
 * 3. Falls back smoothly to local dynamic resolution when unconfigured or offline.
 * 4. Logs full transcript, reversible actions, and LLM telemetry.
 */
export async function runAgentConversation(
  input: AgentChatInput,
): Promise<AgentChatOutput> {
  const { userId, message, channel = "app" } = input;
  const toolCtx: ToolContext = { userId };

  // 1. Gather active memory facts
  const activeFacts = await getRelevantMemoryFacts(userId);
  const memoryApplied = activeFacts.slice(0, 5).map((f) => ({
    key: f.key,
    title: f.title,
    confidence: f.confidence,
    rule9Multiplier: f.rule9Multiplier,
  }));

  // 2. Retrieve previous assistant message to maintain conversational dialogue state
  let lastAssistantMessage: string | undefined;
  try {
    const [lastAssistantMsg] = await db
      .select({ content: agentConversationsTable.content })
      .from(agentConversationsTable)
      .where(
        and(
          eq(agentConversationsTable.userId, userId),
          eq(agentConversationsTable.role, "assistant"),
        ),
      )
      .orderBy(desc(agentConversationsTable.id))
      .limit(1);
    lastAssistantMessage = lastAssistantMsg?.content;
  } catch {
    lastAssistantMessage = undefined;
  }

  // 3. Log user message to agent_conversations
  await db.insert(agentConversationsTable).values({
    userId,
    channel,
    role: "user",
    content: message,
  });

  let replyText = "";
  let toolCallsExecuted: Array<{
    name: string;
    arguments: any;
    result: any;
  }> = [];

  let simulatedTokensIn = message.length;
  let simulatedTokensOut = 0;
  let usedModel = "cadence-react-local";

  // 4. Try Dynamic LLM Gateway Loop if credentials exist
  const hasLlmConfigured = Boolean(
    process.env.LITELLM_BASE_URL ||
      process.env.NVIDIA_NIM_API_KEY ||
      process.env.GEMINI_API_KEY,
  );

  let gatewaySucceeded = false;
  if (hasLlmConfigured) {
    const fullContext = await assembleAgentContext(userId);
    fullContext.lastAssistantMessage = lastAssistantMessage;
    const llmResult = await executeLlmGateway(fullContext, message, toolCtx);
    if (llmResult.success && llmResult.replyText) {
      gatewaySucceeded = true;
      replyText = llmResult.replyText;
      toolCallsExecuted = llmResult.toolCallsExecuted;
      simulatedTokensIn = llmResult.tokensIn;
      simulatedTokensOut = llmResult.tokensOut;
      usedModel = llmResult.model;
    }
  }

  // 5. If gateway unconfigured or failed (circuit breaker fallback), run local resolution
  if (!gatewaySucceeded) {
    const localContext: DynamicAgentContext = {
      userId,
      timeZone: "Asia/Kolkata",
      currentTimeFormatted: new Date().toUTCString(),
      currentDateIso: new Date().toISOString(),
      tomorrowDateFormatted: new Date(Date.now() + 86400000).toDateString(),
      tomorrowDateIso: new Date(Date.now() + 86400000).toISOString(),
      workHours: { start: 9, end: 18, flexible24h: true },
      openTasks: [],
      scheduledTimeBlocks: [],
      memoryFacts: activeFacts,
      recentHistory: [],
      lastAssistantMessage,
    };

    const localRes = await runLocalAgentResolution(localContext, message, toolCtx);
    replyText = localRes.replyText;
    toolCallsExecuted = localRes.toolCallsExecuted;
    simulatedTokensOut = replyText.length;
  }

  // 6. Log assistant response to agent_conversations
  await db.insert(agentConversationsTable).values({
    userId,
    channel,
    role: "assistant",
    content: replyText,
    toolCalls: toolCallsExecuted.length > 0 ? toolCallsExecuted : null,
  });

  // 7. Log LLM Telemetry
  const simulatedTokens = simulatedTokensIn + simulatedTokensOut;
  await db.insert(llmUsageTable).values({
    userId,
    model: usedModel,
    tokensIn: simulatedTokensIn,
    tokensOut: simulatedTokensOut,
    costEstimateCents: Math.round((simulatedTokens / 1000) * 0.1 * 100) / 100,
    endpoint: channel === "telegram" ? "/telegram/webhook" : "/agent/chat",
  });

  // 8. Spend Ceiling Check
  const [spendRow] = await db
    .select({
      totalCents: sql<number>`COALESCE(SUM(${llmUsageTable.costEstimateCents}), 0)::real`,
    })
    .from(llmUsageTable)
    .where(eq(llmUsageTable.userId, userId));

  const totalCost = spendRow?.totalCents ?? 0;
  const spendAlert = {
    totalMonthCostCents: totalCost,
    exceededCeiling: totalCost >= MONTHLY_SPEND_CEILING_CENTS,
  };

  return {
    reply: replyText,
    toolCallsExecuted,
    memoryApplied,
    spendAlert,
  };
}
