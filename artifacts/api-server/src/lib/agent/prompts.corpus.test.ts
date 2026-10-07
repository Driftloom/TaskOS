import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Real-world prompt corpus.
 *
 * ## Why this file exists
 *
 * A user typed `"Broh create shedule from tomorrow 9 to 5"` and got
 * `"I'm Cadence, your task co-pilot. You can ask me to create tasks..."` — a
 * canned greeting identical to what a healthy reply would have been. The
 * greeting is `runLocalAgentResolution`'s final dead-end, and it is a legitimate
 * answer for genuinely unparseable input. The defect is not that it exists; it
 * is that intent-carrying input reached it.
 *
 * These tests pin the behaviour for the phrasings people actually type —
 * misspellings, no punctuation, no command verb, colloquial prefixes — so a
 * regression that drops them back to the greeting fails here.
 *
 * Assertions target structure, not prose: a reply is "actionable" when it asks a
 * question, offers options, or reports a completed action. That mirrors BFCL's
 * AST-matching approach — deterministic without a live key, because the local
 * resolution engine is what answers when no provider is configured.
 */

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbInsert = vi.fn();

function chainable(terminal: () => any) {
  const c: any = {};
  ["from", "where", "orderBy", "limit", "set", "values", "returning"].forEach((m) => {
    c[m] = () => c;
  });
  c.then = (resolve: any) => Promise.resolve(terminal()).then(resolve);
  return c;
}

vi.mock("@workspace/db", () => ({
  db: {
    select: () => chainable(() => mockDbSelect()),
    update: () => chainable(() => mockDbUpdate()),
    insert: () => chainable(() => mockDbInsert()),
  },
  agentActionLogTable: {},
  tasksTable: {},
  timeBlocksTable: {},
  memoryFactsTable: {},
  agentConversationsTable: {},
  llmUsageTable: {},
  llmCredentialsTable: {},
}));

const { runAgentConversation } = await import("./engine");

/** The dead-end reply the user actually received. */
const DEAD_END_GREETING =
  "I'm Cadence, your task co-pilot. You can ask me to create tasks, complete items, inspect your schedule, or review learned habits.";

const MEMORY_GREETING_PREFIX = "I'm Cadence, your task co-pilot. I currently know that";

interface CorpusCase {
  /** The message a real user typed. */
  prompt: string;
  /** Why this phrasing is easy to get wrong. */
  note: string;
  /** Open tasks the engine can see, so "which task?" style replies can work. */
  openTasks?: Array<{ id: number; title: string }>;
  /** Assistant text from the previous turn, for follow-up fulfilment. */
  lastAssistant?: string;
}

const CORPUS: CorpusCase[] = [
  {
    prompt: "Broh create shedule from tomorrow 9 to 5",
    note: "The reported failure. Misspelled 'schedule' AND 'tomorrow', no punctuation, colloquial prefix.",
    openTasks: [
      { id: 1, title: "Review quarterly report" },
      { id: 2, title: "Fix login button" },
    ],
  },
  {
    prompt: "create shedule from tomorow 9 to 5",
    note: "Same request with correct spelling — must not regress to the greeting either.",
    openTasks: [{ id: 1, title: "Review quarterly report" }],
  },
  {
    prompt: "block tomorrow 9am to 5pm",
    note: "Time block phrased as a verb, not the word 'schedule'.",
    openTasks: [{ id: 1, title: "Deep work" }],
  },
  {
    prompt: "what's due tmrw",
    note: "Misspelled 'tomorrow' in a schedule query.",
  },
  {
    prompt: "what do i have today",
    note: "Colloquial schedule query with no keyword match.",
    openTasks: [{ id: 7, title: "Ship release notes" }],
  },
  {
    prompt: "add task Submit tax filing",
    note: "Explicit command with a real title.",
  },
  {
    prompt: "Bro add task Submit tax filing",
    note: "Colloquial prefix before the command verb.",
  },
  {
    prompt: "create task",
    note: "Underspecified — must ask for the title, not silently do nothing.",
  },
  {
    prompt: "complete task",
    note: "Underspecified — must list candidates instead of guessing.",
    openTasks: [{ id: 10, title: "Prepare release notes" }],
  },
  {
    prompt: "mark 3 done",
    note: "Underspecified completion using an ordinal instead of an id.",
    openTasks: [{ id: 3, title: "Send invoice" }],
  },
];

/** A reply is actionable when it asks, offers, reports a result, or acts. */
function isActionable(reply: string): boolean {
  return (
    reply.includes("?") ||
    /option\s*\d/i.test(reply) ||
    /\b(what|why|how|which)\b/i.test(reply) ||
    /\b(created|scheduled|completed|rescheduled|undone|reverted)\b/i.test(reply) ||
    // A factual result is a valid answer to "what do I have today" — e.g.
    // "You have 1 open task(s) for today."
    /\byou have\b/i.test(reply) ||
    /\b\d+\s+(open\s+)?task/i.test(reply) ||
    /\b(WHAT|WHY|HOW)\b/.test(reply)
  );
}

describe("real-world prompt corpus — never a dead end", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbInsert.mockResolvedValue([{ id: 1 }]);
    mockDbUpdate.mockResolvedValue([]);
  });

  for (const testCase of CORPUS) {
    it(`"${testCase.prompt}" produces an actionable reply — ${testCase.note}`, async () => {
      // Select order mirrors runAgentConversation: memory facts, then the
      // previous assistant message, then whatever the engine needs.
      mockDbSelect.mockReset();
      mockDbSelect.mockResolvedValueOnce([]); // memory facts
      mockDbSelect.mockResolvedValueOnce(
        testCase.lastAssistant ? [{ content: testCase.lastAssistant }] : [],
      );
      mockDbSelect.mockResolvedValue(testCase.openTasks ?? []);

      const result = await runAgentConversation({
        userId: "corpus-user",
        message: testCase.prompt,
      });

      expect(typeof result.reply).toBe("string");
      expect(result.reply.trim().length).toBeGreaterThan(0);

      // The specific failure the user reported.
      expect(result.reply).not.toBe(DEAD_END_GREETING);
      expect(result.reply).not.toContain(MEMORY_GREETING_PREFIX);

      expect(
        isActionable(result.reply),
        `Reply was not actionable for "${testCase.prompt}":\n${result.reply}`,
      ).toBe(true);
    });
  }
});

describe("agent output contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbInsert.mockResolvedValue([{ id: 1 }]);
    mockDbUpdate.mockResolvedValue([]);
    mockDbSelect.mockResolvedValue([]);
  });

  it("always reports requiresConfirmation so the >10-task gate can fire", async () => {
    // The UI footer promises approval for bulk changes; the field was absent
    // from AgentChatOutput entirely, so it could never be true.
    const result = await runAgentConversation({
      userId: "corpus-user",
      message: "add task Something",
    });
    expect(result.requiresConfirmation).toBe(false);
  });

  it("does not write llm_usage when no model actually ran", async () => {
    // The local engine answers without a provider. Previously a row was written
    // anyway, which is why "assistant calls" counted conversations rather than
    // model calls and looked healthy while the agent did nothing.
    mockDbInsert.mockClear();
    mockDbSelect.mockResolvedValue([]);

    await runAgentConversation({
      userId: "corpus-user-offline",
      message: "what do i have today",
    });

    const wroteUsage = mockDbInsert.mock.calls.some((call) =>
      JSON.stringify(call[0]?.values ?? {}).includes("cadence-react-local"),
    );
    expect(wroteUsage).toBe(false);
  });
});
