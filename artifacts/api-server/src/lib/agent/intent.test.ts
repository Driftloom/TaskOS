import { describe, it, expect } from "vitest";
import {
  normalizePrompt,
  parseTimeWindow,
  classifyAgentIntent,
  generateScheduleClarification,
} from "./intent";

describe("Agent Intent Normalization & Preprocessing", () => {
  it("strips colloquial greetings ('broh', 'hey', 'yo', 'cadence')", () => {
    expect(normalizePrompt("Broh create task Buy milk")).toBe("create task buy milk");
    expect(normalizePrompt("Hey cadence add task Review PR")).toBe("add task review pr");
    expect(normalizePrompt("Yo schedule tomorrow 9 to 5")).toBe("schedule tomorrow 9 to 5");
    expect(normalizePrompt("Please create task Write docs")).toBe("create task write docs");
  });

  it("corrects common typing errors for schedule and dates", () => {
    expect(normalizePrompt("create shedule from tomorrow 9 to 5")).toBe(
      "create schedule from tomorrow 9 to 5",
    );
    expect(normalizePrompt("schdule tmrw 10 to 12")).toBe(
      "schedule tomorrow 10 to 12",
    );
    expect(normalizePrompt("plan tommorow")).toBe("plan tomorrow");
  });

  it("handles user's exact reported prompt 'Broh create shedule from tomorrow 9 to 5'", () => {
    const normalized = normalizePrompt("Broh create shedule from tomorrow 9 to 5");
    expect(normalized).toBe("create schedule from tomorrow 9 to 5");
  });
});

describe("Time Window Extraction", () => {
  it("extracts 9 to 5 as a standard 8-hour workday window (09:00 - 17:00)", () => {
    const window = parseTimeWindow("create schedule from tomorrow 9 to 5");
    expect(window).not.toBeNull();
    expect(window?.startHour).toBe(9);
    expect(window?.startMinute).toBe(0);
    expect(window?.endHour).toBe(17);
    expect(window?.endMinute).toBe(0);
    expect(window?.durationHours).toBe(8);
  });

  it("extracts explicit 10am to 2pm window", () => {
    const window = parseTimeWindow("block 10am to 2pm for deep work");
    expect(window).not.toBeNull();
    expect(window?.startHour).toBe(10);
    expect(window?.endHour).toBe(14);
    expect(window?.durationHours).toBe(4);
  });

  it("extracts 24h format 13:00 to 17:00", () => {
    const window = parseTimeWindow("schedule tomorrow 13:00 to 17:00");
    expect(window).not.toBeNull();
    expect(window?.startHour).toBe(13);
    expect(window?.endHour).toBe(17);
    expect(window?.durationHours).toBe(4);
  });
});

describe("Intent Classification", () => {
  it("classifies 'Broh create shedule from tomorrow 9 to 5' as underspecified create_schedule", () => {
    const intent = classifyAgentIntent("Broh create shedule from tomorrow 9 to 5");
    expect(intent.type).toBe("create_schedule");
    expect(intent.isUnderspecified).toBe(true);
    expect(intent.entities.dateRef).toBe("tomorrow");
    expect(intent.entities.timeWindow).toBeDefined();
    expect(intent.entities.timeWindow?.durationHours).toBe(8);
  });

  it("classifies task creation with title and extracts title cleanly", () => {
    const intent = classifyAgentIntent("Bro add task Submit quarterly tax filing");
    expect(intent.type).toBe("create_task");
    expect(intent.isUnderspecified).toBe(false);
    expect(intent.entities.taskTitle).toBe("Submit quarterly tax filing");
  });

  it("flags bare 'create task' as underspecified", () => {
    const intent = classifyAgentIntent("create task");
    expect(intent.type).toBe("create_task");
    expect(intent.isUnderspecified).toBe(true);
  });

  it("flags bare 'complete task' without ID as underspecified", () => {
    const intent = classifyAgentIntent("complete task");
    expect(intent.type).toBe("complete_task");
    expect(intent.isUnderspecified).toBe(true);
  });

  it("classifies 'complete task 42' with ID", () => {
    const intent = classifyAgentIntent("complete task 42");
    expect(intent.type).toBe("complete_task");
    expect(intent.isUnderspecified).toBe(false);
    expect(intent.entities.taskId).toBe(42);
  });

  it("classifies query schedule with slang and typos ('what's due tmrw')", () => {
    const intent = classifyAgentIntent("what's due tmrw");
    expect(intent.type).toBe("query_schedule");
    expect(intent.entities.dateRef).toBe("tomorrow");
  });

  it("classifies natural language 'create a task to test cadence'", () => {
    const intent = classifyAgentIntent("create a task to test cadence");
    expect(intent.type).toBe("create_task");
    expect(intent.isUnderspecified).toBe(false);
    expect(intent.entities.taskTitle).toBe("test cadence");
  });

  it("classifies user's exact prompt 'create a task to review system architecture'", () => {
    const intent = classifyAgentIntent("create a task to review system architecture");
    expect(intent.type).toBe("create_task");
    expect(intent.isUnderspecified).toBe(false);
    expect(intent.entities.taskTitle).toBe("review system architecture");
  });

  it("classifies variations like 'I want to create a task to review system architecture' and 'todo: review system architecture'", () => {
    const intent1 = classifyAgentIntent("I want to create a task to review system architecture");
    expect(intent1.type).toBe("create_task");
    expect(intent1.entities.taskTitle).toBe("review system architecture");

    const intent2 = classifyAgentIntent("todo: review system architecture");
    expect(intent2.type).toBe("create_task");
    expect(intent2.entities.taskTitle).toBe("review system architecture");
  });

  it("classifies 'remind me to call mom'", () => {
    const intent = classifyAgentIntent("remind me to call mom");
    expect(intent.type).toBe("create_task");
    expect(intent.isUnderspecified).toBe(false);
    expect(intent.entities.taskTitle).toBe("call mom");
  });

  it("classifies 'confirm' and 'proceed' as confirm intent", () => {
    expect(classifyAgentIntent("confirm").type).toBe("confirm");
    expect(classifyAgentIntent("proceed").type).toBe("confirm");
    expect(classifyAgentIntent("yes, confirm").type).toBe("confirm");
  });

  it("handles user's exact quoted prompt with temporal point-in-time '\"create a task to review sprint deliverables tomorrow at 4pm\"'", () => {
    const intent = classifyAgentIntent('"create a task to review sprint deliverables tomorrow at 4pm"');
    expect(intent.type).toBe("create_task");
    expect(intent.isUnderspecified).toBe(false);
    expect(intent.entities.taskTitle).toBe("review sprint deliverables");
    expect(intent.entities.dateRef).toBe("tomorrow");
    expect(intent.entities.pointInTime).toBeDefined();
    expect(intent.entities.pointInTime?.formatted).toBe("4 PM");
    expect(intent.entities.dueAtIso).toBeDefined();
  });

  it("classifies greetings cleanly ('hi', 'hello', 'hey cadence')", () => {
    expect(classifyAgentIntent("hi").type).toBe("greeting");
    expect(classifyAgentIntent("hello").type).toBe("greeting");
    expect(classifyAgentIntent("hey cadence").type).toBe("greeting");
    expect(classifyAgentIntent("good morning!").type).toBe("greeting");
  });

  it("classifies model switching requests ('switch to gemini 1.5 pro', 'use groq', 'switch model')", () => {
    const res1 = classifyAgentIntent("Broh switch to gemini 1.5 pro");
    expect(res1.type).toBe("switch_model");
    expect(res1.entities.targetModel).toBe("gemini-1.5-pro");
    expect(res1.entities.targetProvider).toBe("gemini");

    const res2 = classifyAgentIntent("switch model to groq");
    expect(res2.type).toBe("switch_model");
    expect(res2.entities.targetModel).toBe("llama-3.3-70b-versatile");
    expect(res2.entities.targetProvider).toBe("groq");

    const res3 = classifyAgentIntent("use gemini 2.0 flash");
    expect(res3.type).toBe("switch_model");
    expect(res3.entities.targetModel).toBe("gemini-2.0-flash");
    expect(res3.entities.targetProvider).toBe("gemini");

    const res4 = classifyAgentIntent("what model are you using?");
    expect(res4.type).toBe("switch_model");
    expect(res4.isUnderspecified).toBe(false);
  });
});

describe("Clarification Generation", () => {
  it("generates structured What, Why, How questions and options for 9 to 5 schedule", () => {
    const intent = classifyAgentIntent("Broh create shedule from tomorrow 9 to 5");
    const clarification = generateScheduleClarification(intent, [
      { id: 1, title: "Review PR #42" },
      { id: 2, title: "Finish audit report" },
    ]);

    expect(clarification).toContain("9:00 AM to 5:00 PM");
    expect(clarification).toContain("WHAT");
    expect(clarification).toContain("WHY");
    expect(clarification).toContain("HOW");
    expect(clarification).toContain("Review PR #42");
    expect(clarification).toContain("Option 1");
    expect(clarification).toContain("Option 2");
  });
});
