import { and, desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  agentActionLogTable,
  agentConversationsTable,
  db,
  llmCredentialsTable,
  llmUsageTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { runAgentConversation, MONTHLY_SPEND_CEILING_CENTS } from "../lib/agent/engine";
import { undoLastAgentAction } from "../lib/agent/undo";
import {
  CredentialCryptoError,
  encryptCredential,
  keyHint as buildKeyHint,
} from "../lib/agent/credential-crypto";
import { chatCompletionsUrl, PROVIDER_PRESETS } from "../lib/agent/providers";
import { runWithRls } from "../lib/rls";

const router: IRouter = Router();

const ChatInputSchema = z.object({
  message: z.string().min(1),
  channel: z.enum(["app", "telegram"]).default("app"),
});

/**
 * Chat with the Cadence Agent (ReAct reasoning loop + memory context).
 */
router.post("/agent/chat", requireAuth, async (req, res): Promise<void> => {
  const parsed = ChatInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const output = await runAgentConversation({
    userId: req.userId!,
    message: parsed.data.message,
    channel: parsed.data.channel,
  });

  res.json(output);
});

/**
 * Retrieve recent chat conversation history.
 */
router.get("/agent/messages", requireAuth, async (req, res): Promise<void> => {
  const messages = await runWithRls(req, async (tx) => {
    return await tx
      .select()
      .from(agentConversationsTable)
      .where(eq(agentConversationsTable.userId, req.userId!))
      .orderBy(desc(agentConversationsTable.id))
      .limit(50);
  });

  res.json({ messages: messages.reverse() });
});

/**
 * Clear chat conversation history.
 */
router.delete("/agent/messages", requireAuth, async (req, res): Promise<void> => {
  await runWithRls(req, async (tx) => {
    await tx
      .delete(agentConversationsTable)
      .where(eq(agentConversationsTable.userId, req.userId!));
  });

  res.json({ success: true });
});

/**
 * Undo the most recent agent action (Doc 09 Gap #2).
 */
router.post("/agent/undo", requireAuth, async (req, res): Promise<void> => {
  const result = await undoLastAgentAction(req.userId!);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result);
});

/**
 * List recent agent actions for audit and transparency.
 */
router.get("/agent/actions", requireAuth, async (req, res): Promise<void> => {
  const actions = await runWithRls(req, async (tx) => {
    return await tx
      .select()
      .from(agentActionLogTable)
      .where(eq(agentActionLogTable.userId, req.userId!))
      .orderBy(desc(agentActionLogTable.id))
      .limit(30);
  });

  res.json({ actions });
});

/**
 * Get current month token usage and spend estimation (Doc 08 Problem 5a).
 *
 * Deliberately owner-context, NOT runWithRls: `llm_usage` intentionally has no
 * `authenticated` RLS policy (migration 0009; 0010 grants it to `service_role`
 * only, because it holds cross-cutting telemetry). Running this under
 * `authenticated` would fail closed and always report zeros. Isolation is
 * carried by the explicit `user_id` filter below, so keep it.
 */
router.get("/agent/usage", requireAuth, async (req, res): Promise<void> => {
  const [usage] = await db
    .select({
      totalTokensIn: sql<number>`COALESCE(SUM(${llmUsageTable.tokensIn}), 0)::int`,
      totalTokensOut: sql<number>`COALESCE(SUM(${llmUsageTable.tokensOut}), 0)::int`,
      totalCostEstimateCents: sql<number>`COALESCE(SUM(${llmUsageTable.costEstimateCents}), 0)::real`,
      totalCalls: sql<number>`COUNT(*)::int`,
    })
    .from(llmUsageTable)
    .where(eq(llmUsageTable.userId, req.userId!));

  res.json({
    usage: {
      totalTokensIn: usage?.totalTokensIn ?? 0,
      totalTokensOut: usage?.totalTokensOut ?? 0,
      totalCostEstimateCents: usage?.totalCostEstimateCents ?? 0,
      totalCalls: usage?.totalCalls ?? 0,
      spendCeilingCents: MONTHLY_SPEND_CEILING_CENTS,
    },
  });
});

// ---------------------------------------------------------------------------
// In-app BYOK: LLM provider credentials (migration 0016)
// ---------------------------------------------------------------------------

const CredentialProviderSchema = z.enum([
  "gemini",
  "nvidia_nim",
  "groq",
  "openrouter",
  "custom",
]);

const CredentialProviderParams = z.object({ provider: CredentialProviderSchema });

const CredentialInputSchema = z.object({
  // Write-only. Never echoed back, never returned by GET.
  apiKey: z.string().min(8, "API key must be at least 8 characters"),
  baseUrl: z.string().url().optional(),
  model: z.string().min(1).optional(),
});

function presetFor(provider: string) {
  return PROVIDER_PRESETS.find((p) => p.id === provider);
}

/**
 * GET /agent/credentials
 *
 * Returns configuration state only — never the key and never the ciphertext.
 * `keyHint` is the last few characters so a user can tell two providers apart
 * without the secret leaving the server.
 */
router.get("/agent/credentials", requireAuth, async (req, res): Promise<void> => {
  const rows = await runWithRls(req, async (tx) => {
    return await tx
      .select({
        provider: llmCredentialsTable.provider,
        keyHint: llmCredentialsTable.keyHint,
        baseUrl: llmCredentialsTable.baseUrl,
        model: llmCredentialsTable.model,
        updatedAt: llmCredentialsTable.updatedAt,
      })
      .from(llmCredentialsTable)
      .where(eq(llmCredentialsTable.userId, req.userId!));
  });

  res.json({
    credentials: rows.map((r) => ({
      provider: r.provider,
      configured: true,
      keyHint: `••••${r.keyHint}`,
      model: r.model ?? presetFor(r.provider)?.defaultModel ?? null,
      baseUrl: r.baseUrl ?? presetFor(r.provider)?.baseUrl ?? null,
      updatedAt: r.updatedAt ?? null,
    })),
  });
});

/**
 * PUT /agent/credentials/{provider}
 *
 * Probes the provider with the supplied key BEFORE persisting it. A key that
 * cannot call the API is rejected with 400 and never stored — otherwise the
 * user saves a broken key and the agent silently fails later, which is the exact
 * failure mode this whole change set exists to eliminate.
 */
router.put("/agent/credentials/:provider", requireAuth, async (req, res): Promise<void> => {
  const params = CredentialProviderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Unknown provider" });
    return;
  }
  const { provider } = params.data;

  const parsed = CredentialInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { apiKey, baseUrl, model } = parsed.data;

  const preset = presetFor(provider);

  // A custom endpoint must supply its own base URL; a known provider must not
  // be able to redirect its traffic somewhere else.
  let resolvedBaseUrl: string;
  if (provider === "custom") {
    if (!baseUrl) {
      res.status(400).json({ error: "baseUrl is required for the custom provider" });
      return;
    }
    resolvedBaseUrl = baseUrl;
  } else {
    if (!preset) {
      res.status(400).json({ error: `Unknown provider: ${provider}` });
      return;
    }
    if (baseUrl) {
      res.status(400).json({ error: `baseUrl is not allowed for ${provider}` });
      return;
    }
    resolvedBaseUrl = preset.baseUrl;
  }

  const resolvedModel = model ?? preset?.defaultModel ?? "gpt-4o-mini";

  // --- probe ---------------------------------------------------------------
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const probe = await fetch(chatCompletionsUrl(resolvedBaseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });

    if (!probe.ok) {
      res.status(400).json({
        error:
          probe.status === 401 || probe.status === 403
            ? "That provider rejected the key."
            : `Provider probe failed with status ${probe.status}.`,
      });
      return;
    }
  } catch {
    res.status(400).json({
      error: "Could not reach that provider. Check the key and network, then try again.",
    });
    return;
  } finally {
    clearTimeout(timeoutId);
  }

  // --- persist -------------------------------------------------------------
  let ciphertext: string;
  try {
    ciphertext = encryptCredential(apiKey);
  } catch (err) {
    if (err instanceof CredentialCryptoError) {
      // Misconfiguration, not a client error: the key was valid but we have no
      // way to store it safely.
      res.status(503).json({
        error:
          "Credential storage is unavailable. Set CREDENTIAL_ENCRYPTION_KEY on the server before saving a key.",
      });
      return;
    }
    throw err;
  }

  const hint = buildKeyHint(apiKey);

  await runWithRls(req, async (tx) => {
    const [existing] = await tx
      .select({ id: llmCredentialsTable.id })
      .from(llmCredentialsTable)
      .where(
        and(
          eq(llmCredentialsTable.userId, req.userId!),
          eq(llmCredentialsTable.provider, provider),
        ),
      );

    if (existing) {
      await tx
        .update(llmCredentialsTable)
        .set({
          ciphertext,
          keyHint: hint,
          baseUrl: provider === "custom" ? resolvedBaseUrl : null,
          model: model ?? null,
          updatedAt: new Date(),
        })
        .where(eq(llmCredentialsTable.id, existing.id));
    } else {
      await tx.insert(llmCredentialsTable).values({
        userId: req.userId!,
        provider,
        ciphertext,
        keyHint: hint,
        baseUrl: provider === "custom" ? resolvedBaseUrl : null,
        model: model ?? null,
      });
    }
  });

  res.json({
    provider,
    configured: true,
    keyHint: `••••${hint}`,
    model: resolvedModel,
    baseUrl: resolvedBaseUrl,
    updatedAt: new Date().toISOString(),
  });
});

/** DELETE /agent/credentials/{provider} */
router.delete("/agent/credentials/:provider", requireAuth, async (req, res): Promise<void> => {
  const params = CredentialProviderParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "No such credential" });
    return;
  }

  const deleted = await runWithRls(req, async (tx) => {
    const rows = await tx
      .delete(llmCredentialsTable)
      .where(
        and(
          eq(llmCredentialsTable.userId, req.userId!),
          eq(llmCredentialsTable.provider, params.data.provider),
        ),
      )
      .returning({ id: llmCredentialsTable.id });
    return rows.length > 0;
  });

  if (!deleted) {
    res.status(404).json({ error: "No such credential" });
    return;
  }

  res.status(204).end();
});

export default router;
