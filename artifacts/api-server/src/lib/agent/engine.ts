import { and, desc, eq, sql } from "drizzle-orm";
import {
  agentConversationsTable,
  db,
  llmCredentialsTable,
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
  CANDIDATE_FALLBACK_MODELS_BY_PROVIDER,
  chatCompletionsUrl,
  resolveProvidersForUser,
  type ResolvedProvider,
} from "./providers";
import {
  BreakerRegistry,
  parseRetryAfter,
  retryWithBackoff,
} from "./resilience";
import {
  classifyAgentIntent,
  generateScheduleClarification,
} from "./intent";
import { zonedWallDate } from "../date";
import { zonedWallToUtc } from "../natural-date";

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
  /**
   * True when the agent is waiting on the user before mutating more than 10
   * tasks. `openapi.yaml` marks this required and `AgentPanel.tsx` reads it to
   * render the approval gate — it was previously absent from this interface, so
   * the ">10 tasks needs approval" promise in the UI footer could never fire.
   */
  requiresConfirmation: boolean;
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
    const rawFacts = await getRelevantMemoryFacts(userId);
    // Behavioral memory facts only -- never leak internal channel or config credentials into LLM prompt
    memoryFacts = rawFacts.filter((f) => f.category !== "channel");
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
   - \`switch_model\`: Dynamically switch the active AI reasoning model or provider (e.g. 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-pro', 'llama-3.3-70b-versatile'). Call this tool whenever the user asks to switch models, or if a task requires specialized reasoning.
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
  preResolvedProviders?: ResolvedProvider[],
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
  /** Set when a tool asked for user confirmation before mutating. */
  requiresConfirmation?: boolean;
  /** Which providers were attempted, for the UI's error state. */
  providersTried?: Array<{ id: string; reason?: string }>;
}> {
  // Providers: the user's stored BYOK credential first, then deployment env
  // vars. An empty or blank key resolves to no provider at all — that empty
  // result is what surfaces as NO_GATEWAY_CONFIGURED instead of a silent
  // greeting.
  //
  // Accepts a pre-resolved list so a conversation resolves credentials exactly
  // once (one extra query per turn otherwise), and so the caller can decide
  // whether an LLM is even configured without a second round trip.
  const providers =
    preResolvedProviders ?? (await resolveProvidersForUser(toolCtx.userId));

  if (providers.length === 0) {
    return {
      success: false,
      toolCallsExecuted: [],
      tokensIn: 0,
      tokensOut: 0,
      model: "none",
      error: "NO_GATEWAY_CONFIGURED",
      providersTried: [],
    };
  }

  const systemPrompt = formatDynamicSystemPrompt(context);

  const messages: Array<{ role: string; content: string | null; tool_calls?: any; tool_call_id?: string }> = [
    { role: "system", content: systemPrompt },
  ];

  for (const h of context.recentHistory) {
    messages.push({ role: h.role, content: h.content });
  }

  messages.push({ role: "user", content: userMessage });

  const toolCallsExecuted: Array<{
    name: string;
    arguments: any;
    result: any;
  }> = [];
  const providersTried: Array<{ id: string; reason?: string }> = [];
  let requiresConfirmation = false;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let lastModel = providers[0].model;
  let fallbackReply: string | null = null;

  // Retry stays on one provider; fallback moves to the next. Retry wraps the
  // model HTTP call ONLY — never `executeAgentTool`, or a timeout after
  // `create_task` commits would create the task twice.
  for (const provider of providers) {
    const breaker = breakers.forProvider(provider.id);
    if (!breaker.canAttempt()) {
      providersTried.push({ id: provider.id, reason: "circuit_open" });
      continue;
    }

    const outcome = await runProviderTurns({
      provider,
      messages,
      toolCtx,
      toolCallsExecuted,
      onRequiresConfirmation: () => {
        requiresConfirmation = true;
      },
    });

    lastModel = provider.model;

    // Tools already ran on this provider: the side effects are real, so report
    // them even though the follow-up turn produced no prose. Treating this as a
    // provider failure would make the caller fall through to the local engine
    // and report the work as a failure.
    if (outcome.toolsRan && outcome.replyText === null) {
      breaker.onSuccess();
      return {
        success: true,
        replyText: describeToolResults(toolCallsExecuted),
        toolCallsExecuted,
        tokensIn: outcome.tokensIn,
        tokensOut: outcome.tokensOut,
        model: provider.model,
        requiresConfirmation,
        providersTried,
      };
    }

    if (outcome.replyText !== null) {
      breaker.onSuccess();
      totalTokensIn += outcome.tokensIn;
      totalTokensOut += outcome.tokensOut;
      if (outcome.tokensIn === 0 && outcome.tokensOut === 0) {
        // Follow-up turn failed after tools ran; report what actually happened
        // rather than claiming an LLM reply we never received.
        return {
          success: true,
          replyText: fallbackReply ?? describeToolResults(toolCallsExecuted),
          toolCallsExecuted,
          tokensIn: 0,
          tokensOut: 0,
          model: provider.model,
          requiresConfirmation,
          providersTried,
        };
      }
      return {
        success: true,
        replyText: outcome.replyText,
        toolCallsExecuted,
        tokensIn: outcome.tokensIn,
        tokensOut: outcome.tokensOut,
        model: provider.model,
        requiresConfirmation,
        providersTried,
      };
    }

    breaker.onFailure();
    providersTried.push({ id: provider.id, reason: outcome.error ?? "failed" });
    // Preserve a usable reply if a tool already ran on this provider: the side
    // effects are real even though the provider call itself failed.
    if (toolCallsExecuted.length > 0) {
      const applied = describeToolResults(toolCallsExecuted);
      fallbackReply = applied;
      return {
        success: true,
        replyText: applied,
        toolCallsExecuted,
        tokensIn: 0,
        tokensOut: 0,
        model: provider.model,
        requiresConfirmation,
        providersTried,
      };
    }
  }

  return {
    success: false,
    toolCallsExecuted,
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
    model: lastModel,
    error: providers.length > 1 ? "ALL_PROVIDERS_FAILED" : "GATEWAY_FAILED",
    requiresConfirmation,
    providersTried,
  };
}

/** Per-provider circuit breakers, shared across turns. */
const breakers = new BreakerRegistry();

/** AWS guidance is 21-30s read timeout on user-facing paths; 5s converts a
 *  merely slow tool-calling model into a total failure. */
const PROVIDER_ATTEMPT_TIMEOUT_MS = 15_000;
/** BFCL measures 1.68-1.92 tool steps per turn, so one shot is not enough for a
 *  request like "schedule my backlog 9-5" (create_task then create_time_block). */
const MAX_PROVIDER_TURNS = 3;

/**
 * Human-readable summary of what the tools actually did.
 *
 * Also the honest fallback when the follow-up turn fails: the tools ran and
 * their effects are real, so we describe them instead of inventing an LLM reply.
 */
function describeToolResults(
  toolCallsExecuted: Array<{ name: string; arguments: any; result: any }>,
): string {
  const descriptions = toolCallsExecuted.map((t) => {
    if (t.name === "create_task") {
      return `Created task "${t.result?.data?.title ?? t.arguments?.title}"`;
    }
    if (t.name === "create_time_block") {
      return "Scheduled calendar time block";
    }
    if (t.name === "complete_task") {
      return `Completed task #${t.arguments?.id}`;
    }
    if (t.name === "bulk_reschedule") {
      return `Rescheduled ${t.result?.data?.movedCount ?? 0} task(s)`;
    }
    if (t.name === "undo_last_action") {
      return "Reverted last action";
    }
    if (t.name === "switch_model") {
      return `Switched active AI model to ${t.result?.data?.model ?? t.arguments?.model}`;
    }
    return `Executed ${t.name}`;
  });
  return descriptions.join(". ") + ".";
}

interface ProviderTurnResult {
  replyText: string | null;
  tokensIn: number;
  tokensOut: number;
  error?: string;
  /**
   * True when tools already executed before the failure. Distinguishes "this
   * provider is broken" from "the tools ran and the follow-up turn did not
   * answer" — the second must still report success, because the side effects
   * really happened.
   */
  toolsRan: boolean;
}

/**
 * Calls one provider, running the ReAct loop: execute tools, feed the results
 * back, call again until the model answers with prose or the turn cap is hit.
 *
 * Retry wraps only the HTTP call. `executeAgentTool` runs exactly once per
 * model-emitted call, never inside a retry, so a timed-out request cannot
 * duplicate a task.
 */
async function runProviderTurns(params: {
  provider: ResolvedProvider;
  messages: Array<{ role: string; content: string | null; tool_calls?: any; tool_call_id?: string }>;
  toolCtx: ToolContext;
  toolCallsExecuted: Array<{ name: string; arguments: any; result: any }>;
  onRequiresConfirmation: () => void;
}): Promise<ProviderTurnResult> {
  const { provider, toolCtx, toolCallsExecuted, onRequiresConfirmation } = params;
  const working = [...params.messages];

  let tokensIn = 0;
  let tokensOut = 0;

  for (let turn = 0; turn < MAX_PROVIDER_TURNS; turn++) {
    const outcome = await retryWithBackoff(
      () => callProviderChat(provider, working, toolCtx),
      { maxAttempts: 2, baseMs: 250, capMs: 2_000 },
    );

    if (outcome.error !== undefined || outcome.value === undefined) {
      return {
        replyText: null,
        tokensIn,
        tokensOut,
        error: outcome.kind ?? "GATEWAY_FAILED",
        toolsRan: toolCallsExecuted.length > 0,
      };
    }

    const { choice, usage } = outcome.value;
    tokensIn += usage?.promptTokens ?? 0;
    tokensOut += usage?.completionTokens ?? 0;

    const toolCalls: any[] = Array.isArray(choice?.tool_calls) ? choice.tool_calls : [];

    if (toolCalls.length === 0) {
      return {
        replyText: choice?.content ?? "",
        tokensIn,
        tokensOut,
        toolsRan: toolCallsExecuted.length > 0,
      };
    }

    working.push({
      role: "assistant",
      content: choice?.content ?? null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const name = call.function?.name;
      let args: any = {};
      try {
        args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }

      const result = await executeAgentTool(name, args, toolCtx);
      toolCallsExecuted.push({ name, arguments: args, result });
      if (name === "switch_model" && result?.success && result?.data?.model) {
        provider.model = result.data.model;
      }
      if (result?.requiresConfirmation) onRequiresConfirmation();

      working.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result ?? { success: false, error: "no result" }),
      });
    }
  }

  // Turn cap reached with tools still pending: report what happened rather than
  // silently claiming success.
  return {
    replyText: describeToolResults(toolCallsExecuted),
    tokensIn,
    tokensOut,
    toolsRan: true,
  };
}

/** One HTTP call to an OpenAI-compatible chat/completions endpoint with candidate fallback. */
async function callProviderChat(
  provider: ResolvedProvider,
  messages: Array<{ role: string; content: string | null; tool_calls?: any; tool_call_id?: string }>,
  toolCtx?: ToolContext,
): Promise<{ choice: any; usage: { promptTokens?: number; completionTokens?: number } | null }> {
  const candidateModels = Array.from(
    new Set([
      provider.model,
      ...(CANDIDATE_FALLBACK_MODELS_BY_PROVIDER[provider.id] ?? []),
    ]),
  );

  let lastStatus = 0;
  let lastError = "";
  let lastRetryAfter: number | undefined;

  for (const candidate of candidateModels) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROVIDER_ATTEMPT_TIMEOUT_MS);

    try {
      const response = await fetch(chatCompletionsUrl(provider.baseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: candidate,
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

      if (response && response.ok) {
        const data = (await response.json()) as any;

        // If candidate succeeded and differed from configured model, switch model and persist to DB
        if (candidate !== provider.model) {
          provider.model = candidate;
          if (toolCtx?.userId) {
            db.update(llmCredentialsTable)
              .set({ model: candidate, updatedAt: new Date() })
              .where(
                and(
                  eq(llmCredentialsTable.userId, toolCtx.userId),
                  eq(llmCredentialsTable.provider, provider.id),
                ),
              )
              .catch(() => {});
          }
        }

        return {
          choice: data.choices?.[0]?.message ?? { content: "" },
          usage: data.usage
            ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
              }
            : null,
        };
      }

      lastStatus = response ? response.status : 502;
      lastError = response ? await response.text().catch(() => "") : "no response";
      lastRetryAfter = parseRetryAfter(response?.headers?.get?.("retry-after"));

      // If the API key itself was rejected (401/403 or bad api key payload), do not try other models
      if (lastStatus === 401 || lastStatus === 403 || lastError.toLowerCase().includes("api key")) {
        break;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw Object.assign(
    new Error(`provider ${provider.id} returned ${lastStatus}: ${lastError.slice(0, 100)}`),
    {
      status: lastStatus,
      retryAfterMs: lastRetryAfter,
    },
  );
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

  // Zones fail TOWARD D-01 (Asia/Kolkata), not the server clock: every block
  // slot below is a wall-clock time in the user's zone, never the API host's.
  const zone = context.timeZone || "Asia/Kolkata";
  const tomorrowWall = zonedWallDate(new Date(Date.now() + 24 * 3600 * 1000), zone);
  const atHour = (h: number, m: number) => zonedWallToUtc(tomorrowWall, h, m, zone);

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
          const startAt = atHour(9, 0);
          const endAt = atHour(17, 0);
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
          const startAt = atHour(slot.startH, slot.startM);
          const endAt = atHour(slot.endH, slot.endM);
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
        const startAt = atHour(9, 0);
        const endAt = atHour(17, 0);
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
          const startAt = atHour(s.startH, s.startM);
          const endAt = atHour(s.endH, s.endM);
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
    } else if (intent.type === "confirm") {
      let targetIds = intent.entities.taskIds ?? [];
      const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      if (targetIds.length === 0) {
        const matchNums = [...(lastAssistantMessage ?? "").matchAll(/\d+/g)].map((m) => parseInt(m[0], 10));
        if (matchNums.length > 0) {
          targetIds = matchNums;
        } else if (openTasks.length > 0) {
          targetIds = openTasks.slice(0, 15).map((t) => t.id);
        }
      }

      if (targetIds.length > 0) {
        const res = await executeAgentTool(
          "bulk_reschedule",
          { taskIds: targetIds, targetDate: tomorrow, confirmed: true },
          toolCtx,
        );
        toolCallsExecuted.push({
          name: "bulk_reschedule",
          arguments: { taskIds: targetIds, targetDate: tomorrow, confirmed: true },
          result: res,
        });
        replyText = res.success
          ? `Confirmed: Rescheduled ${res.data?.movedCount ?? targetIds.length} tasks to tomorrow. All changes are logged and reversible.`
          : `Could not complete confirmation: ${res.error}`;
      } else {
        replyText = "There are no pending bulk actions requiring confirmation right now.";
      }
    } else if (intent.type === "switch_model") {
      if (intent.entities.targetModel) {
        const model = intent.entities.targetModel;
        const provider = intent.entities.targetProvider;
        const res = await executeAgentTool("switch_model", { model, provider }, toolCtx);
        toolCallsExecuted.push({
          name: "switch_model",
          arguments: { model, provider },
          result: res,
        });
        if (res.success) {
          replyText = `Switched active AI model to **${res.data?.model}** (${res.data?.provider})! 🚀\n\nAll subsequent reasoning and task planning will use this model.`;
        } else {
          replyText = res.error ?? "Failed to switch model.";
        }
      } else {
        // Inquiry or bare "switch model"
        const providers = await resolveProvidersForUser(userId);
        if (providers.length > 0) {
          const active = providers[0];
          replyText =
            `I am currently operating with **${active.model}** via **${active.label}** (${active.source === "credential" ? "BYOK credential" : "deployment default"}).\n\n` +
            `You can tell me to switch anytime:\n` +
            `• "switch to gemini 1.5 pro"\n` +
            `• "switch to groq" (Llama 3.3 70B)\n` +
            `• "switch to gemini 2.0 flash"`;
        } else {
          replyText =
            "No AI provider key is configured yet. I am currently running with built-in offline logic.\n\n" +
            "To connect Google Gemini, Groq, or OpenRouter, head to **Settings > AI Co-Pilot (BYOK)**.";
        }
      }
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
        const dueAt = intent.entities.dueAtIso;

        const res = await executeAgentTool(
          "create_task",
          { title, durationMin, dueAt },
          toolCtx,
        );
        toolCallsExecuted.push({
          name: "create_task",
          arguments: { title, durationMin, dueAt },
          result: res,
        });

        if (res.success) {
          const scheduleClause = intent.entities.pointInTime
            ? ` (scheduled for ${intent.entities.dateRef ?? "today"} at ${intent.entities.pointInTime.formatted})`
            : intent.entities.dateRef
              ? ` (due ${intent.entities.dateRef})`
              : "";
          replyText =
            `Created task: "${title}"${scheduleClause}.` +
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
      let idMatches = intent.entities.taskIds ?? [];
      if (idMatches.length === 0) {
        if (openTasks.length > 0) {
          idMatches = openTasks.map((t) => t.id);
        } else {
          const rows = await db
            .select({ id: tasksTable.id })
            .from(tasksTable)
            .where(and(eq(tasksTable.userId, userId), eq(tasksTable.status, "open")))
            .limit(20);
          idMatches = rows.map((r) => r.id);
        }
      }

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
          "You have no open tasks to reschedule right now. Create some tasks first or specify task IDs (e.g. 'reschedule task 3 to tomorrow').";
      }
    } else if (intent.type === "query_schedule") {
      const rangeDays = intent.entities.dateRef === "tomorrow" ? 2 : 1;
      const res = await executeAgentTool("query_schedule", { rangeDays }, toolCtx);
      toolCallsExecuted.push({ name: "query_schedule", arguments: { rangeDays }, result: res });
      const tasks: any[] = res.data?.tasks ?? [];
      const when = intent.entities.dateRef ? `for ${intent.entities.dateRef}` : "on your schedule";
      if (tasks.length === 0) {
        replyText = `You have no open tasks scheduled ${when}.`;
      } else {
        const taskLines = tasks
          .slice(0, 8)
          .map(
            (t) =>
              `• #${t.id}: "${t.title}"${t.dueAt ? ` (due ${new Date(t.dueAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})` : ""}`,
          )
          .join("\n");
        replyText = `You have ${tasks.length} open task(s) ${when}:\n\n${taskLines}`;
      }
    } else if (intent.type === "greeting") {
      const openCount = openTasks.length;
      const taskSummary =
        openCount === 0
          ? "You're all clear with no open tasks right now."
          : `You currently have ${openCount} open task${openCount > 1 ? "s" : ""} on your schedule.`;
      replyText = `👋 Hello! I'm Cadence, your personal task co-pilot.\n\n${taskSummary}\n\nWhat would you like to work on or schedule today?`;
    } else {
      replyText =
        "👋 I'm Cadence, your personal task co-pilot. I can help you create tasks, plan your schedule, adjust time blocks, or track focus habits.\n\n" +
        "💡 To unlock full natural-language reasoning and multi-turn planning, you can connect your AI key (Google Gemini, Groq, or OpenRouter) in Settings > AI Co-Pilot (BYOK).\n\n" +
        "In the meantime, feel free to tell me what task you want to add or tap Help below!";
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

  // 1. Gather active memory facts (filter technical/channel credentials)
  const rawFacts = await getRelevantMemoryFacts(userId);
  const activeFacts = rawFacts.filter((f) => f.category !== "channel");
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
  let requiresConfirmation = false;

  // Telemetry is only recorded when a model actually ran. Previously a row was
  // written on every turn with `message.length` / `replyText.length` — character
  // counts — labelled `cadence-react-local`, so "assistant calls: 3" counted
  // conversations rather than model calls and reported health while the agent
  // did nothing.
  let modelCallMade = false;
  let tokensIn = 0;
  let tokensOut = 0;
  let usedModel = "none";

  // 4. Try the LLM if any provider is usable (stored BYOK credential or env).
  const providers = await resolveProvidersForUser(userId);
  const hasLlmConfigured = providers.length > 0;

  let gatewaySucceeded = false;
  let fullContext: DynamicAgentContext | undefined;

  if (hasLlmConfigured) {
    fullContext = await assembleAgentContext(userId);
    fullContext.lastAssistantMessage = lastAssistantMessage;
    const llmResult = await executeLlmGateway(fullContext, message, toolCtx, providers);
    if (llmResult.success && llmResult.replyText) {
      gatewaySucceeded = true;
      replyText = llmResult.replyText;
      toolCallsExecuted = llmResult.toolCallsExecuted;
      requiresConfirmation = llmResult.requiresConfirmation === true;
      usedModel = llmResult.model;
      // Real provider usage numbers, only when the model actually answered.
      if (llmResult.tokensIn > 0 || llmResult.tokensOut > 0) {
        modelCallMade = true;
        tokensIn = llmResult.tokensIn;
        tokensOut = llmResult.tokensOut;
      }
    }
  }

  // 5. If gateway unconfigured or failed (circuit breaker fallback), run local resolution
  if (!gatewaySucceeded) {
    const localContext: DynamicAgentContext = fullContext ?? {
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
    requiresConfirmation = toolCallsExecuted.some(
      (t) => t.result?.requiresConfirmation === true,
    );
  }

  // 6. Log assistant response to agent_conversations
  await db.insert(agentConversationsTable).values({
    userId,
    channel,
    role: "assistant",
    content: replyText,
    toolCalls: toolCallsExecuted.length > 0 ? toolCallsExecuted : null,
  });

  // 7. Log LLM telemetry — only for a real model call.
  if (modelCallMade) {
    const total = tokensIn + tokensOut;
    await db.insert(llmUsageTable).values({
      userId,
      model: usedModel,
      tokensIn,
      tokensOut,
      costEstimateCents: Math.round((total / 1000) * 0.1 * 100) / 100,
      endpoint: channel === "telegram" ? "/telegram/webhook" : "/agent/chat",
    });
  }

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
    requiresConfirmation,
    memoryApplied,
    spendAlert,
  };
}
