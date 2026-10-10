import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, KeyRound, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  SettingsRow,
  type SettingsRowState,
} from '@/components/settings/SettingsPrimitives';
import {
  useListAgentCredentials,
  useSaveAgentCredential,
  useDeleteAgentCredential,
  type LlmProvider,
} from '@workspace/api-client-react';

/**
 * In-app BYOK for the agent's LLM provider.
 *
 * ## The key is write-only
 *
 * The input is never seeded from the server and is cleared on success — the same
 * discipline `MessagingIntegrationsView` uses for the Telegram token. `GET
 * /agent/credentials` returns a masked `keyHint` and never the key or its
 * ciphertext, so there is nothing to rehydrate even if this component wanted to.
 *
 * ## Why this exists
 *
 * The agent's provider resolution reads deployment env vars. With none set, it
 * runs its local deterministic resolution and answers, which looked healthy
 * while providing no model reasoning. Surfacing "no provider configured" in the
 * UI — and letting a key be pasted here — is what makes that state visible
 * instead of silent.
 *
 * Saving is verified server-side before the key is persisted: `PUT
 * /agent/credentials/{provider}` probes the provider with the supplied key and
 * rejects a 400 rather than storing something that cannot work.
 */

interface ProviderSpec {
  id: LlmProvider;
  label: string;
  hint: string;
  docsUrl?: string;
}

const PROVIDERS: ProviderSpec[] = [
  { id: 'gemini', label: 'Google Gemini', hint: 'Free tier available. Strong at multi-turn tool use.' },
  { id: 'nvidia_nim', label: 'NVIDIA NIM', hint: 'Free hosted Llama models.' },
  { id: 'groq', label: 'Groq', hint: 'Very low latency inference.' },
  { id: 'openrouter', label: 'OpenRouter', hint: 'Many models behind one key.' },
  { id: 'custom', label: 'Custom endpoint', hint: 'Any OpenAI-compatible /chat/completions URL.' },
];

interface DraftState {
  apiKey: string;
  baseUrl: string;
  model: string;
  state: SettingsRowState;
  error: string | null;
  savedLabel: string | undefined;
}

const EMPTY_DRAFT: DraftState = {
  apiKey: '',
  baseUrl: '',
  model: '',
  state: 'idle',
  error: null,
  savedLabel: undefined,
};

function errorMessage(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error ?? e?.message ?? 'Something went wrong.';
}

export function AgentSettingsView() {
  const credentials = useListAgentCredentials();
  const saveCredential = useSaveAgentCredential();
  const deleteCredential = useDeleteAgentCredential();

  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  /**
   * At most one provider's form is expanded.
   *
   * Rendering every key + baseUrl + model field for all five providers put 15
   * text inputs on the settings page, which broke the SC 2.1.1 / 2.4.3 tab-order
   * sweep and added noise for a flow used once. Only the provider being
   * configured shows its fields.
   */
  const [expanded, setExpanded] = useState<string | null>(null);

  const configured = useMemo(() => {
    const map = new Map<string, { keyHint: string; model: string | null }>();
    for (const c of credentials.data?.credentials ?? []) {
      map.set(c.provider, { keyHint: c.keyHint, model: c.model ?? null });
    }
    return map;
  }, [credentials.data]);

  // Any provider configured (env or stored) means the agent can reason. The
  // endpoint only reports stored keys, so treat "any stored" as sufficient to
  // drop the banner; the agent still falls back to env vars silently otherwise.
  const noneConfigured = configured.size === 0;

  useEffect(() => {
    if (noneConfigured && !credentials.isPending) {
      // No side effect needed; kept for clarity if more state arrives later.
    }
  }, [noneConfigured, credentials.isPending]);

  const draftFor = (provider: string): DraftState => drafts[provider] ?? EMPTY_DRAFT;

  const setDraft = (provider: string, patch: Partial<DraftState>) => {
    setDrafts((prev) => ({
      ...prev,
      [provider]: { ...(prev[provider] ?? EMPTY_DRAFT), ...patch },
    }));
  };

  const onSave = async (provider: LlmProvider) => {
    const draft = draftFor(provider);
    if (draft.apiKey.trim().length < 8) {
      setDraft(provider, {
        state: 'error',
        error: 'Enter an API key of at least 8 characters.',
      });
      return;
    }

    setDraft(provider, { state: 'saving', error: null });

    try {
      await saveCredential.mutateAsync({
        provider,
        data: {
          apiKey: draft.apiKey.trim(),
          baseUrl: provider === 'custom' && draft.baseUrl.trim() ? draft.baseUrl.trim() : undefined,
          model: draft.model.trim() ? draft.model.trim() : undefined,
        },
      });
      // Write-only: drop the key from component state the moment it is stored.
      setDraft(provider, { ...EMPTY_DRAFT });
      toast.success('Provider saved. The key is stored encrypted and never shown again.');
      await credentials.refetch();
    } catch (err) {
      setDraft(provider, { state: 'error', error: errorMessage(err) });
    }
  };

  const onDelete = async (provider: LlmProvider) => {
    setDraft(provider, { state: 'saving', error: null });
    try {
      await deleteCredential.mutateAsync({ provider });
      toast.success('Provider removed.');
      await credentials.refetch();
    } catch (err) {
      setDraft(provider, { state: 'error', error: errorMessage(err) });
    }
  };

  return (
    <section
      className="space-y-4"
      data-testid="agent-settings-view"
      aria-labelledby="agent-settings-heading"
    >
      <div className="mb-3 flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ai/15 text-ai-text">
          <KeyRound size={18} aria-hidden="true" />
        </span>
        <div>
          <h2 id="agent-settings-heading" className="text-headline text-foreground">
            Agent Provider Key
          </h2>
          <p className="text-caption text-muted-foreground">
            Bring your own key. Stored encrypted on the server, never shown again.
          </p>
        </div>
      </div>

      {noneConfigured && !credentials.isPending ? (
        <p
          role="status"
          className="rounded-xl border border-status-warning-fill/40 bg-status-warning-fill/10 p-3 text-caption text-status-warning-text"
        >
          No provider key stored. The assistant still answers using its built-in
          offline logic, but it cannot reason over your schedule or run multi-step
          actions until you add a key.
        </p>
      ) : null}

      {credentials.isPending ? (
        <p className="text-caption text-muted-foreground">Loading provider status…</p>
      ) : null}

      <div className="space-y-3">
        {PROVIDERS.map((spec) => {
const stored = configured.get(spec.id);
          const draft = draftFor(spec.id);
          const isCustom = spec.id === 'custom';
          const isRevealed = reveal[spec.id] === true;
          const isOpen = expanded === spec.id;
          const busy = draft.state === 'saving';

          return (
            <SettingsRow
              key={spec.id}
              testId={`agent-provider-row-${spec.id}`}
              label={spec.label}
              description={
                <span className="block text-caption text-muted-foreground">
                  {spec.hint}
                  {stored ? (
                    <span className="mt-1 block font-mono text-caption text-foreground">
                      Saved key {stored.keyHint}
                      {stored.model ? ` · ${stored.model}` : ''}
                    </span>
                  ) : null}
                </span>
              }
              state={isOpen ? draft.state : 'idle'}
              error={isOpen ? draft.error : null}
              savedLabel={draft.savedLabel ?? 'Saved'}
              onRetry={isOpen && draft.error ? () => void onSave(spec.id) : undefined}
            >
              <div className="w-full space-y-2">
                {!isOpen ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setExpanded(spec.id);
                        setReveal((prev) => ({ ...prev, [spec.id]: false }));
                      }}
                      aria-expanded={false}
                      aria-controls={`agent-provider-form-${spec.id}`}
                      data-testid={`agent-provider-open-${spec.id}`}
                      className="h-11 rounded-xl border border-border-control px-4 text-micro font-semibold text-foreground transition-colors hover:bg-accent/10"
                    >
                      {stored ? 'Replace key' : 'Add key'}
                    </button>
                    {stored ? (
                      <button
                        type="button"
                        onClick={() => void onDelete(spec.id)}
                        aria-label={`Remove ${spec.label} key`}
                        data-testid={`agent-provider-remove-${spec.id}`}
                        className="grid size-11 place-items-center rounded-xl border border-border-control text-status-danger-text transition-colors hover:bg-destructive/10"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-2" id={`agent-provider-form-${spec.id}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative agent-panel-min-w flex-1">
                        <input
                          type={isRevealed ? 'text' : 'password'}
                          value={draft.apiKey}
                          onChange={(e) =>
                            setDraft(spec.id, { apiKey: e.target.value, state: 'dirty' })
                          }
                          placeholder="Paste API key"
                          autoComplete="off"
                          spellCheck={false}
                          aria-label={`${spec.label} API key`}
                          className="h-11 w-full rounded-xl border border-border-control bg-card/[0.04] pl-3.5 pr-11 font-mono text-micro text-foreground transition-all focus:border-accent"
                        />
                        <button
                          type="button"
                          onClick={() => setReveal((prev) => ({ ...prev, [spec.id]: !isRevealed }))}
                          aria-label={isRevealed ? `Hide ${spec.label} key` : `Show ${spec.label} key`}
                          className="absolute right-1 top-1/2 -translate-y-1/2 grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {isRevealed ? (
                            <EyeOff size={16} aria-hidden="true" />
                          ) : (
                            <Eye size={16} aria-hidden="true" />
                          )}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => void onSave(spec.id)}
                        disabled={busy}
                        className="h-11 rounded-xl bg-primary px-4 text-micro font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
                      >
                        {busy ? 'Saving…' : 'Save'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setExpanded(null)}
                        aria-label={`Cancel adding ${spec.label} key`}
                        className="h-11 rounded-xl border border-border-control px-4 text-micro font-semibold text-foreground transition-colors hover:bg-accent/10"
                      >
                        Cancel
                      </button>
                    </div>

                    {isCustom ? (
                      <input
                        type="url"
                        value={draft.baseUrl}
                        onChange={(e) =>
                          setDraft(spec.id, { baseUrl: e.target.value, state: 'dirty' })
                        }
                        placeholder="https://your-gateway.example.com/v1"
                        aria-label="Custom OpenAI-compatible base URL"
                        className="h-11 w-full rounded-xl border border-border-control bg-card/[0.04] px-3.5 font-mono text-micro text-foreground transition-all focus:border-accent"
                      />
                    ) : null}

                    <input
                      type="text"
                      value={draft.model}
                      onChange={(e) =>
                        setDraft(spec.id, { model: e.target.value, state: 'dirty' })
                      }
                      placeholder="Model override (optional)"
                      aria-label={`${spec.label} model override`}
                      className="h-11 w-full rounded-xl border border-border-control bg-card/[0.04] px-3.5 font-mono text-micro text-foreground transition-all focus:border-accent"
                    />
                  </div>
                )}
              </div>
            </SettingsRow>
          );
        })}
      </div>
    </section>
  );
}

export default AgentSettingsView;
