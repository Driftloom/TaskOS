import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, KeyRound, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  SettingsRow,
  type SettingsRowState,
} from '@/components/settings/SettingsPrimitives';
import {
  useListAgentCredentials,
  useSaveAgentCredential,
  useDeleteAgentCredential,
  useListAgentModels,
  getListAgentModelsQueryKey,
  type LlmProvider,
} from '@workspace/api-client-react';
import {
  canonicalModelBadge,
  type DiscoveredModelResponse,
} from '@/lib/discovered-model';

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
 * ## Zero-Token Key Discovery & Dynamic Model Selection
 *
 * Models are discovered dynamically from the provider using zero-token metadata
 * endpoints (e.g. Google AI Studio ListModels, Groq /v1/models, OpenRouter /v1/models).
 * No hardcoded model lists are maintained on the frontend. Users can select any
 * discovered model or supply custom fine-tuned model identifiers.
 *
 * The discovered-model shape is the server's own `DiscoveredModel`
 * (artifacts/api-server/src/lib/agent/discovery.ts), declared once in
 * `@/lib/discovered-model` and imported here — the two surfaces used to
 * declare it separately and differently, which left every option blank in
 * production. It is a data contract, not a component, so this page does not
 * import the agent panel to obtain it.
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
  const e = err as {
    data?: { error?: string };
    response?: { data?: { error?: string } };
    message?: string;
  };
  return e?.data?.error ?? e?.response?.data?.error ?? e?.message ?? 'Something went wrong.';
}

export function AgentSettingsView() {
  const queryClient = useQueryClient();
  const credentials = useListAgentCredentials();
  const saveCredential = useSaveAgentCredential();
  const deleteCredential = useDeleteAgentCredential();

  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [discoveredModels, setDiscoveredModels] = useState<Record<string, DiscoveredModelResponse[]>>({});
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({});
  const [customModelInputs, setCustomModelInputs] = useState<Record<string, boolean>>({});
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

  const registerModels = useCallback(
    (provider: LlmProvider, models: DiscoveredModelResponse[]) => {
      setDiscoveredModels((prev) => {
        const existing = prev[provider];
        if (
          existing &&
          existing.length === models.length &&
          existing.every(
            (m, i) =>
              m.id === models[i].id &&
              m.label === models[i].label &&
              m.badge === models[i].badge &&
              m.description === models[i].description &&
              m.tier === models[i].tier,
          )
        ) {
          return prev;
        }
        return { ...prev, [provider]: models };
      });
    },
    [],
  );

  const setProviderLoading = useCallback((provider: LlmProvider, loading: boolean) => {
    setLoadingModels((prev) => (prev[provider] === loading ? prev : { ...prev, [provider]: loading }));
  }, []);

  const configuredProviders = useMemo<LlmProvider[]>(
    () =>
      [...configured.keys()].filter(
        (p): p is LlmProvider => p !== 'custom' && PROVIDERS.some((s) => s.id === p),
      ),
    [configured],
  );

  // One generated `useListAgentModels` hook per configured provider, mounted
  // through `ModelsForProvider` below so its discovery populates `discoveredModels`.
  const getModelsForProvider = (providerId: string): DiscoveredModelResponse[] => {
    return discoveredModels[providerId] ?? [];
  };

  const noneConfigured = configured.size === 0;

  const draftFor = (provider: string): DraftState => drafts[provider] ?? EMPTY_DRAFT;

  const setDraft = (provider: string, patch: Partial<DraftState>) => {
    setDrafts((prev) => ({
      ...prev,
      [provider]: { ...(prev[provider] ?? EMPTY_DRAFT), ...patch },
    }));
  };

  const onSelectModel = async (provider: LlmProvider, newModel: string) => {
    try {
      setDraft(provider, { state: 'saving', error: null });
      await saveCredential.mutateAsync({
        provider,
        data: { model: newModel },
      });
      toast.success(`Active model updated to ${newModel}`);
      await credentials.refetch();
      setDraft(provider, { state: 'idle', error: null });
    } catch (err) {
      toast.error('Failed to update model', { description: errorMessage(err) });
      setDraft(provider, { state: 'error', error: errorMessage(err) });
    }
  };

  const onSave = async (provider: LlmProvider) => {
    const draft = draftFor(provider);
    const stored = configured.get(provider);
    const keyTrimmed = draft.apiKey.trim();

    if (!stored && keyTrimmed.length < 8) {
      setDraft(provider, {
        state: 'error',
        error: 'Enter an API key of at least 8 characters.',
      });
      return;
    }

    if (stored && keyTrimmed.length > 0 && keyTrimmed.length < 8) {
      setDraft(provider, {
        state: 'error',
        error: 'New API key must be at least 8 characters.',
      });
      return;
    }

    setDraft(provider, { state: 'saving', error: null });

    try {
      await saveCredential.mutateAsync({
        provider,
        data: {
          apiKey: keyTrimmed.length >= 8 ? keyTrimmed : undefined,
          baseUrl: provider === 'custom' && draft.baseUrl.trim() ? draft.baseUrl.trim() : undefined,
          model: draft.model.trim() ? draft.model.trim() : undefined,
        },
      });
      // Write-only: drop the key from component state the moment it is stored.
      setDraft(provider, { ...EMPTY_DRAFT });
      setExpanded(null);
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
      {configuredProviders.map((provider) => (
        <ModelsForProvider
          key={provider}
          provider={provider}
          onModels={(models) => registerModels(provider, models)}
          setProviderLoading={(loading) => setProviderLoading(provider, loading)}
        />
      ))}
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
          const availableModels = getModelsForProvider(spec.id);
          const isLoadingLive = loadingModels[spec.id] === true;

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
                    {stored && availableModels.length > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <label
                          htmlFor={`model-select-${spec.id}`}
                          className="text-micro font-medium text-muted-foreground"
                        >
                          Model:
                        </label>
                        <select
                          id={`model-select-${spec.id}`}
                          value={stored.model ?? availableModels[0]?.id ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '__custom__') {
                              setExpanded(spec.id);
                              setCustomModelInputs((prev) => ({ ...prev, [spec.id]: true }));
                              setDraft(spec.id, { model: stored.model ?? '' });
                            } else {
                              void onSelectModel(spec.id, val);
                            }
                          }}
                          disabled={busy}
                          data-testid={`agent-provider-model-select-${spec.id}`}
                          aria-label={`${spec.label} model`}
                          className="h-11 rounded-xl border border-border-control bg-card/[0.04] px-3 font-mono text-micro text-foreground transition-all focus:border-accent"
                        >
                          {availableModels.map((m) => (
                            <option key={m.id} value={m.id} className="bg-card text-foreground">
                              {m.label} {m.badge ? `(${m.badge})` : ''}
                            </option>
                          ))}
                          {!availableModels.some((m) => m.id === stored.model) && stored.model ? (
                            <option value={stored.model} className="bg-card text-foreground">
                              {stored.model} (Active)
                            </option>
                          ) : null}
                          <option value="__custom__" className="bg-card text-foreground">
                            Custom model…
                          </option>
                        </select>
                        {isLoadingLive ? (
                          <span className="text-macro text-muted-foreground animate-pulse">Live…</span>
                        ) : null}
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => {
                        setExpanded(spec.id);
                        setReveal((prev) => ({ ...prev, [spec.id]: false }));
                        setDraft(spec.id, {
                          model: stored?.model ?? availableModels[0]?.id ?? '',
                          baseUrl: '',
                        });
                        setCustomModelInputs((prev) => ({ ...prev, [spec.id]: false }));
                      }}
                      aria-expanded={false}
                      aria-controls={`agent-provider-form-${spec.id}`}
                      data-testid={`agent-provider-open-${spec.id}`}
                      className="h-11 rounded-xl border border-border-control px-4 text-micro font-semibold text-foreground transition-colors hover:bg-accent/10"
                    >
                      {stored ? 'Configure / Replace key' : 'Add key'}
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
                          placeholder={
                            stored
                              ? 'Leave blank to keep stored key, or paste new'
                              : 'Paste API key'
                          }
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
                        aria-label={`Cancel editing ${spec.label}`}
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

                    {/* Model selection & discovery */}
                    <div className="space-y-2 rounded-xl border border-border-control/40 bg-card/[0.02] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor={`form-model-select-${spec.id}`}
                          className="text-micro font-medium text-muted-foreground"
                        >
                          Model Selection
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            void queryClient.invalidateQueries({
                              queryKey: getListAgentModelsQueryKey(spec.id),
                            });
                          }}
                          disabled={isLoadingLive}
                          className="inline-flex items-center gap-1.5 text-micro font-medium text-accent hover:underline disabled:opacity-50"
                        >
                          <RefreshCw
                            size={12}
                            className={isLoadingLive ? 'animate-spin' : ''}
                            aria-hidden="true"
                          />
                          {isLoadingLive ? 'Scanning…' : 'Scan Models'}
                        </button>
                      </div>

                      {availableModels.length > 0 ? (
                        <div className="space-y-2">
                          <select
                            id={`form-model-select-${spec.id}`}
                            value={
                              customModelInputs[spec.id]
                                ? '__custom__'
                                : availableModels.some((m) => m.id === draft.model)
                                  ? draft.model
                                  : draft.model
                                    ? '__custom__'
                                    : (availableModels[0]?.id ?? '')
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '__custom__') {
                                setCustomModelInputs((prev) => ({ ...prev, [spec.id]: true }));
                              } else {
                                setCustomModelInputs((prev) => ({ ...prev, [spec.id]: false }));
                                setDraft(spec.id, { model: val, state: 'dirty' });
                              }
                            }}
                            aria-label={`${spec.label} model selection`}
                            className="h-11 w-full rounded-xl border border-border-control bg-card/[0.04] px-3 font-mono text-micro text-foreground transition-all focus:border-accent"
                          >
                            {availableModels.map((m) => (
                              <option key={m.id} value={m.id} className="bg-card text-foreground">
                                {m.label} {m.badge ? `(${m.badge})` : ''} - {m.id}
                              </option>
                            ))}
                            <option value="__custom__" className="bg-card text-foreground">
                              Custom model identifier…
                            </option>
                          </select>

                          {(customModelInputs[spec.id] ||
                            (!availableModels.some((m) => m.id === draft.model) && Boolean(draft.model))) && (
                            <input
                              type="text"
                              value={draft.model}
                              onChange={(e) =>
                                setDraft(spec.id, { model: e.target.value, state: 'dirty' })
                              }
                              placeholder="Enter custom model identifier (e.g. meta-llama/Llama-3-70b)"
                              aria-label={`${spec.label} custom model override`}
                              className="h-11 w-full rounded-xl border border-border-control bg-card/[0.04] px-3.5 font-mono text-micro text-foreground transition-all focus:border-accent"
                            />
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            value={draft.model}
                            onChange={(e) =>
                              setDraft(spec.id, { model: e.target.value, state: 'dirty' })
                            }
                            placeholder="Optional model override (or click Scan Models)"
                            aria-label={`${spec.label} model override`}
                            className="h-11 w-full rounded-xl border border-border-control bg-card/[0.04] px-3.5 font-mono text-micro text-foreground transition-all focus:border-accent"
                          />
                          <p className="text-macro text-muted-foreground">
                            Leave blank to auto-select provider default, click Scan Models, or enter any custom model identifier.
                          </p>
                        </div>
                      )}
                    </div>
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

/** Fires `useListAgentModels` for one provider and registers the discovered models. */
function ModelsForProvider({
  provider,
  onModels,
  setProviderLoading,
}: {
  provider: LlmProvider;
  onModels: (models: DiscoveredModelResponse[]) => void;
  setProviderLoading: (loading: boolean) => void;
}) {
  const { data, isLoading } = useListAgentModels(provider);
  useEffect(() => {
    setProviderLoading(isLoading);
    if (data && Array.isArray(data.models) && data.models.length > 0) {
      onModels(
        data.models.map((m) => ({
          id: m.id,
          label: m.label,
          badge: canonicalModelBadge(m.badge ?? undefined),
          description: m.description,
          tier: m.tier,
        })),
      );
    }
  }, [data, isLoading, onModels, setProviderLoading]);
  return null;
}

export default AgentSettingsView;
