import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { automationFlagsTable, db } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { runWithRls } from "../lib/rls";

/**
 * Automation kill switch — the `automation_paused` control locked in
 * spec/locked-decisions.md and required by docs/13-master-design-system-prompt.md
 * P17.1 ("Automation paused — reminders and auto-reschedule are off" + Resume).
 *
 * ---------------------------------------------------------------------------
 * SECURITY POSTURE — READ THIS BEFORE CHANGING ANYTHING HERE
 * ---------------------------------------------------------------------------
 * lib/db/src/schema/notifications.ts:63-76 states automation_flags is
 * "writable ONLY by the owner — there are deliberately no write policies.
 *  Toggle via the Supabase dashboard / SQL editor, never via the API."
 *
 * This router is a deliberate, reviewed narrowing of that stance, authorised by
 * the owner, because a kill switch the user cannot reach in-app is not a safety
 * control. To keep the blast radius as small as possible:
 *
 *   1. READ  goes through runWithRls, using the EXISTING `authenticated` SELECT
 *      policy. No RLS change.
 *   2. WRITE is hard-whitelisted to AUTOMATION_KEYS below. Any other key is
 *      rejected with 400. This is not a generic flag writer.
 *   3. WRITE is a single-row upsert on (key) — it cannot touch any other table.
 *   4. There is no delete, and no way to create a new key.
 *   5. requireAuth on both verbs.
 *
 * If this router ever needs to write a key outside AUTOMATION_KEYS, that is a
 * spec change requiring an explicit decision — do not widen the array casually.
 */

const router: IRouter = Router();

/** The only keys this endpoint may ever write. */
const AUTOMATION_KEYS = ["reminders", "reschedule"] as const;
type AutomationKey = (typeof AUTOMATION_KEYS)[number];

function isAutomationKey(value: unknown): value is AutomationKey {
  return typeof value === "string" && (AUTOMATION_KEYS as readonly string[]).includes(value);
}

/** GET /api/automation/flags — current state of every kill switch. */
router.get(
  "/automation/flags",
  requireAuth,
  async (req, res): Promise<void> => {
    const flags = await runWithRls(req, async (tx) =>
      tx
        .select({ key: automationFlagsTable.key, enabled: automationFlagsTable.enabled })
        .from(automationFlagsTable),
    );

    res.json({
      flags: flags.map((f) => ({ key: f.key, enabled: f.enabled })),
      // Single derived flag the UI branches on. Paused means EITHER kill switch
      // is off, so the banner appears the moment the user pauses anything.
      paused: flags.some((f) => !f.enabled),
    });
  },
);

/** PUT /api/automation/flags/:key — set one whitelisted kill switch. */
router.put(
  "/automation/flags/:key",
  requireAuth,
  async (req, res): Promise<void> => {
    const { key } = req.params;
    if (!isAutomationKey(key)) {
      res.status(400).json({
        error: "unknown_automation_key",
        message: `Key must be one of: ${AUTOMATION_KEYS.join(", ")}`,
      });
      return;
    }

    const { enabled } = req.body as { enabled?: unknown };
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "invalid_body", message: "enabled must be a boolean" });
      return;
    }

    // Owner-level write: automation_flags intentionally has no RLS write policy.
    // Scoped to one whitelisted key — see the security note at the top.
    const [row] = await db
      .insert(automationFlagsTable)
      .values({ key, enabled })
      .onConflictDoUpdate({ target: automationFlagsTable.key, set: { enabled } })
      .returning({ key: automationFlagsTable.key, enabled: automationFlagsTable.enabled });

    console.log(
      `[automation] user=${req.userId} set key=${key} enabled=${enabled} (kill switch)`,
    );

    res.json({ flag: row });
  },
);

export default router;
