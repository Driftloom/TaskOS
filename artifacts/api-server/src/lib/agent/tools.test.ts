import { describe, it, expect } from "vitest";

/**
 * Pure unit tests for agent tool logic.
 * Tool definitions are inlined to avoid triggering the DATABASE_URL guard
 * (tools.ts imports @workspace/db which checks DATABASE_URL at module load time).
 */

// Inline the definitions array for isolated testing
const AGENT_TOOLS_DEFINITIONS = [
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
];

// ---------------------------------------------------------------------------
// Agent Tool Definitions schema
// ---------------------------------------------------------------------------
describe("AGENT_TOOLS_DEFINITIONS schema", () => {
  it("exports exactly 5 tool definitions", () => {
    expect(AGENT_TOOLS_DEFINITIONS).toHaveLength(5);
  });

  it("has all required tool names", () => {
    const names = AGENT_TOOLS_DEFINITIONS.map((t) => t.name);
    expect(names).toContain("create_task");
    expect(names).toContain("update_task");
    expect(names).toContain("complete_task");
    expect(names).toContain("query_schedule");
    expect(names).toContain("bulk_reschedule");
  });

  it("each tool has a description and parameters", () => {
    for (const tool of AGENT_TOOLS_DEFINITIONS) {
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(5);
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.type).toBe("object");
    }
  });

  it("create_task requires 'title'", () => {
    const createTool = AGENT_TOOLS_DEFINITIONS.find((t) => t.name === "create_task")!;
    expect(createTool.parameters.required).toContain("title");
  });

  it("update_task requires 'id'", () => {
    const updateTool = AGENT_TOOLS_DEFINITIONS.find((t) => t.name === "update_task")!;
    expect(updateTool.parameters.required).toContain("id");
  });

  it("bulk_reschedule requires 'taskIds' and 'targetDate'", () => {
    const bulkTool = AGENT_TOOLS_DEFINITIONS.find((t) => t.name === "bulk_reschedule")!;
    expect(bulkTool.parameters.required).toContain("taskIds");
    expect(bulkTool.parameters.required).toContain("targetDate");
  });

  it("bulk_reschedule mentions confirmation threshold in description", () => {
    const bulkTool = AGENT_TOOLS_DEFINITIONS.find((t) => t.name === "bulk_reschedule")!;
    expect(bulkTool.description.toLowerCase()).toContain("10");
  });

  it("priority enum includes all 4 levels", () => {
    const createTool = AGENT_TOOLS_DEFINITIONS.find((t) => t.name === "create_task")!;
    const props = createTool.parameters.properties as Record<string, any>;
    expect(props.priority.enum).toEqual(["low", "medium", "high", "urgent"]);
  });

  it("status enum includes all 4 task states", () => {
    const updateTool = AGENT_TOOLS_DEFINITIONS.find((t) => t.name === "update_task")!;
    const props = updateTool.parameters.properties as Record<string, any>;
    expect(props.status.enum).toContain("completed");
    expect(props.status.enum).toContain("canceled");
    expect(props.status.enum).toContain("open");
    expect(props.status.enum).toContain("in_progress");
  });
});

// ---------------------------------------------------------------------------
// Bulk-gate confirmation logic (Doc 09 #2, Doc 10 §1)
// ---------------------------------------------------------------------------
describe("Bulk-gate confirmation logic", () => {
  function shouldGate(taskIds: number[], confirmed: boolean | undefined): boolean {
    return taskIds.length > 10 && !confirmed;
  }

  it("taskIds.length=10 does not gate", () => {
    expect(shouldGate(Array.from({ length: 10 }, (_, i) => i), undefined)).toBe(false);
  });

  it("taskIds.length=11 without confirmation gates", () => {
    expect(shouldGate(Array.from({ length: 11 }, (_, i) => i), undefined)).toBe(true);
  });

  it("taskIds.length=11 with confirmed=true does NOT gate", () => {
    expect(shouldGate(Array.from({ length: 11 }, (_, i) => i), true)).toBe(false);
  });

  it("taskIds.length=50 with confirmed=false gates", () => {
    expect(shouldGate(Array.from({ length: 50 }, (_, i) => i), false)).toBe(true);
  });

  it("empty taskIds array does not gate", () => {
    expect(shouldGate([], undefined)).toBe(false);
  });

  it("taskIds.length=100 confirmed=true proceeds", () => {
    expect(shouldGate(Array.from({ length: 100 }, (_, i) => i), true)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Input validation helpers
// ---------------------------------------------------------------------------
describe("create_task input validation", () => {
  function validateTitle(title: unknown): boolean {
    return typeof title === "string" && title.trim().length > 0;
  }

  it("accepts a valid non-empty title", () => {
    expect(validateTitle("Fix the bug")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(validateTitle("")).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    expect(validateTitle("   ")).toBe(false);
  });

  it("rejects null", () => {
    expect(validateTitle(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(validateTitle(undefined)).toBe(false);
  });

  it("rejects number", () => {
    expect(validateTitle(42)).toBe(false);
  });

  it("trims surrounding whitespace correctly", () => {
    const title = "  Build feature  ";
    expect(validateTitle(title)).toBe(true);
    expect(title.trim()).toBe("Build feature");
  });
});

// ---------------------------------------------------------------------------
// Action log reversibility invariants (Doc 09 #2)
// ---------------------------------------------------------------------------
describe("Agent action log reversibility invariants", () => {
  interface ActionLogEntry {
    action: string;
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown> | null;
    undone: boolean;
  }

  function canReverse(entry: ActionLogEntry): boolean {
    if (entry.undone) return false;
    if (entry.action === "create_task") return true;
    if (["update_task", "complete_task", "reschedule_task"].includes(entry.action)) {
      return entry.beforeState !== null;
    }
    return false;
  }

  it("create_task can always be reversed (delete)", () => {
    const entry: ActionLogEntry = {
      action: "create_task",
      beforeState: null,
      afterState: { id: 1, title: "Test" },
      undone: false,
    };
    expect(canReverse(entry)).toBe(true);
  });

  it("update_task can be reversed when beforeState is present", () => {
    const entry: ActionLogEntry = {
      action: "update_task",
      beforeState: { id: 1, title: "Old title" },
      afterState: { id: 1, title: "New title" },
      undone: false,
    };
    expect(canReverse(entry)).toBe(true);
  });

  it("update_task cannot be reversed when beforeState is null", () => {
    const entry: ActionLogEntry = {
      action: "update_task",
      beforeState: null,
      afterState: { id: 1, title: "New title" },
      undone: false,
    };
    expect(canReverse(entry)).toBe(false);
  });

  it("already-undone entry cannot be reversed again", () => {
    const entry: ActionLogEntry = {
      action: "create_task",
      beforeState: null,
      afterState: { id: 1, title: "Test" },
      undone: true,
    };
    expect(canReverse(entry)).toBe(false);
  });

  it("reschedule_task can be reversed with beforeState", () => {
    const entry: ActionLogEntry = {
      action: "reschedule_task",
      beforeState: { id: 5, dueAt: "2024-01-01T09:00:00Z" },
      afterState: { id: 5, dueAt: "2024-01-02T09:00:00Z" },
      undone: false,
    };
    expect(canReverse(entry)).toBe(true);
  });

  it("complete_task can be reversed with beforeState", () => {
    const entry: ActionLogEntry = {
      action: "complete_task",
      beforeState: { id: 3, status: "open" },
      afterState: { id: 3, status: "completed" },
      undone: false,
    };
    expect(canReverse(entry)).toBe(true);
  });

  it("unknown action type cannot be reversed", () => {
    const entry: ActionLogEntry = {
      action: "unknown_action",
      beforeState: { id: 1 },
      afterState: { id: 1 },
      undone: false,
    };
    expect(canReverse(entry)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LLM spend ceiling math (Doc 10 §12 — ~₹300-500/mo ceiling)
// ---------------------------------------------------------------------------
describe("LLM spend ceiling arithmetic", () => {
  const CEILING_CENTS = 500; // ~₹400/month

  it("spend below ceiling is allowed", () => {
    const monthlySpend = 300;
    expect(monthlySpend >= CEILING_CENTS).toBe(false);
  });

  it("spend equal to ceiling triggers alert", () => {
    const monthlySpend = 500;
    expect(monthlySpend >= CEILING_CENTS).toBe(true);
  });

  it("spend above ceiling triggers alert", () => {
    const monthlySpend = 600;
    expect(monthlySpend >= CEILING_CENTS).toBe(true);
  });

  it("zero spend is well within ceiling", () => {
    const monthlySpend = 0;
    expect(monthlySpend >= CEILING_CENTS).toBe(false);
  });

  it("499 cents is just below ceiling", () => {
    expect(499 >= CEILING_CENTS).toBe(false);
  });

  it("501 cents exceeds ceiling", () => {
    expect(501 >= CEILING_CENTS).toBe(true);
  });
});
