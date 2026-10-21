import { and, desc, eq, gte, sql } from "drizzle-orm";
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
import { DEFAULT_TIME_ZONE, currentMonthStartUtc } from "../lib/month-window";
import { undoLastAgentAction } from "../lib/agent/undo";
import {
  CredentialCryptoError,
  decryptCredential,
  encryptCredential,
  keyHint as buildKeyHint,
} from "../lib/agent/credential-crypto";
import {
  PROVIDER_PRESETS,
  type ProviderId,
} from "../lib/agent/providers";
import { discoverProviderModels } from "../lib/agent/discovery";
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

  // The reply carries its provenance: `provider` names the model that produced
  // it (`local-fallback` for the deterministic local engine) and `degraded` says
  // whether no model was available. The panel renders its badge from
  // `degraded`, so the flag is always present on the wire.
  res.json({
    ...output,
    degraded: output.degraded === true,
  });
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
 *
 * The month predicate is what makes the number "month-to-date", which is what
 * the endpoint documents and what the monthly D-08/D-27 ceiling ($5.00/month)
 * is measured against. Without it this was ALL-TIME spend wearing a monthly
 * label.
 *
 * The window is the start of the current calendar month in a PINNED zone,
 * computed here and bound as a parameter. A database-side
 * `date_trunc('month', now())` would truncate in the CONNECTION's `TimeZone`
 * setting, so the boundary would move with the pool rather than with the
 * user. The route has no user-zone lookup yet (a later change gives the
 * server ownership of the user's zone); until then the D-01 home zone is
 * used, and swapping in the user's own zone is a one-line change here.
 */
router.get("/agent/usage", requireAuth, async (req, res): Promise<void> => {
  const monthStart = currentMonthStartUtc(DEFAULT_TIME_ZONE);

  const [usage] = await db
    .select({
      totalTokensIn: sql<number>`COALESCE(SUM(${llmUsageTable.tokensIn}), 0)::int`,
      totalTokensOut: sql<number>`COALESCE(SUM(${llmUsageTable.tokensOut}), 0)::int`,
      totalCostEstimateCents: sql<number>`COALESCE(SUM(${llmUsageTable.costEstimateCents}), 0)::real`,
      totalCalls: sql<number>`COUNT(*)::int`,
    })
    .from(llmUsageTable)
    .where(
      and(
        eq(llmUsageTable.userId, req.userId!),
        gte(llmUsageTable.createdAt, monthStart),
      ),
    );

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
  // Write-only. Optional when updating model or settings on an already-configured provider.
  apiKey: z.string().min(8, "API key must be at least 8 characters").optional(),
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
 * Probes the provider with the key BEFORE persisting it. A key or model that
 * cannot call the API is rejected with 400 and never stored.
 * If apiKey is omitted and the provider is already configured, updates the model
 * (and baseUrl if custom) using the existing stored key.
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

  // Check existing stored credential
  const [existing] = await runWithRls(req, async (tx) => {
    return await tx
      .select({
        id: llmCredentialsTable.id,
        ciphertext: llmCredentialsTable.ciphertext,
        keyHint: llmCredentialsTable.keyHint,
        baseUrl: llmCredentialsTable.baseUrl,
        model: llmCredentialsTable.model,
      })
      .from(llmCredentialsTable)
      .where(
        and(
          eq(llmCredentialsTable.userId, req.userId!),
          eq(llmCredentialsTable.provider, provider),
        ),
      );
  });

  if (!apiKey && !existing) {
    res.status(400).json({ error: "API key is required for initial configuration." });
    return;
  }

  // A custom endpoint must supply its own base URL; a known provider must not
  // be able to redirect its traffic somewhere else.
  let resolvedBaseUrl: string;
  if (provider === "custom") {
    const candidateBase = baseUrl ?? existing?.baseUrl;
    if (!candidateBase) {
      res.status(400).json({ error: "baseUrl is required for the custom provider" });
      return;
    }
    resolvedBaseUrl = candidateBase;
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

  let effectiveApiKey: string;
  if (apiKey) {
    effectiveApiKey = apiKey;
  } else {
    try {
      effectiveApiKey = decryptCredential(existing!.ciphertext);
    } catch {
      res.status(400).json({
        error: "Stored key could not be decrypted. Please enter your API key again.",
      });
      return;
    }
  }

  // Run dynamic discovery: validates key (0 inference tokens) & retrieves live models
  const discovery = await discoverProviderModels(
    provider as ProviderId,
    effectiveApiKey,
    resolvedBaseUrl,
  );

  if (!discovery.success) {
    req.log?.warn?.(
      { provider, error: discovery.error },
      "Provider key validation and model discovery failed",
    );
    res.status(400).json({
      error:
        discovery.error ||
        "That provider rejected the key. Please verify your API key and try again.",
    });
    return;
  }

  // Resolve target model:
  // 1. Explicit model provided by user (respect custom models/fine-tunes)
  // 2. Previously stored model on existing credential
  // 3. Recommended default model discovered from live provider response
  // 4. Preset default model fallback
  const finalModel =
    (model && model.trim()) ||
    existing?.model ||
    discovery.defaultModel ||
    preset?.defaultModel ||
    "gemini-2.0-flash";

  // --- persist -------------------------------------------------------------
  let ciphertext: string;
  let hint: string;

  if (apiKey) {
    try {
      ciphertext = encryptCredential(apiKey);
    } catch (err) {
      if (err instanceof CredentialCryptoError) {
        res.status(503).json({
          error:
            "Credential storage is unavailable. Set CREDENTIAL_ENCRYPTION_KEY on the server before saving a key.",
        });
        return;
      }
      throw err;
    }
    hint = buildKeyHint(apiKey);
  } else {
    ciphertext = existing!.ciphertext;
    hint = existing!.keyHint;
  }

  await runWithRls(req, async (tx) => {
    if (existing) {
      await tx
        .update(llmCredentialsTable)
        .set({
          ciphertext,
          keyHint: hint,
          baseUrl: provider === "custom" ? resolvedBaseUrl : null,
          model: finalModel,
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
        model: finalModel,
      });
    }
  });

  res.json({
    provider,
    configured: true,
    keyHint: `••••${hint}`,
    model: finalModel,
    baseUrl: resolvedBaseUrl,
    availableModels: discovery.models,
    updatedAt: new Date().toISOString(),
  });
});

/**
 * GET /agent/models/:provider
 *
 * Discovers available models for a provider using the user's stored key (or env fallback).
 */
router.get("/agent/models/:provider", requireAuth, async (req, res): Promise<void> => {
  const params = CredentialProviderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Unknown provider" });
    return;
  }
  const { provider } = params.data;
  const preset = presetFor(provider);

  // Find stored credential
  const [existing] = await runWithRls(req, async (tx) => {
    return await tx
      .select({
        ciphertext: llmCredentialsTable.ciphertext,
        baseUrl: llmCredentialsTable.baseUrl,
        model: llmCredentialsTable.model,
      })
      .from(llmCredentialsTable)
      .where(
        and(
          eq(llmCredentialsTable.userId, req.userId!),
          eq(llmCredentialsTable.provider, provider),
        ),
      );
  });

  let effectiveApiKey = "";
  if (existing) {
    try {
      effectiveApiKey = decryptCredential(existing.ciphertext);
    } catch {
      // ignore
    }
  }

  const queryApiKey = typeof req.query.apiKey === "string" ? req.query.apiKey.trim() : "";
  if (queryApiKey) {
    effectiveApiKey = queryApiKey;
  }

  const baseUrl = (typeof req.query.baseUrl === "string" ? req.query.baseUrl.trim() : undefined) ?? existing?.baseUrl ?? preset?.baseUrl;

  const discovery = await discoverProviderModels(
    provider as ProviderId,
    effectiveApiKey,
    baseUrl,
  );

  res.json({
    provider,
    success: discovery.success,
    models: discovery.models,
    defaultModel: discovery.defaultModel,
    activeModel: existing?.model ?? preset?.defaultModel ?? discovery.defaultModel,
    error: discovery.error,
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
