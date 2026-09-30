import { useMemo, useState } from 'react';
import {
  Brain,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  RotateCcw,
  Zap,
  Bot,
  Loader2,
} from 'lucide-react';
import { soundFX } from '@/lib/sound-fx';
import { toast } from 'sonner';
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
 * View model over the API's MemoryFact.
 *
 * `multiplier` is lifted out of `rule9Multiplier` and `evidenceCount` is
 * defaulted so the card render stays total. `id` is kept as a number because
 * the confirm/approve/archive/delete routes address facts by numeric id.
 */
interface FactView {
  id: number;
  key: string;
  title: string;
  category: ApiMemoryFact['category'];
  source: ApiMemoryFact['source'];
  confidence: number;
  evidenceCount: number;
  multiplier: number | undefined;
  archived: boolean;
  value: Record<string, unknown>;
}

interface ConfirmationView {
  id: number;
  prompt: string;
  category: ApiMemoryFact['category'];
  suggestedAction: string;
  confidence: number;
}

const CATEGORIES: Array<{ id: ListMemoryFactsCategory | 'all'; label: string }> = [
  { id: 'all', label: 'All Facts' },
  { id: 'hackathon', label: 'Hackathon Mode' },
  { id: 'chronotype', label: 'Rhythm & Chronotype' },
  { id: 'channel', label: 'Channels' },
  { id: 'procrastination', label: 'Procrastination' },
  { id: 'soft_commitment', label: 'Commitments' },
];

function toFactView(row: ApiMemoryFact): FactView {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    category: row.category,
    source: row.source,
    confidence: row.confidence,
    evidenceCount: row.evidenceCount ?? 0,
    multiplier: row.rule9Multiplier ?? undefined,
    archived: Boolean(row.archived),
    value: (row.value ?? {}) as Record<string, unknown>,
  };
}

function toConfirmationView(row: ApiMemoryFact): ConfirmationView {
  const value = (row.value ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    prompt:
      typeof value.confirmationPrompt === 'string' ? value.confirmationPrompt : row.title,
    category: row.category,
    suggestedAction:
      typeof value.suggestedAction === 'string'
        ? value.suggestedAction
        : row.rule9Multiplier != null
          ? `Set duration multiplier to ${row.rule9Multiplier}x`
          : 'Update scheduling behavior',
    confidence: row.confidence,
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
  const [showArchived, setShowArchived] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newCategory, setNewCategory] = useState<ApiMemoryFact['category']>('chronotype');
  const [newNote, setNewNote] = useState('');

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

  const facts: FactView[] = useMemo(
    () => (factsQuery.data?.facts ?? []).map(toFactView),
    [factsQuery.data],
  );

  const confirmations: ConfirmationView[] = useMemo(
    () => (confirmationsQuery.data?.confirmations ?? []).map(toConfirmationView),
    [confirmationsQuery.data],
  );

  const handleApproveConfirmation = (conf: ConfirmationView) => {
    soundFX.playCompletion();
    approveConfirmation.mutate(
      { id: conf.id },
      {
        onSuccess: () => {
          confirmationsQuery.refetch();
          factsQuery.refetch();
          toast.success('Fact approved', {
            description: `Cadence will now factor in: ${conf.prompt.slice(0, 80)}`,
          });
        },
        onError: (err) =>
          toast.error('Could not approve', { description: errorMessage(err) }),
      },
    );
  };

  const handleRejectConfirmation = (confId: number) => {
    soundFX.playTactileClick();
    declineConfirmation.mutate(
      { id: confId },
      {
        onSuccess: () => {
          confirmationsQuery.refetch();
          toast('Insight dismissed', {
            description: 'Cadence will not adapt behavior for this pattern.',
          });
        },
        onError: (err) =>
          toast.error('Could not dismiss', { description: errorMessage(err) }),
      },
    );
  };

  const handleDeleteFact = (fact: FactView) => {
    soundFX.playTactileClick();
    deleteFact.mutate(
      { id: fact.id },
      {
        onSuccess: () => {
          factsQuery.refetch();
          toast('Memory fact deleted', { description: `Removed "${fact.title}"` });
        },
        onError: (err) => toast.error('Could not delete', { description: errorMessage(err) }),
      },
    );
  };

  const handleToggleArchive = (fact: FactView) => {
    soundFX.playTactileClick();
    updateFact.mutate(
      { id: fact.id, data: { archived: !fact.archived } },
      {
        onSuccess: () => {
          factsQuery.refetch();
          toast.success(fact.archived ? 'Fact restored' : 'Fact archived');
        },
        onError: (err) => toast.error('Could not update', { description: errorMessage(err) }),
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
      if (f.archived !== showArchived) return false;
      if (activeCategory !== 'all' && f.category !== activeCategory) return false;
      if (!q) return true;
      return (
        f.title.toLowerCase().includes(q) ||
        f.key.toLowerCase().includes(q) ||
        JSON.stringify(f.value).toLowerCase().includes(q)
      );
    });
  }, [facts, activeCategory, searchQuery, showArchived]);

  return (
    <div className="space-y-8 animate-enter pb-16">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="grid size-10 place-items-center rounded-2xl bg-ai/15 border border-ai/30 text-ai shadow-md">
              <Brain className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
                What Cadence Knows About Me
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-ai/20 text-ai font-medium border border-ai/30">
                  Transparency Engine
                </span>
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Inspect, calibrate, and verify the structured patterns shaping your schedule (spec/agent-and-memory-subsystem.md Ãƒâ€šÃ‚Â§5).
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isRefetching && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Syncing
            </span>
          )}
          <button
            onClick={() => {
              soundFX.playTactileClick();
              setIsAddOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ai hover:bg-ai/90 text-white font-semibold text-sm shadow-md transition-all active:scale-95"
          >
            <Plus className="size-4" />
            Add Memory Fact
          </button>
        </div>
      </div>

      {/* Confirmation Queue (Source B Review Gate) */}
      {confirmations.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-accent flex items-center gap-2">
              <Sparkles className="size-4 text-accent" />
              Inferred Insights Awaiting Your Confirmation ({confirmations.length})
            </h2>
            <span className="text-xs text-muted-foreground">
              Source B: Never silently modifies behavior without approval
            </span>
          </div>

          <div className="grid gap-3">
            {confirmations.map((conf) => (
              <div
                key={conf.id}
                className="p-4 sm:p-5 rounded-2xl bg-card border border-accent/30 shadow-lg relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4 animate-enter"
              >
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-accent/15 text-accent border border-accent/30">
                      {conf.category}
                    </span>
                    <span className="text-xs text-muted-foreground">Confidence: {conf.confidence}%</span>
                  </div>
                  <p className="text-sm sm:text-base font-medium text-foreground">
                    "{conf.prompt}"
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">Proposed Adaptation:</strong> {conf.suggestedAction}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleApproveConfirmation(conf)}
                    disabled={isMutating}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-success hover:bg-success/90 text-black font-bold text-xs shadow-md transition-all active:scale-95 disabled:opacity-60"
                  >
                    <CheckCircle2 className="size-4" />
                    Approve Fact
                  </button>
                  <button
                    onClick={() => handleRejectConfirmation(conf.id)}
                    disabled={isMutating}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted hover:bg-muted text-muted-foreground hover:text-foreground font-medium text-xs transition-all active:scale-95 disabled:opacity-60"
                  >
                    <XCircle className="size-4" />
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filter and Search Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                soundFX.playTactileClick();
                setActiveCategory(cat.id);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                activeCategory === cat.id
                  ? 'bg-ai text-white shadow-sm'
                  : 'bg-card text-muted-foreground hover:text-foreground border border-white/[0.06]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search learned facts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-1.5 text-xs bg-card border border-border-control rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ai w-48 sm:w-60"
          />

          <button
            onClick={() => {
              soundFX.playTactileClick();
              setShowArchived(!showArchived);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              showArchived
                ? 'bg-primary/20 text-primary border-primary/30'
                : 'bg-card text-muted-foreground border-white/[0.06] hover:text-foreground'
            }`}
          >
            {showArchived ? 'Viewing Archived' : 'Active'}
          </button>
        </div>
      </div>

      {/* Facts Grid */}
      <div
        className={`grid grid-cols-1 md:grid-cols-2 gap-4 transition-opacity ${
          isRefetching ? 'opacity-60' : 'opacity-100'
        }`}
      >
        {isLoading ? (
          <div className="col-span-full py-16 text-center rounded-2xl bg-card/50 border border-white/[0.06] p-8">
            <Loader2 className="size-8 text-muted-foreground/40 mx-auto mb-3 animate-spin" />
            <p className="text-sm text-muted-foreground">Loading what Cadence knowsÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦</p>
          </div>
        ) : factsQuery.isError ? (
          <div className="col-span-full py-16 text-center rounded-2xl bg-destructive/10 border border-destructive/30 p-8">
            <p className="text-base font-semibold text-foreground">
              Could not load memory facts
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              {errorMessage(factsQuery.error)}
            </p>
            <button
              onClick={() => factsQuery.refetch()}
              className="mt-4 px-4 py-2 rounded-xl bg-ai hover:bg-ai/90 text-white font-semibold text-xs shadow-md transition-all active:scale-95"
            >
              Retry
            </button>
          </div>
        ) : filteredFacts.length === 0 ? (
          <div className="col-span-full py-16 text-center rounded-2xl bg-card/50 border border-white/[0.06] p-8">
            <Brain className="size-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-base font-semibold text-foreground">
              {facts.length === 0
                ? 'Cadence has not learned anything yet'
                : 'No memory facts matching filter'}
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              {facts.length === 0
                ? 'Facts appear here once the nightly analysis has real completed tasks and focus sessions to compare against. Nothing is shown until then ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â this screen never displays invented patterns.'
                : 'Try a different category, or clear the search.'}
            </p>
          </div>
        ) : (
          filteredFacts.map((fact) => (
            <div
              key={fact.id}
              className={`p-5 rounded-2xl bg-card border transition-all hover:border-white/[0.15] shadow-lg flex flex-col justify-between gap-4 ${
                fact.source === 'behavioral' ? 'border-success/20' : 'border-ai/20'
              }`}
            >
              <div className="space-y-3">
                {/* Fact Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                          fact.source === 'behavioral'
                            ? 'bg-success/10 text-success border-success/30'
                            : 'bg-ai/10 text-ai border-ai/30'
                        }`}
                      >
                        {fact.source === 'behavioral' ? (
                          <>
                            <TrendingUp className="size-3" /> Source A: Arithmetic
                          </>
                        ) : (
                          <>
                            <Bot className="size-3" /> Source B: Inferred
                          </>
                        )}
                      </span>

                      <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                        {fact.category}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-foreground mt-1.5 tracking-tight">
                      {fact.title}
                    </h3>
                  </div>

                  {/* Multiplier / Rule 9 Badge */}
                  {fact.multiplier && (
                    <div className="shrink-0 text-right">
                      <span className="text-xs font-extrabold px-2.5 py-1 rounded-xl bg-accent/20 text-accent border border-accent/40 flex items-center gap-1">
                        <Zap className="size-3" />
                        {fact.multiplier}x Duration
                      </span>
                    </div>
                  )}
                </div>

                {/* Structured JSONB Payload Details */}
                <div className="bg-card rounded-2xl p-3.5 border border-white/[0.04] space-y-1.5 font-mono text-xs">
                  {Object.entries(fact.value).map(([k, v]) => (
                    <div key={k} className="flex justify-between items-start gap-4">
                      <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1')}:</span>
                      <span className="text-foreground font-semibold text-right truncate max-w-[200px]">
                        {String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fact Footer */}
              <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <ShieldCheck className="size-3.5 text-success" />
                    <span>{fact.confidence}% Confidence</span>
                  </div>
                  <span>ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢</span>
                  <span>{fact.evidenceCount} observations</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleToggleArchive(fact)}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title={fact.archived ? 'Unarchive' : 'Archive'}
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteFact(fact)}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="Delete Fact"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Manual Add Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-enter">
          <div className="w-full sm:max-w-lg max-h-[92dvh] sm:max-h-[min(540px,calc(100dvh-2rem))] flex flex-col bg-muted border-t sm:border border-white/[0.12] rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-black text-foreground overflow-hidden my-0 sm:my-auto">
            {/* Mobile Pull-Down Indicator Grab Bar */}
            <div className="sm:hidden mx-auto w-10 h-1 rounded-full bg-white/25 mt-2.5 mb-0.5 shrink-0" />
            <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-white/[0.08] bg-card shrink-0">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Brain className="size-4 text-ai" />
                <span>Record Custom Work Fact</span>
              </h3>
              <button
                onClick={() => setIsAddOpen(false)}
                className="grid size-7 place-items-center rounded-lg text-zinc-400 hover:bg-white/[0.08] hover:text-white transition-colors active:scale-95 tap-target-expand"
              >
                ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¢
              </button>
            </div>

            <form onSubmit={handleCreateFact} className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4 custom-scrollbar">
              <div>
                <label className="text-xs font-medium text-zinc-400">
                  Fact Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sunday evening sprint sessions"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="mt-1.5 h-9 w-full rounded-lg bg-card border border-border-control px-3 text-xs text-white placeholder:text-zinc-500 focus:border-ai focus:outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-400">
                    Key Identifier
                  </label>
                  <input
                    type="text"
                    placeholder="sunday_sprint_rhythm"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    className="mt-1.5 h-9 w-full rounded-lg bg-card border border-border-control px-3 text-xs text-white placeholder:text-zinc-500 focus:border-ai focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-400">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as ApiMemoryFact['category'])}
                    className="mt-1.5 h-9 w-full rounded-lg bg-card border border-border-control px-2.5 text-xs text-white focus:border-ai focus:outline-none transition-colors"
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
                <label className="text-xs font-medium text-zinc-400">
                  Details / Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Explain the pattern or rule (e.g. Always schedule 45min blocks for system design)..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="mt-1.5 w-full rounded-lg bg-card border border-border-control p-3 text-xs text-white placeholder:text-zinc-500 focus:border-ai focus:outline-none transition-colors resize-none leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="h-8 px-3 rounded-lg text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors active:scale-95 tap-target-expand"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createFact.isPending}
                  className="h-8 px-4 rounded-lg bg-ai hover:bg-ai/90 text-white font-semibold text-xs shadow-sm transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-60 tap-target-expand"
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
        </div>
      )}
    </div>
  );
}
export default MemoryPage;
