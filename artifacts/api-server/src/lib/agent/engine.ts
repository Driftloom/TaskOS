import { eq, sql } from "drizzle-orm";
import {
  agentConversationsTable,
  db,
  llmUsageTable,
  type MemoryFact,
} from "@workspace/db";
import { getRelevantMemoryFacts } from "../memory";
import {
  AGENT_TOOLS_DEFINITIONS,
  executeAgentTool,
  type ToolContext,
} from "./tools";

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

const MONTHLY_SPEND_CEILING_CENTS = 500; // ~₹400–500 / month ($5 USD)

/**
 * Determines if a query can be fulfilled deterministically locally
 * or via external LiteLLM gateway.
 */
export async function runAgentConversation(
  input: AgentChatInput,
): Promise<AgentChatOutput> {
  const { userId, message, channel = "app" } = input;
  const toolCtx: ToolContext = { userId };

  // 1. Retrieve Active Behavioral Memory Facts
  const activeFacts: MemoryFact[] = await getRelevantMemoryFacts(userId);
  const memoryApplied = activeFacts.slice(0, 5).map((f) => ({
    key: f.key,
    title: f.title,
    confidence: f.confidence,
    rule9Multiplier: f.rule9Multiplier,
  }));

  // 2. Log user message to agent_conversations
  await db.insert(agentConversationsTable).values({
    userId,
    channel,
    role: "user",
    content: message,
  });

  const toolCallsExecuted: Array<{
    name: string;
    arguments: any;
    result: any;
  }> = [];

  let replyText = "";
  const lower = message.toLowerCase().trim();

  // Pattern-match common task and planning intents (Deterministic ReAct layer)
  if (lower.startsWith("add task ") || lower.startsWith("create task ") || lower.startsWith("new task ")) {
    const title = message.replace(/^(add|create|new)\s+task\s+/i, "").trim();
    // Check if task has duration multiplier in memory
    const multiplierFact = activeFacts.find((f) => f.rule9Multiplier && f.rule9Multiplier > 1.0);
    const durationMin = multiplierFact?.rule9Multiplier
      ? Math.round(30 * multiplierFact.rule9Multiplier)
      : 30;

    const res = await executeAgentTool("create_task", { title, durationMin }, toolCtx);
    toolCallsExecuted.push({ name: "create_task", arguments: { title, durationMin }, result: res });

    if (res.success) {
      replyText = `Created task: "${title}".` + (multiplierFact ? ` Duration adjusted to ${durationMin}m based on your learned work pattern (${multiplierFact.title}).` : "");
    } else {
      replyText = `Failed to create task: ${res.error}`;
    }
  } else if (lower.startsWith("complete task ") || lower.startsWith("done task ")) {
    const idMatch = message.match(/\d+/);
    if (idMatch) {
      const id = parseInt(idMatch[0], 10);
      const res = await executeAgentTool("complete_task", { id }, toolCtx);
      toolCallsExecuted.push({ name: "complete_task", arguments: { id }, result: res });
      replyText = res.success ? `Task #${id} marked completed.` : `Could not complete task: ${res.error}`;
    } else {
      replyText = "Please provide the task ID to complete.";
    }
  } else if (lower.includes("schedule") || lower.includes("what's due") || lower.includes("today")) {
    const res = await executeAgentTool("query_schedule", { rangeDays: 1 }, toolCtx);
    toolCallsExecuted.push({ name: "query_schedule", arguments: { rangeDays: 1 }, result: res });
    const count = res.data?.tasks?.length ?? 0;
    replyText = `You have ${count} open task(s) on your schedule.`;
  } else if (lower.includes("reschedule") && lower.includes("tomorrow")) {
    const idMatches = [...message.matchAll(/\d+/g)].map((m) => parseInt(m[0], 10));
    if (idMatches.length > 0) {
      const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const res = await executeAgentTool("bulk_reschedule", { taskIds: idMatches, targetDate: tomorrow }, toolCtx);
      toolCallsExecuted.push({ name: "bulk_reschedule", arguments: { taskIds: idMatches, targetDate: tomorrow }, result: res });
      if (res.requiresConfirmation) {
        replyText = `Confirmation required: This operation will move ${idMatches.length} tasks. Please confirm to proceed.`;
      } else {
        replyText = `Rescheduled ${res.data?.movedCount ?? 0} task(s) to tomorrow.`;
      }
    } else {
      replyText = "Please specify which task IDs you would like to reschedule.";
    }
  } else if (lower === "undo" || lower.startsWith("undo ") || lower.includes("undo last")) {
    const res = await executeAgentTool("undo_last_action", {}, toolCtx);
    toolCallsExecuted.push({ name: "undo_last_action", arguments: {}, result: res });
    replyText = res.success
      ? `Undone: ${res.data?.message ?? "Last action successfully reverted."}`
      : `Cannot undo: ${res.error}`;
  } else {
    // External LiteLLM / NVIDIA NIM Gateway or deterministic fallback
    const gatewayUrl =
      process.env.LITELLM_BASE_URL ||
      (process.env.NVIDIA_NIM_API_KEY ? "https://integrate.api.nvidia.com/v1/chat/completions" : "");
    const apiKey = process.env.LITELLM_API_KEY || process.env.NVIDIA_NIM_API_KEY;

    let gatewaySuccess = false;
    if (gatewayUrl && apiKey) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const memoryContext = activeFacts
          .map((f) => `- ${f.title} (${f.confidence}% confidence)`)
          .join("\n");

        const response = await fetch(gatewayUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: process.env.NVIDIA_NIM_MODEL || "meta/llama-3.1-70b-instruct",
            messages: [
              {
                role: "system",
                content: `You are Cadence, an Apple-inspired personal time and task co-pilot. Keep responses brief, direct, and actionable. Zero patronizing motivational phrases.
Active memory facts about user:
${memoryContext || "No recorded patterns yet."}`,
              },
              { role: "user", content: message },
            ],
            tools: AGENT_TOOLS_DEFINITIONS.map((t) => ({
              type: "function",
              function: t,
            })),
            temperature: 0.2,
            max_tokens: 300,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = (await response.json()) as any;
          const choice = data.choices?.[0]?.message;
          if (choice?.tool_calls && Array.isArray(choice.tool_calls)) {
            for (const call of choice.tool_calls) {
              const name = call.function?.name;
              const args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
              const result = await executeAgentTool(name, args, toolCtx);
              toolCallsExecuted.push({ name, arguments: args, result });
            }
            replyText =
              choice.content ||
              `Executed ${choice.tool_calls.length} action(s) for your request.`;
          } else if (choice?.content) {
            replyText = choice.content;
          }
          gatewaySuccess = true;
        }
      } catch {
        // Fallback to deterministic layer on any error or timeout (Circuit Breaker)
        gatewaySuccess = false;
      }
    }

    if (!gatewaySuccess) {
      // General conversational response incorporating learned profile
      if (activeFacts.length > 0) {
        const topFact = activeFacts[0];
        replyText = `I'm Cadence, your task co-pilot. I currently know that: "${topFact.title}" (${topFact.confidence}% confidence). How can I help with your schedule or tasks today?`;
      } else {
        replyText = "I'm Cadence, your task co-pilot. You can ask me to create tasks, complete items, inspect your schedule, or review learned habits.";
      }
    }
  }

  // 3. Log assistant response to agent_conversations
  await db.insert(agentConversationsTable).values({
    userId,
    channel,
    role: "assistant",
    content: replyText,
    toolCalls: toolCallsExecuted.length > 0 ? toolCallsExecuted : null,
  });

  // 4. Log LLM Telemetry
  const simulatedTokens = message.length + replyText.length;
  await db.insert(llmUsageTable).values({
    userId,
    model: process.env.NVIDIA_NIM_API_KEY ? "meta/llama-3.1-70b-instruct" : "cadence-react-local",
    tokensIn: message.length,
    tokensOut: replyText.length,
    costEstimateCents: Math.round((simulatedTokens / 1000) * 0.1 * 100) / 100,
    endpoint: channel === "telegram" ? "/telegram/webhook" : "/agent/chat",
  });

  // 5. Spend Ceiling Check
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
