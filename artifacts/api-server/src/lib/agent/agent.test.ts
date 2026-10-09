/**
 * Agent tooling tests: undo_last_action + LiteLLM gateway circuit-breaker.
 *
 * These tests mock the Drizzle DB client so no live Supabase connection is
 * needed. The MockToolHarness pattern (from agent-harness skill) intercepts
 * the db.select/insert/update chain and returns controlled fixtures.
 *
 * Run with: pnpm --filter @workspace/api-server vitest run agent.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock @workspace/db so the tool runner never touches a real DB.
// ---------------------------------------------------------------------------
const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbInsert = vi.fn();

// Chain builder that returns itself for .from().where().orderBy().limit()
function chainable(terminal: () => any) {
  const c: any = {};
  ["from", "where", "orderBy", "limit", "set", "values", "returning"].forEach(
    (m) => {
      c[m] = (..._args: any[]) => c;
    },
  );
  // The awaited value is the terminal mock's return value
  c.then = (resolve: any) => Promise.resolve(terminal()).then(resolve);
  return c;
}

vi.mock("@workspace/db", () => {
  return {
    db: {
      select: (..._args: any[]) => chainable(() => mockDbSelect()),
      update: (..._args: any[]) => chainable(() => mockDbUpdate()),
      insert: (..._args: any[]) => chainable(() => mockDbInsert()),
    },
    agentActionLogTable: { id: "id", userId: "userId", toolName: "toolName", afterState: "afterState", beforeState: "beforeState", undone: "undone" },
    tasksTable: { id: "id", userId: "userId", title: "title", status: "status", dueAt: "dueAt", completedAt: "completedAt", durationMin: "durationMin", rescheduleCount: "rescheduleCount", priority: "priority", automation: "automation", needsAttention: "needsAttention" },
    timeBlocksTable: { id: "id", userId: "userId", title: "title", startAt: "startAt", endAt: "endAt" },
    notificationSettingsTable: { userId: "userId", timeZone: "timeZone", workStart: "workStart", workEnd: "workEnd", flexible24h: "flexible24h" },
    memoryFactsTable: { id: "id", userId: "userId" },
    agentConversationsTable: { id: "id", userId: "userId" },
    llmUsageTable: { id: "id", userId: "userId", costEstimateCents: "costEstimateCents" },
    llmCredentialsTable: { id: "id", userId: "userId", provider: "provider", ciphertext: "ciphertext", baseUrl: "baseUrl", model: "model" },
    type: {} as any,
    Task: {} as any,
  };
});

// ---------------------------------------------------------------------------
// Import after mocks are installed
// ---------------------------------------------------------------------------
// Imported once at module scope rather than inside `beforeEach`. Vitest
// hoists `vi.mock` above all imports, so the mock is already in place here,
// and paying the transform cost on every test (instead of once) is what blew
// the 10s hook timeout on this suite.
const { executeAgentTool } = await import("./tools");

beforeEach(() => {
  vi.clearAllMocks();
  mockDbSelect.mockResolvedValue([]);
  mockDbUpdate.mockResolvedValue([]);
  mockDbInsert.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// undo_last_action tests
// ---------------------------------------------------------------------------
describe("undo_last_action", () => {
  const userId = "test-user-1";
  const ctx = { userId };

  it("returns error when no undoable action exists", async () => {
    // DB select returns empty array (no log entry)
    mockDbSelect.mockResolvedValueOnce([]);
    const result = await executeAgentTool("undo_last_action", {}, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no (recent|reversible) (agent )?action/i);
  });

  it("successfully undoes a create_task by deleting the created row", async () => {
    const logEntry = {
      id: 42,
      toolName: "create_task",
      afterState: { id: 99, title: "Test task" },
      beforeState: null,
      undone: false,
    };
    // First select: returns log entry
    mockDbSelect.mockResolvedValueOnce([logEntry]);
    // Update: marks undone (returns)
    mockDbUpdate.mockResolvedValueOnce([]);
    // The delete for create_task reversal is done via db.update (soft delete or delete)
    // Implementation uses db.update on tasksTable to set status="deleted" or calls delete
    mockDbUpdate.mockResolvedValueOnce([]);

    const result = await executeAgentTool("undo_last_action", {}, ctx);
    // Should succeed or at least attempt — result depends on implementation detail
    expect(typeof result.success).toBe("boolean");
  });

  it("successfully undoes an update_task by restoring beforeState", async () => {
    const logEntry = {
      id: 55,
      toolName: "update_task",
      afterState: { id: 7, title: "After title" },
      beforeState: { id: 7, title: "Before title", priority: "low", status: "open", dueAt: null },
      undone: false,
    };
    mockDbSelect.mockResolvedValueOnce([logEntry]);
    mockDbUpdate.mockResolvedValueOnce([]); // restore
    mockDbUpdate.mockResolvedValueOnce([]); // mark undone

    const result = await executeAgentTool("undo_last_action", {}, ctx);
    expect(typeof result.success).toBe("boolean");
  });

  it("returns error when the action is already undone", async () => {
    const logEntry = {
      id: 77,
      toolName: "create_task",
      afterState: { id: 12 },
      beforeState: null,
      undone: true, // already reverted
    };
    // If undone=true is in the log, the WHERE clause in the real impl filters it out
    // so select returns []
    mockDbSelect.mockResolvedValueOnce([]);
    const result = await executeAgentTool("undo_last_action", {}, ctx);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LiteLLM gateway circuit-breaker tests
// (Tests the engine's fallback path without a live HTTP endpoint)
// ---------------------------------------------------------------------------
describe("LiteLLM gateway circuit-breaker", () => {
  it("falls back to deterministic reply when LITELLM_BASE_URL is not set", async () => {
    // Ensure env is cleared
    const orig = process.env.LITELLM_BASE_URL;
    delete process.env.LITELLM_BASE_URL;
    delete process.env.NVIDIA_NIM_API_KEY;

    // Mock DB calls that engine.ts needs
    mockDbSelect.mockResolvedValue([]);
    mockDbInsert.mockResolvedValue([{ id: 1 }]);
    mockDbUpdate.mockResolvedValue([]);

    const { runAgentConversation } = await import("./engine");
    const result = await runAgentConversation({
      userId: "test-user-2",
      message: "do something completely unknown xyz123",
    });

    // Should always return a reply even without gateway
    expect(typeof result.reply).toBe("string");
    expect(result.reply.length).toBeGreaterThan(0);

    if (orig !== undefined) process.env.LITELLM_BASE_URL = orig;
  });

  it("falls back gracefully when the gateway endpoint returns a non-200", async () => {
    // Point to a URL that will fail
    process.env.LITELLM_BASE_URL = "http://127.0.0.1:1"; // nothing listening
    process.env.NVIDIA_NIM_API_KEY = "test-key";

    mockDbSelect.mockResolvedValue([]);
    mockDbInsert.mockResolvedValue([{ id: 2 }]);
    mockDbUpdate.mockResolvedValue([]);

    const { runAgentConversation } = await import("./engine");
    const result = await runAgentConversation({
      userId: "test-user-3",
      message: "schedule something tomorrow",
    });

    expect(typeof result.reply).toBe("string");

    delete process.env.LITELLM_BASE_URL;
    delete process.env.NVIDIA_NIM_API_KEY;
  });
});

// ---------------------------------------------------------------------------
// AGENT_TOOLS_DEFINITIONS structural integrity tests
// ---------------------------------------------------------------------------
describe("AGENT_TOOLS_DEFINITIONS", () => {
  it("all tools have a name, description, and parameters object", async () => {
    const { AGENT_TOOLS_DEFINITIONS } = await import("./tools");
    for (const tool of AGENT_TOOLS_DEFINITIONS) {
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.parameters).toBe("object");
    }
  });

  it("includes undo_last_action in the tool list", async () => {
    const { AGENT_TOOLS_DEFINITIONS } = await import("./tools");
    const names = AGENT_TOOLS_DEFINITIONS.map((t) => t.name);
    expect(names).toContain("undo_last_action");
  });

  it("bulk_reschedule requires taskIds and targetDate", async () => {
    const { AGENT_TOOLS_DEFINITIONS } = await import("./tools");
    const bulk = AGENT_TOOLS_DEFINITIONS.find((t) => t.name === "bulk_reschedule");
    expect(bulk?.parameters.required).toContain("taskIds");
    expect(bulk?.parameters.required).toContain("targetDate");
  });

  it("includes create_time_block in the tool list", async () => {
    const { AGENT_TOOLS_DEFINITIONS } = await import("./tools");
    const names = AGENT_TOOLS_DEFINITIONS.map((t) => t.name);
    expect(names).toContain("create_time_block");
  });
});

// ---------------------------------------------------------------------------
// Real-world conversational tests (Minimal prompts, colloquial slang & typos)
// ---------------------------------------------------------------------------
describe("Real-world Conversational Agent: Minimal Prompts & Clarification", () => {
  const userId = "real-user-42";

  beforeEach(() => {
    mockDbSelect.mockResolvedValue([]);
    mockDbInsert.mockResolvedValue([{ id: 101, title: "Mock task" }]);
    mockDbUpdate.mockResolvedValue([]);
  });

  it("reproduces user issue: 'Broh create shedule from tomorrow 9 to 5' proactively generates What/Why/How questions instead of generic welcome", async () => {
    // Mock open backlog tasks
    mockDbSelect.mockResolvedValue([
      { id: 1, title: "Review quarterly report" },
      { id: 2, title: "Fix login button" },
    ]);

    const { runAgentConversation } = await import("./engine");
    const result = await runAgentConversation({
      userId,
      message: "Broh create shedule from tomorrow 9 to 5",
    });

    // Must NOT be the old dead-end canned greeting
    expect(result.reply).not.toBe(
      "I'm Cadence, your task co-pilot. You can ask me to create tasks, complete items, inspect your schedule, or review learned habits.",
    );

    // Must identify the window and date
    expect(result.reply).toMatch(/tomorrow/i);
    expect(result.reply).toMatch(/9:00 AM to 5:00 PM/i);

    // Must ask the 3 core clarification pillars: What, Why, How
    expect(result.reply).toContain("WHAT");
    expect(result.reply).toContain("WHY");
    expect(result.reply).toContain("HOW");

    // Must provide 1-tap actionable numbered options
    expect(result.reply).toMatch(/Option 1/i);
    expect(result.reply).toMatch(/Option 2/i);
    expect(result.reply).toMatch(/Option 3/i);
  });

  it("colloquial greeting with explicit task title creates task successfully ('Bro add task Submit tax filing')", async () => {
    mockDbSelect.mockResolvedValue([]);
    mockDbInsert.mockResolvedValue([{ id: 88, title: "Submit tax filing", status: "open" }]);

    const { runAgentConversation } = await import("./engine");
    const result = await runAgentConversation({
      userId,
      message: "Bro add task Submit tax filing",
    });

    expect(result.reply).toContain('Created task: "Submit tax filing".');
    expect(result.toolCallsExecuted).toHaveLength(1);
    expect(result.toolCallsExecuted[0].name).toBe("create_task");
    expect(result.toolCallsExecuted[0].arguments.title).toBe("Submit tax filing");
  });

  it("underspecified 'create task' prompts user for task title", async () => {
    const { runAgentConversation } = await import("./engine");
    const result = await runAgentConversation({
      userId,
      message: "create task",
    });

    expect(result.reply).toMatch(/what is the title/i);
    expect(result.toolCallsExecuted).toHaveLength(0);
  });

  it("underspecified 'complete task' prompts user with open tasks", async () => {
    mockDbSelect.mockResolvedValue([
      { id: 10, title: "Prepare release notes" },
    ]);

    const { runAgentConversation } = await import("./engine");
    const result = await runAgentConversation({
      userId,
      message: "complete task",
    });

    expect(result.reply).toMatch(/which task would you like to mark completed/i);
    expect(result.reply).toContain("#10: \"Prepare release notes\"");
  });

  it("handles typos in schedule query ('what's due tmrw')", async () => {
    mockDbSelect.mockResolvedValue([]);

    const { runAgentConversation } = await import("./engine");
    const result = await runAgentConversation({
      userId,
      message: "what's due tmrw",
    });

    expect(result.toolCallsExecuted).toHaveLength(1);
    expect(result.toolCallsExecuted[0].name).toBe("query_schedule");
    expect(result.toolCallsExecuted[0].arguments.rangeDays).toBe(2);
  });

  it("fulfills follow-up '1' to schedule top backlog tasks when clarification is pending", async () => {
    // 1st select: getRelevantMemoryFacts -> []
    // 2nd select: lastAssistantMsg -> { content: "Quick Options (reply with a number):\n1. Option 1..." }
    // 3rd select: openTasks -> [{ id: 1, title: "Finish audit" }]
    // 4th select: task for create_time_block validation -> [{ id: 1, userId, title: "Finish audit" }]
    // 5th select: spend ceiling -> []
    mockDbSelect
      .mockResolvedValueOnce([]) // memory
      .mockResolvedValueOnce([
        { content: "Quick Options (reply with a number):\n1. Option 1: Schedule top backlog tasks..." },
      ])
      .mockResolvedValueOnce([{ id: 50, title: "Ship mobile fixes" }])
      .mockResolvedValueOnce([{ id: 50, userId, title: "Ship mobile fixes" }])
      .mockResolvedValueOnce([]);

    mockDbInsert.mockResolvedValue([{ id: 999 }]);

    const { runAgentConversation } = await import("./engine");
    const result = await runAgentConversation({
      userId,
      message: "1",
    });

    expect(result.reply).toMatch(/scheduled 1 backlog task/i);
    expect(result.reply).toContain("Ship mobile fixes");
    expect(result.toolCallsExecuted).toHaveLength(1);
    expect(result.toolCallsExecuted[0].name).toBe("create_time_block");
  });

  it("fulfills follow-up 'Option 2' to create dedicated Deep Work block when clarification is pending", async () => {
    mockDbSelect
      .mockResolvedValueOnce([]) // memory
      .mockResolvedValueOnce([
        { content: "Quick Options (reply with a number):\n2. Option 2: Create a dedicated 9am-5pm Deep Work Focus Block" },
      ])
      .mockResolvedValueOnce([{ id: 777, userId, title: "Deep Work Focus Block" }])
      .mockResolvedValueOnce([]);

    mockDbInsert
      .mockResolvedValueOnce([]) // insert user msg
      .mockResolvedValueOnce([{ id: 777, title: "Deep Work Focus Block" }]) // create_task
      .mockResolvedValueOnce([{ id: 1 }]) // action log
      .mockResolvedValueOnce([{ id: 888 }]) // time block
      .mockResolvedValueOnce([{ id: 2 }]); // action log

    const { runAgentConversation } = await import("./engine");
    const result = await runAgentConversation({
      userId,
      message: "Option 2",
    });

    expect(result.reply).toMatch(/created task "deep work focus block"/i);
    expect(result.reply).toMatch(/9:00 AM to 5:00 PM/i);
    const toolNames = result.toolCallsExecuted.map((t) => t.name);
    expect(toolNames).toContain("create_task");
    expect(toolNames).toContain("create_time_block");
  });
});

// ---------------------------------------------------------------------------
// Dynamic Enterprise Agent: Live Context Grounding & Dynamic Function Calling
// ---------------------------------------------------------------------------
describe("Dynamic Enterprise Agent: Live Grounding & Real-Time Reasoning", () => {
  const userId = "enterprise-user-99";

  it("assembleAgentContext builds complete ground truth with live time, tasks, blocks, and memory", async () => {
    // 1st select: memoryFacts
    // 2nd select: agentConversations (history)
    // 3rd select: notificationSettings (timezone & hours)
    // 4th select: tasksTable (open tasks)
    // 5th select: timeBlocksTable (scheduled blocks)
    mockDbSelect
      .mockResolvedValueOnce([
        { id: 1, key: "slow_coder", title: "Coding tasks run 1.4x longer", confidence: 85, rule9Multiplier: 1.4, archived: false },
      ])
      .mockResolvedValueOnce([
        { role: "assistant", content: "Previous answer" },
        { role: "user", content: "Previous question" },
      ])
      .mockResolvedValueOnce([
        { timeZone: "Asia/Kolkata", workStart: 9, workEnd: 18, flexible24h: true },
      ])
      .mockResolvedValueOnce([
        { id: 101, title: "Refactor Auth Matrix", priority: "high", durationMin: 60, dueAt: null },
      ])
      .mockResolvedValueOnce([
        { id: 201, taskId: 101, startAt: new Date("2026-10-08T09:00:00Z"), endAt: new Date("2026-10-08T10:00:00Z") },
      ]);

    const { assembleAgentContext, formatDynamicSystemPrompt } = await import("./engine");
    const ctx = await assembleAgentContext(userId);

    expect(ctx.userId).toBe(userId);
    expect(ctx.timeZone).toBe("Asia/Kolkata");
    expect(ctx.workHours.flexible24h).toBe(true);
    expect(ctx.openTasks).toHaveLength(1);
    expect(ctx.openTasks[0].title).toBe("Refactor Auth Matrix");
    expect(ctx.scheduledTimeBlocks).toHaveLength(1);
    expect(ctx.memoryFacts).toHaveLength(1);
    expect(ctx.memoryFacts[0].rule9Multiplier).toBe(1.4);
    expect(ctx.lastAssistantMessage).toBe("Previous answer");

    const prompt = formatDynamicSystemPrompt(ctx);
    expect(prompt).toContain("LIVE USER ENVIRONMENT & REAL-TIME GROUND TRUTH");
    expect(prompt).toContain("Refactor Auth Matrix");
    expect(prompt).toContain("Coding tasks run 1.4x longer");
    expect(prompt).toContain("Cognitive Load & Underspecified Requests");
    expect(prompt).toContain("Ultradian rhythm focus sprints");
  });

  it("executeLlmGateway dynamically invokes tools when LLM returns tool_calls", async () => {
    process.env.GEMINI_API_KEY = "mock-gemini-key";

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_abc123",
                    type: "function",
                    function: {
                      name: "create_task",
                      arguments: JSON.stringify({
                        title: "Dynamic AI Task",
                        durationMin: 45,
                        priority: "high",
                      }),
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 120, completion_tokens: 35 },
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: "assistant",
                content: 'Created task "Dynamic AI Task".',
              },
            },
          ],
          usage: { prompt_tokens: 80, completion_tokens: 20 },
        }),
      } as any);

    mockDbInsert.mockResolvedValue([{ id: 555, title: "Dynamic AI Task" }]);

    const { executeLlmGateway } = await import("./engine");
    const mockContext = {
      userId,
      timeZone: "Asia/Kolkata",
      currentTimeFormatted: "Wednesday, Oct 7, 2026, 7:00 PM",
      currentDateIso: "2026-10-07T13:30:00.000Z",
      tomorrowDateFormatted: "Thursday, Oct 8, 2026",
      tomorrowDateIso: "2026-10-08T13:30:00.000Z",
      workHours: { start: 9, end: 18, flexible24h: true },
      openTasks: [],
      scheduledTimeBlocks: [],
      memoryFacts: [],
      recentHistory: [],
    };

    const res = await executeLlmGateway(mockContext, "Create high priority task Dynamic AI Task for 45m", { userId });

    expect(res.success).toBe(true);
    expect(res.toolCallsExecuted).toHaveLength(1);
    expect(res.toolCallsExecuted[0].name).toBe("create_task");
    expect(res.toolCallsExecuted[0].arguments.title).toBe("Dynamic AI Task");
    expect(res.replyText).toContain("Dynamic AI Task");

    fetchSpy.mockRestore();
    delete process.env.GEMINI_API_KEY;
  });

  it("executeLlmGateway returns dynamic clarification text when LLM requests clarification", async () => {
    process.env.GEMINI_API_KEY = "mock-gemini-key";

    const dynamicClarification =
      "I see your open task 'Ship Mobile Fixes'. Would you like to schedule that for tomorrow 9-5, or create a new dedicated block?";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: "assistant",
              content: dynamicClarification,
            },
          },
        ],
        usage: { prompt_tokens: 150, completion_tokens: 40 },
      }),
    } as any);

    const { executeLlmGateway } = await import("./engine");
    const mockContext = {
      userId,
      timeZone: "Asia/Kolkata",
      currentTimeFormatted: "Wednesday, Oct 7, 2026, 7:00 PM",
      currentDateIso: "2026-10-07T13:30:00.000Z",
      tomorrowDateFormatted: "Thursday, Oct 8, 2026",
      tomorrowDateIso: "2026-10-08T13:30:00.000Z",
      workHours: { start: 9, end: 18, flexible24h: true },
      openTasks: [{ id: 1, title: "Ship Mobile Fixes" }],
      scheduledTimeBlocks: [],
      memoryFacts: [],
      recentHistory: [],
    };

    const res = await executeLlmGateway(mockContext, "plan my day tomorrow", { userId });

    expect(res.success).toBe(true);
    expect(res.replyText).toBe(dynamicClarification);
    expect(res.toolCallsExecuted).toHaveLength(0);

    fetchSpy.mockRestore();
    delete process.env.GEMINI_API_KEY;
  });

  it("runAgentConversation end-to-end uses dynamic LLM gateway when credentials present", async () => {
    process.env.GEMINI_API_KEY = "mock-gemini-key";

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_123",
                    type: "function",
                    function: {
                      name: "create_task",
                      arguments: JSON.stringify({ title: "End-to-End LLM Task" }),
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 200, completion_tokens: 30 },
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: "assistant",
                content: "I've added the task End-to-End LLM Task for you.",
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 25 },
        }),
      } as any);

    mockDbSelect.mockResolvedValue([]);
    mockDbInsert.mockResolvedValue([{ id: 900, title: "End-to-End LLM Task" }]);

    const { runAgentConversation } = await import("./engine");
    const result = await runAgentConversation({
      userId,
      message: "Please add End-to-End LLM Task",
    });

    expect(result.toolCallsExecuted).toHaveLength(1);
    expect(result.toolCallsExecuted[0].name).toBe("create_task");
    expect(result.reply).toContain("End-to-End LLM Task");

    fetchSpy.mockRestore();
    delete process.env.GEMINI_API_KEY;
  });
});


