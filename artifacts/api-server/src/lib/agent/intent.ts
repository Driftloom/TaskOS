/**
 * Intent Normalization, Classification, and Clarification Subsystem.
 *
 * Provides resilient natural language pre-processing for conversational agent
 * requests:
 * 1. Strips colloquial greetings ("Broh", "Hey cadence", "Yo", etc.).
 * 2. Normalizes pervasive mobile keyboard typos ("shedule", "tmrw", "tommorow").
 * 3. Extracts temporal windows ("9 to 5" -> 09:00 to 17:00, 8h).
 * 4. Identifies underspecified intents and synthesizes structured What/Why/How
 *    clarification dialogues with 1-tap actionable options.
 */

export interface TimeWindow {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  durationHours: number;
  formatted: string;
}

export type AgentIntentType =
  | "create_schedule"
  | "create_task"
  | "complete_task"
  | "query_schedule"
  | "bulk_reschedule"
  | "undo"
  | "unknown";

export interface ClassifiedIntent {
  type: AgentIntentType;
  raw: string;
  normalized: string;
  salutationStripped: string;
  entities: {
    timeWindow?: TimeWindow;
    dateRef?: "today" | "tomorrow" | string;
    taskTitle?: string;
    taskId?: number;
    taskIds?: number[];
  };
  isUnderspecified: boolean;
}

/**
 * Strips conversational salutations and fixes common mobile typos.
 */
export function normalizePrompt(raw: string): string {
  if (!raw) return "";
  let text = raw.trim();

  // Strip leading conversational greetings / fillers
  const salutationRegex =
    /^(?:(?:broh?|hey|yo|hi|cadence|please|pls|could you|can you|dude|man)\b[,:\s]*)+/i;
  text = text.replace(salutationRegex, "").trim();

  // Normalize common mobile typing errors
  const typoReplacements: Array<[RegExp, string]> = [
    [/\b(shedule|schdule|shedul|scheduel|sechdule)\b/gi, "schedule"],
    [/\b(tommorow|tomorow|tomm|tmrw|tmr)\b/gi, "tomorrow"],
    [/\b(2day|tday)\b/gi, "today"],
    [/\b(pls|plz)\b/gi, "please"],
  ];

  for (const [regex, replacement] of typoReplacements) {
    text = text.replace(regex, replacement);
  }

  return text.toLowerCase().trim();
}

/**
 * Extracts a time window like "9 to 5", "9am to 5pm", "10:00 to 14:00".
 */
export function parseTimeWindow(text: string): TimeWindow | null {
  const windowRegex =
    /(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
  const match = text.match(windowRegex);
  if (!match) return null;

  let startH = parseInt(match[1], 10);
  const startM = match[2] ? parseInt(match[2], 10) : 0;
  const startMeridiem = match[3]?.toLowerCase();

  let endH = parseInt(match[4], 10);
  const endM = match[5] ? parseInt(match[5], 10) : 0;
  const endMeridiem = match[6]?.toLowerCase();

  // Resolve 12h vs 24h formats
  if (startMeridiem === "pm" && startH < 12) startH += 12;
  if (startMeridiem === "am" && startH === 12) startH = 0;
  if (endMeridiem === "pm" && endH < 12) endH += 12;
  if (endMeridiem === "am" && endH === 12) endH = 0;

  // If neither specified AM/PM:
  // e.g. "9 to 5", "8 to 4" (typical workday hours: 9am to 5pm)
  if (!startMeridiem && !endMeridiem) {
    if (startH >= 8 && startH <= 12 && endH >= 1 && endH <= 7) {
      endH += 12; // 5 becomes 17 (5pm)
    }
  }

  const durationHours = endH + endM / 60 - (startH + startM / 60);
  if (durationHours <= 0) return null;

  const formatClock = (h: number, m: number) => {
    const period = h >= 12 ? "PM" : "AM";
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${displayH}:${m.toString().padStart(2, "0")} ${period}`;
  };

  return {
    startHour: startH,
    startMinute: startM,
    endHour: endH,
    endMinute: endM,
    durationHours: Math.round(durationHours * 10) / 10,
    formatted: `${formatClock(startH, startM)} to ${formatClock(endH, endM)}`,
  };
}

/**
 * Classifies the user's intent with entity extraction and underspecification detection.
 */
export function classifyAgentIntent(rawMessage: string): ClassifiedIntent {
  const normalized = normalizePrompt(rawMessage);
  const salutationStripped = rawMessage.replace(
    /^(?:(?:broh?|hey|yo|hi|cadence|please|pls|could you|can you|dude|man)\b[,:\s]*)+/i,
    "",
  ).trim();

  const timeWindow = parseTimeWindow(salutationStripped);
  let dateRef: "today" | "tomorrow" | string | undefined = undefined;

  if (normalized.includes("tomorrow")) {
    dateRef = "tomorrow";
  } else if (normalized.includes("today")) {
    dateRef = "today";
  }

  // 1. Undo
  if (
    normalized === "undo" ||
    normalized.startsWith("undo ") ||
    normalized.includes("undo last")
  ) {
    return {
      type: "undo",
      raw: rawMessage,
      normalized,
      salutationStripped,
      entities: {},
      isUnderspecified: false,
    };
  }

  // 2. Reschedule
  if (normalized.includes("reschedule")) {
    const idMatches = [...salutationStripped.matchAll(/\d+/g)].map((m) =>
      parseInt(m[0], 10),
    );
    return {
      type: "bulk_reschedule",
      raw: rawMessage,
      normalized,
      salutationStripped,
      entities: {
        taskIds: idMatches,
        dateRef,
      },
      isUnderspecified: idMatches.length === 0,
    };
  }

  // 3. Complete Task
  if (
    normalized.startsWith("complete task") ||
    normalized.startsWith("done task") ||
    normalized.startsWith("finish task")
  ) {
    const idMatch = salutationStripped.match(/\d+/);
    const taskId = idMatch ? parseInt(idMatch[0], 10) : undefined;
    return {
      type: "complete_task",
      raw: rawMessage,
      normalized,
      salutationStripped,
      entities: { taskId },
      isUnderspecified: !taskId,
    };
  }

  // 4. Create / Plan Schedule
  if (
    normalized.startsWith("create schedule") ||
    normalized.startsWith("plan schedule") ||
    normalized.startsWith("make schedule") ||
    normalized.startsWith("set up schedule") ||
    normalized.startsWith("plan my day") ||
    normalized.startsWith("schedule my day") ||
    (normalized.includes("schedule") && (timeWindow !== null || Boolean(dateRef)))
  ) {
    // Check if a specific task or topic was specified (e.g. "for project review")
    const forMatch = salutationStripped.match(/for\s+(.+)$/i);
    const taskTitle = forMatch ? forMatch[1].trim() : undefined;
    const isUnderspecified = !taskTitle;

    return {
      type: "create_schedule",
      raw: rawMessage,
      normalized,
      salutationStripped,
      entities: {
        timeWindow: timeWindow ?? undefined,
        dateRef,
        taskTitle,
      },
      isUnderspecified,
    };
  }

  // 5. Create Task
  if (
    normalized.startsWith("add task") ||
    normalized.startsWith("create task") ||
    normalized.startsWith("new task")
  ) {
    const title = salutationStripped
      .replace(/^(add|create|new)\s+task\s*/i, "")
      .trim();

    return {
      type: "create_task",
      raw: rawMessage,
      normalized,
      salutationStripped,
      entities: {
        taskTitle: title || undefined,
        dateRef,
      },
      isUnderspecified: !title,
    };
  }

  // 6. Query Schedule
  if (
    normalized.includes("schedule") ||
    normalized.includes("what's due") ||
    normalized.includes("what is due") ||
    normalized.includes("today") ||
    normalized.includes("agenda")
  ) {
    return {
      type: "query_schedule",
      raw: rawMessage,
      normalized,
      salutationStripped,
      entities: { dateRef },
      isUnderspecified: false,
    };
  }

  return {
    type: "unknown",
    raw: rawMessage,
    normalized,
    salutationStripped,
    entities: {},
    isUnderspecified: true,
  };
}

/**
 * Synthesizes a structured What, Why, How clarification dialogue for underspecified
 * scheduling requests.
 */
export function generateScheduleClarification(
  intent: ClassifiedIntent,
  openTasks: Array<{ id: number; title: string }> = [],
): string {
  const dateStr = intent.entities.dateRef ?? "tomorrow";
  const windowStr = intent.entities.timeWindow
    ? intent.entities.timeWindow.formatted
    : "9:00 AM to 5:00 PM";
  const durationStr = intent.entities.timeWindow
    ? `${intent.entities.timeWindow.durationHours} hours`
    : "8 hours";

  const topTaskNames = openTasks.slice(0, 3).map((t) => `"${t.title}"`);
  const backlogClause =
    topTaskNames.length > 0
      ? `your top backlog tasks (${topTaskNames.join(", ")})`
      : "your top backlog tasks";

  return `I detected your request to schedule for **${dateStr} from ${windowStr}** (${durationStr}). 

Because calendar time blocks attach to specific tasks in Cadence, here is what we need to clarify:

• **WHAT (Tasks & Work Scope):**
  Which work should fill this block? I can allocate ${backlogClause}, or create a dedicated focus session.

• **WHY (Priority & Focus Mode):**
  What is the primary theme for this block? (e.g., Deep Work sprint, client deliverables, or backlog catch-up?)

• **HOW (Rhythm & Breaks):**
  How should the ${durationStr} be paced? (e.g., 90-minute focus sprints with 15-minute breaks, two 3.5h blocks with lunch at 1:00 PM, or a continuous work block?)

**Quick Options (reply with a number):**
1. **Option 1:** Schedule top backlog tasks with a 1-hour lunch break at 1:00 PM.
2. **Option 2:** Create a dedicated "${windowStr} Deep Work Focus Block".
3. **Option 3:** Break into 90-minute focused sprints with 15-minute breathers.`;
}
