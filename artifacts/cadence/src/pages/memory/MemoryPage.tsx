import { useState, useMemo } from 'react';
import {
  Brain,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Edit2,
  Filter,
  Zap,
  Bot,
  AlertTriangle,
  RotateCcw,
  Check,
  Sliders,
} from 'lucide-react';
import { soundFX } from '@/lib/sound-fx';
import { toast } from 'sonner';

export interface MemoryFact {
  id: string;
  key: string;
  title: string;
  category: 'procrastination' | 'responsiveness' | 'commitments' | 'hackathon' | 'chronotype';
  source: 'behavioral' | 'conversational';
  confidence: number; // 0..100
  evidenceCount: number;
  lastReinforcedAt: string;
  multiplier?: number; // e.g. 2.1x for duration
  archived: boolean;
  value: Record<string, unknown>;
}

export interface PendingConfirmation {
  id: string;
  prompt: string;
  category: MemoryFact['category'];
  suggestedAction: string;
  proposedFact: Omit<MemoryFact, 'id'>;
}

const INITIAL_FACTS: MemoryFact[] = [
  {
    id: 'fact-1',
    key: 'hackathon_duration_multiplier',
    title: 'Hackathon Tasks Estimate Multiplier',
    category: 'hackathon',
    source: 'behavioral',
    confidence: 94,
    evidenceCount: 16,
    lastReinforcedAt: '2026-09-18T22:30:00Z',
    multiplier: 2.3,
    archived: false,
    value: {
      tag: '#hackathon',
      observedMultiplier: 2.3,
      avgEstimateMin: 45,
      avgActualMin: 104,
      ruleApplied: 'Rule 9: Auto-adjust slot allocation before scheduling',
    },
  },
  {
    id: 'fact-2',
    key: 'peak_focus_rhythm',
    title: 'Peak Evening Focus Window',
    category: 'chronotype',
    source: 'behavioral',
    confidence: 89,
    evidenceCount: 28,
    lastReinforcedAt: '2026-09-19T01:15:00Z',
    archived: false,
    value: {
      peakHours: '21:00 - 23:45',
      sessionCompletionRate: '92%',
      preferredBlockMinutes: 50,
    },
  },
  {
    id: 'fact-3',
    key: 'telegram_channel_preference',
    title: 'High Telegram Responsiveness',
    category: 'responsiveness',
    source: 'behavioral',
    confidence: 96,
    evidenceCount: 42,
    lastReinforcedAt: '2026-09-19T11:20:00Z',
    archived: false,
    value: {
      medianResponseSec: 140,
      completionRateFromNudge: '87%',
      preferredChannel: 'Telegram Bot',
    },
  },
  {
    id: 'fact-4',
    key: 'soft_commitment_tuesday',
    title: 'Tuesday Evening Deep Research Shift',
    category: 'commitments',
    source: 'conversational',
    confidence: 76,
    evidenceCount: 4,
    lastReinforcedAt: '2026-09-15T19:00:00Z',
    archived: false,
    value: {
      window: 'Tuesdays 20:00 - 23:00',
      note: 'User indicated reserved time for MLSS paper reading & experimentation',
    },
  },
];

const INITIAL_CONFIRMATIONS: PendingConfirmation[] = [
  {
    id: 'conf-1',
    prompt:
      'I noticed tasks tagged #writing are deferred 3.4x more often than coding tasks on weekdays. Should I schedule writing blocks during your peak focus window (9pm–11pm) instead of mornings?',
    category: 'procrastination',
    suggestedAction: 'Prioritize writing in evening focus slots & set duration multiplier to 1.5x',
    proposedFact: {
      key: 'writing_task_procrastination_buffer',
      title: 'Writing Task Procrastination Buffer',
      category: 'procrastination',
      source: 'conversational',
      confidence: 82,
      evidenceCount: 7,
      lastReinforcedAt: new Date().toISOString(),
      multiplier: 1.5,
      archived: false,
      value: {
        tag: '#writing',
        preferredShift: 'evening_peak',
        multiplier: 1.5,
      },
    },
  },
];

export function MemoryPage() {
  const [facts, setFacts] = useState<MemoryFact[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cadence_memory_facts');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // fallback
        }
      }
    }
    return INITIAL_FACTS;
  });

  const [confirmations, setConfirmations] = useState<PendingConfirmation[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cadence_memory_confirmations');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // fallback
        }
      }
    }
    return INITIAL_CONFIRMATIONS;
  });

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryFact['category']>('chronotype');
  const [newNote, setNewNote] = useState('');

  const saveFacts = (updated: MemoryFact[]) => {
    setFacts(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('cadence_memory_facts', JSON.stringify(updated));
    }
  };

  const saveConfirmations = (updated: PendingConfirmation[]) => {
    setConfirmations(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('cadence_memory_confirmations', JSON.stringify(updated));
    }
  };

  const handleApproveConfirmation = (conf: PendingConfirmation) => {
    soundFX.playCompletion();
    const newFact: MemoryFact = {
      ...conf.proposedFact,
      id: `fact-${Date.now()}`,
    };
    const updatedFacts = [newFact, ...facts];
    const updatedConfirmations = confirmations.filter((c) => c.id !== conf.id);
    saveFacts(updatedFacts);
    saveConfirmations(updatedConfirmations);
    toast.success('Fact approved and integrated into scheduling intelligence!', {
      description: `Learned: ${newFact.title}`,
    });
  };

  const handleRejectConfirmation = (confId: string) => {
    soundFX.playTactileClick();
    const updated = confirmations.filter((c) => c.id !== confId);
    saveConfirmations(updated);
    toast('Insight dismissed', {
      description: 'Cadence will not adapt behavior for this pattern.',
    });
  };

  const handleDeleteFact = (factId: string) => {
    soundFX.playTactileClick();
    const fact = facts.find((f) => f.id === factId);
    const updated = facts.filter((f) => f.id !== factId);
    saveFacts(updated);

    toast('Memory fact deleted', {
      description: `Removed "${fact?.title}"`,
      action: {
        label: 'Undo',
        onClick: () => {
          if (fact) {
            saveFacts([fact, ...updated]);
            soundFX.playTactileClick();
          }
        },
      },
    });
  };

  const handleToggleArchive = (factId: string) => {
    soundFX.playTactileClick();
    const updated = facts.map((f) =>
      f.id === factId ? { ...f, archived: !f.archived } : f,
    );
    saveFacts(updated);
    toast.success('Fact status updated');
  };

  const handleCreateFact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    soundFX.playCompletion();
    const newFact: MemoryFact = {
      id: `fact-${Date.now()}`,
      key: newKey.trim() || newTitle.toLowerCase().replace(/\s+/g, '_'),
      title: newTitle.trim(),
      category: newCategory,
      source: 'conversational',
      confidence: 100, // Explicit user fact has 100% initial confidence
      evidenceCount: 1,
      lastReinforcedAt: new Date().toISOString(),
      archived: false,
      value: {
        userNote: newNote.trim(),
        createdByUser: true,
      },
    };

    saveFacts([newFact, ...facts]);
    setIsAddOpen(false);
    setNewTitle('');
    setNewKey('');
    setNewNote('');
    toast.success('Custom fact created', {
      description: `Cadence will respect "${newFact.title}"`,
    });
  };

  const filteredFacts = useMemo(() => {
    return facts.filter((f) => {
      if (!showArchived && f.archived) return false;
      if (showArchived && !f.archived) return false;
      if (activeCategory !== 'all' && f.category !== activeCategory) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          f.title.toLowerCase().includes(q) ||
          f.key.toLowerCase().includes(q) ||
          JSON.stringify(f.value).toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [facts, activeCategory, searchQuery, showArchived]);

  return (
    <div className="space-y-8 animate-enter pb-16">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="grid size-10 place-items-center rounded-2xl bg-[#5E5CE6]/15 border border-[#5E5CE6]/30 text-[#5E5CE6] shadow-md">
              <Brain className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
                What Cadence Knows About Me
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#5E5CE6]/20 text-[#5E5CE6] font-medium border border-[#5E5CE6]/30">
                  Transparency Engine
                </span>
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Inspect, calibrate, and verify the structured patterns shaping your schedule (docs/11 §4c).
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              soundFX.playTactileClick();
              setIsAddOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#5E5CE6] hover:bg-[#5E5CE6]/90 text-white font-semibold text-sm shadow-md transition-all active:scale-95"
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
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#FF9F0A] flex items-center gap-2">
              <Sparkles className="size-4 text-[#FF9F0A]" />
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
                className="p-4 sm:p-5 rounded-2xl bg-[#1C1C1E] border border-[#FF9F0A]/30 shadow-lg relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4 animate-enter"
              >
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#FF9F0A]/15 text-[#FF9F0A] border border-[#FF9F0A]/30">
                      {conf.category}
                    </span>
                    <span className="text-xs text-muted-foreground">Confidence: {conf.proposedFact.confidence}%</span>
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
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#30D158] hover:bg-[#30D158]/90 text-black font-bold text-xs shadow-md transition-all active:scale-95"
                  >
                    <CheckCircle2 className="size-4" />
                    Approve Fact
                  </button>
                  <button
                    onClick={() => handleRejectConfirmation(conf.id)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#2C2C2E] hover:bg-[#3A3A3C] text-muted-foreground hover:text-foreground font-medium text-xs transition-all active:scale-95"
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
          {[
            { id: 'all', label: 'All Facts' },
            { id: 'hackathon', label: 'Hackathon Mode' },
            { id: 'chronotype', label: 'Rhythm & Chronotype' },
            { id: 'responsiveness', label: 'Channels' },
            { id: 'procrastination', label: 'Procrastination' },
            { id: 'commitments', label: 'Commitments' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                soundFX.playTactileClick();
                setActiveCategory(cat.id);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                activeCategory === cat.id
                  ? 'bg-[#5E5CE6] text-white shadow-sm'
                  : 'bg-[#1C1C1E] text-muted-foreground hover:text-foreground border border-white/[0.06]'
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
            className="px-3 py-1.5 text-xs bg-[#1C1C1E] border border-white/[0.08] rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#5E5CE6] w-48 sm:w-60"
          />

          <button
            onClick={() => {
              soundFX.playTactileClick();
              setShowArchived(!showArchived);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              showArchived
                ? 'bg-primary/20 text-primary border-primary/30'
                : 'bg-[#1C1C1E] text-muted-foreground border-white/[0.06] hover:text-foreground'
            }`}
          >
            {showArchived ? 'Viewing Archived' : 'Active'}
          </button>
        </div>
      </div>

      {/* Facts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredFacts.length === 0 ? (
          <div className="col-span-full py-16 text-center rounded-3xl bg-[#1C1C1E]/50 border border-white/[0.06] p-8">
            <Brain className="size-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-base font-semibold text-foreground">No memory facts matching filter</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              Facts are automatically learned through focus sessions and nightly analysis, or you can record one manually.
            </p>
          </div>
        ) : (
          filteredFacts.map((fact) => (
            <div
              key={fact.id}
              className={`p-5 rounded-3xl bg-[#1C1C1E] border transition-all hover:border-white/[0.15] shadow-lg flex flex-col justify-between gap-4 ${
                fact.source === 'behavioral' ? 'border-[#30D158]/20' : 'border-[#5E5CE6]/20'
              }`}
            >
              <div className="space-y-3">
                {/* Fact Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                          fact.source === 'behavioral'
                            ? 'bg-[#30D158]/10 text-[#30D158] border-[#30D158]/30'
                            : 'bg-[#5E5CE6]/10 text-[#5E5CE6] border-[#5E5CE6]/30'
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

                      <span className="text-[10px] font-mono text-muted-foreground bg-[#2C2C2E] px-2 py-0.5 rounded-md">
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
                      <span className="text-xs font-extrabold px-2.5 py-1 rounded-xl bg-[#FF9F0A]/20 text-[#FF9F0A] border border-[#FF9F0A]/40 flex items-center gap-1">
                        <Zap className="size-3" />
                        {fact.multiplier}x Duration
                      </span>
                    </div>
                  )}
                </div>

                {/* Structured JSONB Payload Details */}
                <div className="bg-[#121214] rounded-2xl p-3.5 border border-white/[0.04] space-y-1.5 font-mono text-xs">
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
                    <ShieldCheck className="size-3.5 text-[#30D158]" />
                    <span>{fact.confidence}% Confidence</span>
                  </div>
                  <span>•</span>
                  <span>{fact.evidenceCount} observations</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleToggleArchive(fact.id)}
                    className="p-1.5 rounded-lg hover:bg-[#2C2C2E] text-muted-foreground hover:text-foreground transition-colors"
                    title={fact.archived ? 'Unarchive' : 'Archive'}
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteFact(fact.id)}
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
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md grid place-items-center p-4 animate-enter">
          <div className="w-full max-w-lg bg-[#1C1C1E] border border-white/[0.1] rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Brain className="size-5 text-[#5E5CE6]" />
                Record Custom Work Fact
              </h3>
              <button
                onClick={() => setIsAddOpen(false)}
                className="p-1.5 rounded-xl hover:bg-[#2C2C2E] text-muted-foreground"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateFact} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Fact Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sunday evening sprint sessions"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl bg-[#262628] border border-white/[0.08] text-foreground text-sm focus:outline-none focus:border-[#5E5CE6]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Key Identifier
                  </label>
                  <input
                    type="text"
                    placeholder="sunday_sprint_rhythm"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl bg-[#262628] border border-white/[0.08] text-foreground text-sm focus:outline-none focus:border-[#5E5CE6]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as MemoryFact['category'])}
                    className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl bg-[#262628] border border-white/[0.08] text-foreground text-sm focus:outline-none focus:border-[#5E5CE6]"
                  >
                    <option value="chronotype">Chronotype & Rhythm</option>
                    <option value="hackathon">Hackathon Mode</option>
                    <option value="responsiveness">Channel Responsiveness</option>
                    <option value="procrastination">Task Procrastination</option>
                    <option value="commitments">Soft Commitments</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Details / Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Explain the pattern or rule (e.g. Always schedule 45min blocks for system design)..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl bg-[#262628] border border-white/[0.08] text-foreground text-sm focus:outline-none focus:border-[#5E5CE6]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-[#2C2C2E]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#5E5CE6] text-white hover:bg-[#5E5CE6]/90 shadow-md"
                >
                  Save Fact
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
