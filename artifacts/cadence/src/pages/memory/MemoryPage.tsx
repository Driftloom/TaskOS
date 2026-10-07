import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Brain, Sparkles, Plus, Loader2 } from 'lucide-react';
import { soundFX } from '@/lib/sound-fx';
import { toast } from 'sonner';
import { ConfirmationPrompt, MemoryFactCard } from '@/components/memory/MemoryFactCard';
import {
  useListMemoryFacts,
  useListMemoryConfirmations,
  useCreateMemoryFact,
  useUpdateMemoryFact,
  useDeleteMemoryFact,
  useApproveMemoryConfirmation,
  useDeclineMemoryConfirmation,
  type MemoryFact as ApiMemoryFact,
  type ListMemoryFactsCategory,
} from '@workspace/api-client-react';

/**
 * A pending Source B confirmation: the raw fact row plus the two strings the
 * user reads. Both come out of the JSONB `value` payload the nightly job wrote.
 *
 * The confirm/approve/archive/delete routes address facts by numeric id, so the
 * raw `ApiMemoryFact` is what gets handed to the cards — no local view model.
 * The defaults the cards need (`evidenceCount`, `rule9Multiplier`,
 * `lastReinforcedAt`) are applied inside `MemoryFactCard` so its render is
 * total regardless of what the wire omits.
 */
interface ConfirmationView {
  fact: ApiMemoryFact;
  prompt: string;
  suggestedAction: string;
}

/** Scopes a mutation failure to the one card that caused it. */
interface ActionError {
  id: number;
  message: string;
}

const CATEGORIES: Array<{ id: ListMemoryFactsCategory | 'all'; label: string }> = [
  { id: 'all', label: 'All Facts' },
  { id: 'hackathon', label: 'Hackathon Mode' },
  { id: 'chronotype', label: 'Rhythm & Chronotype' },
  { id: 'channel', label: 'Channels' },
  { id: 'procrastination', label: 'Procrastination' },
  { id: 'soft_commitment', label: 'Commitments' },
];

function toConfirmationView(row: ApiMemoryFact): ConfirmationView {
  const value = (row.value ?? {}) as Record<string, unknown>;
  return {
    fact: row,
    prompt:
      typeof value.confirmationPrompt === 'string' ? value.confirmationPrompt : row.title,
    suggestedAction:
      typeof value.suggestedAction === 'string'
        ? value.suggestedAction
        : row.rule9Multiplier != null
          ? `Cadence will schedule this kind of task at ${row.rule9Multiplier}x its estimated duration.`
          : 'Cadence will use this pattern when it schedules work.',
  };
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return 'Request failed';
}

export function MemoryPage() {
  const [activeCategory, setActiveCategory] = useState<ListMemoryFactsCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  // P15.4: archived facts live behind an Archived tab. They are never deleted
  // as a side effect of anything on this screen.
  const [showArchived, setShowArchived] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newCategory, setNewCategory] = useState<ApiMemoryFact['category']>('chronotype');
  const [newNote, setNewNote] = useState('');
  // Errors are scoped to the card that caused them so one failure never blanks
  // or re-labels the rest of the list (P17.3).
  const [factError, setFactError] = useState<ActionError | null>(null);
  const [confirmationError, setConfirmationError] = useState<ActionError | null>(null);
  const [busyFactId, setBusyFactId] = useState<number | null>(null);
  const [busyConfirmationId, setBusyConfirmationId] = useState<number | null>(null);

  // All memory state comes from the server. There is deliberately no local seed
  // array and no localStorage mirror: a fabricated fact rendered with a
  // confidence percentage is indistinguishable from a learned one, which is
  // precisely what this screen exists to prevent. An empty database renders an
  // empty screen.
  const factsQuery = useListMemoryFacts({
    archived: showArchived,
    ...(activeCategory !== 'all' ? { category: activeCategory } : {}),
  });
  const confirmationsQuery = useListMemoryConfirmations();

  const createFact = useCreateMemoryFact();
  const updateFact = useUpdateMemoryFact();
  const deleteFact = useDeleteMemoryFact();
  const approveConfirmation = useApproveMemoryConfirmation();
  const declineConfirmation = useDeclineMemoryConfirmation();

  const isLoading = factsQuery.isLoading || confirmationsQuery.isLoading;
  // Dim rather than blank out during a refetch, so a refresh never reads as
  // data loss.
  const isRefetching = (factsQuery.isFetching || confirmationsQuery.isFetching) && !isLoading;
  const isMutating =
    createFact.isPending ||
    updateFact.isPending ||
    deleteFact.isPending ||
    approveConfirmation.isPending ||
    declineConfirmation.isPending;

  const facts: ApiMemoryFact[] = useMemo(() => factsQuery.data?.facts ?? [], [factsQuery.data]);

  const confirmations: ConfirmationView[] = useMemo(
    () => (confirmationsQuery.data?.confirmations ?? []).map(toConfirmationView),
    [confirmationsQuery.data],
  );

  const handleApproveConfirmation = (conf: ConfirmationView) => {
    soundFX.playCompletion();
    setBusyConfirmationId(conf.fact.id);
    setConfirmationError(null);
    approveConfirmation.mutate(
      { id: conf.fact.id },
      {
        onSuccess: () => {
          confirmationsQuery.refetch();
          factsQuery.refetch();
          toast.success('Fact approved', {
            description: conf.suggestedAction,
          });
        },
        onError: (err) => {
          setConfirmationError({ id: conf.fact.id, message: `${errorMessage(err)} Nothing was changed.` });
          toast.error('Could not approve', { description: errorMessage(err) });
        },
        onSettled: () => setBusyConfirmationId(null),
      },
    );
  };

  const handleRejectConfirmation = (conf: ConfirmationView) => {
    soundFX.playTactileClick();
    setBusyConfirmationId(conf.fact.id);
    setConfirmationError(null);
    declineConfirmation.mutate(
      { id: conf.fact.id },
      {
        onSuccess: () => {
          confirmationsQuery.refetch();
          toast('Insight dismissed', {
            description: 'Cadence keeps scheduling the way it does now. Nothing was changed.',
          });
        },
        onError: (err) => {
          setConfirmationError({ id: conf.fact.id, message: `${errorMessage(err)} Nothing was changed.` });
          toast.error('Could not dismiss', { description: errorMessage(err) });
        },
        onSettled: () => setBusyConfirmationId(null),
      },
    );
  };

  const handleEditFact = (fact: ApiMemoryFact, nextTitle: string) => {
    soundFX.playTactileClick();
    setBusyFactId(fact.id);
    setFactError(null);
    updateFact.mutate(
      { id: fact.id, data: { title: nextTitle } },
      {
        onSuccess: () => {
          factsQuery.refetch();
          toast.success('Statement updated');
        },
        onError: (err) => {
          setFactError({ id: fact.id, message: `${errorMessage(err)} Your edit was not saved.` });
          toast.error('Could not update', { description: errorMessage(err) });
        },
        onSettled: () => setBusyFactId(null),
      },
    );
  };

  const handleDeleteFact = (fact: ApiMemoryFact) => {
    soundFX.playTactileClick();
    setBusyFactId(fact.id);
    setFactError(null);
    deleteFact.mutate(
      { id: fact.id },
      {
        onSuccess: () => {
          factsQuery.refetch();
          toast('Memory fact deleted', { description: `Removed "${fact.title}"` });
        },
        onError: (err) => {
          setFactError({ id: fact.id, message: `${errorMessage(err)} Nothing was deleted.` });
          toast.error('Could not delete', { description: errorMessage(err) });
        },
        onSettled: () => setBusyFactId(null),
      },
    );
  };

  const handleToggleArchive = (fact: ApiMemoryFact) => {
    soundFX.playTactileClick();
    setBusyFactId(fact.id);
    setFactError(null);
    updateFact.mutate(
      { id: fact.id, data: { archived: !fact.archived } },
      {
        onSuccess: () => {
          factsQuery.refetch();
          toast.success(
            fact.archived ? 'Fact restored' : 'Fact archived',
            {
              description: fact.archived
                ? 'It is back in your active profile.'
                : 'It moved to the Archived tab. Nothing was deleted.',
            },
          );
        },
        onError: (err) => {
          setFactError({ id: fact.id, message: `${errorMessage(err)} Nothing was changed.` });
          toast.error('Could not update', { description: errorMessage(err) });
        },
        onSettled: () => setBusyFactId(null),
      },
    );
  };

  const handleCreateFact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    soundFX.playCompletion();
    createFact.mutate(
      {
        data: {
          key: newKey.trim() || newTitle.toLowerCase().replace(/\s+/g, '_'),
          title: newTitle.trim(),
          category: newCategory,
          source: 'conversational',
          confidence: 100,
          value: { userNote: newNote.trim(), createdByUser: true },
        },
      },
      {
        onSuccess: () => {
          factsQuery.refetch();
          setIsAddOpen(false);
          setNewTitle('');
          setNewKey('');
          setNewNote('');
          toast.success('Custom fact saved');
        },
        onError: (err) => toast.error('Could not save fact', { description: errorMessage(err) }),
      },
    );
  };

  const filteredFacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return facts.filter((f) => {
      // `archived` is optional on the wire, so coerce before comparing.
      if (Boolean(f.archived) !== showArchived) return false;
      if (activeCategory !== 'all' && f.category !== activeCategory) return false;
      if (!q) return true;
      return (
        f.title.toLowerCase().includes(q) ||
        f.key.toLowerCase().includes(q) ||
        JSON.stringify(f.value).toLowerCase().includes(q)
      );
    });
  }, [facts, activeCategory, searchQuery, showArchived]);

  // Human label for the no-results message, so it never leaks a raw enum value.
  const activeCategoryLabel =
    CATEGORIES.find((c) => c.id === activeCategory)?.label ?? 'this category';

  return (
    <div className="space-y-8 animate-enter">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-control pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="grid size-10 place-items-center rounded-2xl bg-ai/15 border border-ai/30 text-ai-text shadow-md">
              <Brain className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
                What Cadence Knows About Me
                <span className="text-caption px-2.5 py-0.5 rounded-full bg-ai/20 text-ai-text font-medium border border-ai/30">
                  Transparency Engine
                </span>
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Inspect, calibrate, and verify the structured patterns shaping your schedule (spec/agent-and-memory-subsystem.md §5).
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isRefetching && (
            <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Syncing
            </span>
          )}
          {/* A solid `--ai` fill takes `text-primary-foreground`, never
              `text-foreground`: axe measured the latter at 3.13:1 in dark against
              the 4.5:1 floor. `text-primary-foreground` is already the label token
              the agent surfaces use on `bg-ai` (AgentPanel, ActionPreview,
              AgentActionCard) and measures 6.10:1 dark / 4.89:1 light here. */}
          <button
            onClick={() => {
              soundFX.playTactileClick();
              setIsAddOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ai hover:bg-ai/90 text-primary-foreground font-semibold text-sm shadow-md transition-all active:scale-95"
          >
            <Plus className="size-4" />
            Add Memory Fact
          </button>
        </div>
      </div>

      {/* Confirmation Queue (Source B review gate) — P15.4 */}
      {confirmations.length > 0 && (
        <section className="space-y-3" data-testid="memory-confirmation-queue">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-accent flex items-center gap-2">
              <Sparkles className="size-4 text-accent" aria-hidden="true" />
              Inferred Insights Awaiting Your Confirmation ({confirmations.length})
            </h2>
            <span className="text-caption text-muted-foreground">
              Source B: never changes behaviour without your approval
            </span>
          </div>

          <div className="grid gap-3">
            {confirmations.map((conf) => (
              <ConfirmationPrompt
                key={conf.fact.id}
                fact={conf.fact}
                prompt={conf.prompt}
                suggestedAction={conf.suggestedAction}
                onApprove={(fact) =>
                  handleApproveConfirmation({
                    fact,
                    prompt: conf.prompt,
                    suggestedAction: conf.suggestedAction,
                  })
                }
                onDismiss={(fact) =>
                  handleRejectConfirmation({
                    fact,
                    prompt: conf.prompt,
                    suggestedAction: conf.suggestedAction,
                  })
                }
                busy={isMutating && busyConfirmationId === conf.fact.id}
                error={confirmationError?.id === conf.fact.id ? confirmationError.message : null}
              />
            ))}
          </div>
        </section>
      )}

      {/* Filter, search, and the Active / Archived tabs (P15.4) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div
          role="group"
          aria-label="Fact status"
          data-testid="memory-facts-tabs"
          className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1"
        >
          {(
            [
              { id: false, label: 'Active' },
              { id: true, label: 'Archived' },
            ] as const
          ).map((tab) => (
            <button
              key={String(tab.id)}
              type="button"
              aria-pressed={showArchived === tab.id}
              onClick={() => {
                soundFX.playTactileClick();
                setShowArchived(tab.id);
              }}
              data-testid={`memory-facts-tab-${tab.label.toLowerCase()}`}
              className={`min-h-9 rounded-lg px-3 text-caption font-semibold transition-colors tap-target-expand ${
                showArchived === tab.id
                  ? 'bg-ai text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  soundFX.playTactileClick();
                  setActiveCategory(cat.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-caption font-semibold whitespace-nowrap transition-all ${
                  activeCategory === cat.id
                    ? 'bg-ai text-primary-foreground shadow-sm'
                    : 'bg-card text-muted-foreground hover:text-foreground border border-border'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Search learned facts..."
            aria-label="Search learned facts"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-1.5 text-caption bg-card border border-border-control rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ai w-48 sm:w-60"
          />
        </div>
      </div>

      {/* Facts Grid */}
      <div
        className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 transition-opacity ${
          isRefetching ? 'opacity-60' : 'opacity-100'
        }`}
      >
        {isLoading ? (
          <div
            data-testid="memory-facts-loading"
            className="col-span-full py-16 text-center rounded-2xl bg-card/50 border border-border p-8 min-h-[212px] flex flex-col items-center justify-center"
          >
            <Loader2 className="size-8 text-muted-foreground/40 mx-auto mb-3 animate-spin" aria-hidden="true" />
            <p className="text-footnote text-muted-foreground">Loading what Cadence knows</p>
          </div>
        ) : factsQuery.isError ? (
          <div
            role="alert"
            data-testid="memory-facts-error"
            className="col-span-full py-16 text-center rounded-2xl bg-destructive/10 border border-destructive/30 p-8"
          >
            <p className="text-body font-semibold text-foreground">
              Could not load memory facts
            </p>
            <p className="text-caption text-muted-foreground mt-1 max-w-md mx-auto">
              {errorMessage(factsQuery.error)}
            </p>
            <button
              type="button"
              onClick={() => factsQuery.refetch()}
              data-testid="memory-facts-retry"
              className="mt-4 inline-flex min-h-9 items-center px-4 rounded-xl border border-border-control bg-card text-caption font-semibold text-foreground transition-colors hover:bg-muted tap-target-expand"
            >
              Retry
            </button>
          </div>
        ) : filteredFacts.length === 0 ? (
          <div
            data-testid="memory-facts-empty"
            className="col-span-full py-16 text-center rounded-2xl bg-card/50 border border-border p-8"
          >
            <Brain className="size-10 text-muted-foreground/40 mx-auto mb-3" aria-hidden="true" />
            <p className="text-body font-semibold text-foreground">
              {showArchived
                ? 'Nothing archived yet'
                : facts.length === 0
                  ? 'Nothing learned yet. Patterns appear after about two weeks of activity.'
                  : `No facts match "${searchQuery.trim() || activeCategoryLabel}"`}
            </p>
            <p className="text-caption text-muted-foreground mt-1 max-w-md mx-auto leading-relaxed">
              {showArchived
                ? 'Archived facts are kept here, never deleted. Archive one from the Active tab and it will appear here.'
                : facts.length === 0
                  ? 'Cadence compares your completed tasks and focus sessions each night. Until there is real evidence to learn from, this screen stays empty — it never shows invented patterns.'
                  : 'Clear the search or pick a different category.'}
            </p>
            {!showArchived && facts.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  soundFX.playTactileClick();
                  setSearchQuery('');
                  setActiveCategory('all');
                }}
                className="mt-4 px-4 py-2 rounded-xl border border-border-control bg-card text-caption font-semibold text-foreground transition-colors hover:bg-muted"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          filteredFacts.map((fact) => (
            <MemoryFactCard
              key={fact.id}
              fact={fact}
              onEdit={handleEditFact}
              onArchive={handleToggleArchive}
              onDelete={handleDeleteFact}
              busy={isMutating && busyFactId === fact.id}
              error={factError?.id === fact.id ? factError.message : null}
            />
          ))
        )}
      </div>

      {/* Manual Add Modal */}
      {isAddOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-enter">
          <div className="w-full sm:max-w-lg max-h-[calc(100dvh-2rem)] flex flex-col bg-muted border border-border-control rounded-2xl shadow-2xl shadow-black text-foreground overflow-hidden my-auto">
            {/* Mobile Pull-Down Indicator Grab Bar */}
            <div className="sm:hidden mx-auto w-10 h-1 rounded-full bg-card/25 mt-2.5 mb-0.5 shrink-0" />
            <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-border-control bg-card shrink-0">
              <h3 className="text-callout font-bold text-foreground flex items-center gap-2">
                <Brain className="size-4 text-ai-text" />
                <span>Record Custom Work Fact</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                aria-label="Close"
                data-testid="button-close-add-fact"
                className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors active:scale-95 tap-target-expand"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <form onSubmit={handleCreateFact} className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4 custom-scrollbar">
              <div>
                <label className="text-caption font-medium text-muted-foreground">
                  Fact Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sunday evening sprint sessions"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="mt-1.5 h-9 w-full rounded-lg bg-card border border-border-control px-3 text-caption text-foreground placeholder:text-muted-foreground focus:border-ai focus:outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-caption font-medium text-muted-foreground">
                    Key Identifier
                  </label>
                  <input
                    type="text"
                    placeholder="sunday_sprint_rhythm"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    className="mt-1.5 h-9 w-full rounded-lg bg-card border border-border-control px-3 text-caption text-foreground placeholder:text-muted-foreground focus:border-ai focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="text-caption font-medium text-muted-foreground">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as ApiMemoryFact['category'])}
                    className="mt-1.5 h-9 w-full rounded-lg bg-card border border-border-control px-2.5 text-caption text-foreground focus:border-ai focus:outline-none transition-colors"
                  >
                    <option value="chronotype">Chronotype & Rhythm</option>
                    <option value="hackathon">Hackathon Mode</option>
                    <option value="channel">Channel Responsiveness</option>
                    <option value="procrastination">Task Procrastination</option>
                    <option value="soft_commitment">Soft Commitments</option>
                    <option value="custom">Custom Pattern</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-caption font-medium text-muted-foreground">
                  Details / Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Explain the pattern or rule (e.g. Always schedule 45min blocks for system design)..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="mt-1.5 w-full rounded-lg bg-card border border-border-control p-3 text-caption text-foreground placeholder:text-muted-foreground focus:border-ai focus:outline-none transition-colors resize-none leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border-control">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="h-8 px-3 rounded-lg text-caption font-medium text-muted-foreground hover:text-foreground hover:bg-card/[0.06] transition-colors active:scale-95 tap-target-expand"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createFact.isPending}
                  className="h-8 px-4 rounded-lg bg-ai hover:bg-ai/90 text-primary-foreground font-semibold text-caption shadow-sm transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-60 tap-target-expand"
                >
                  {createFact.isPending ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      Saving
                    </>
                  ) : (
                    <span>Save Fact</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
export default MemoryPage;
