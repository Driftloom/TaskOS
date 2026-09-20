import { useState, useEffect, useMemo } from 'react';
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
  Loader2,
} from 'lucide-react';
import { soundFX } from '@/lib/sound-fx';
import { toast } from 'sonner';

export interface MemoryFact {
  id: string;
  key: string;
  title: string;
  category: 'procrastination' | 'channel' | 'soft_commitment' | 'hackathon' | 'chronotype' | 'custom';
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
    category: 'channel',
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
    category: 'soft_commitment',
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
  const [localFacts, setLocalFacts] = useState<MemoryFact[]>(() => {
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

  const [localConfirmations, setLocalConfirmations] = useState<PendingConfirmation[]>(() => {
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

  // 1. Fetch real memory facts from Express 5 backend
  const [serverFacts, setServerFacts] = useState<any[] | null>(null);
  const [isLoadingFacts, setIsLoadingFacts] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingFacts(true);
    const catParam = activeCategory !== 'all' ? `&category=${encodeURIComponent(activeCategory)}` : '';
    fetch(`/api/memory/facts?archived=${showArchived}${catParam}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch memory facts');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setServerFacts((data.facts || []) as any[]);
      })
      .catch((err) => {
        console.warn('Backend memory API unreachable, using cached facts:', err);
        if (!cancelled) setServerFacts(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingFacts(false);
      });
    return () => { cancelled = true; };
  }, [showArchived, activeCategory]);

  // 2. Fetch pending confirmations (Source B conversational inferences)
  const [serverConfirmations, setServerConfirmations] = useState<any[] | null>(null);
  const [isLoadingConfirmations, setIsLoadingConfirmations] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingConfirmations(true);
    fetch('/api/memory/confirmations')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch confirmations');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setServerConfirmations((data.confirmations || []) as any[]);
      })
      .catch((err) => {
        console.warn('Backend confirmations API unreachable, using cached confirmations:', err);
        if (!cancelled) setServerConfirmations(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingConfirmations(false);
      });
    return () => { cancelled = true; };
  }, []);

  const saveLocalFacts = (updated: MemoryFact[]) => {
    setLocalFacts(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('cadence_memory_facts', JSON.stringify(updated));
    }
  };

  const saveLocalConfirmations = (updated: PendingConfirmation[]) => {
    setLocalConfirmations(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('cadence_memory_confirmations', JSON.stringify(updated));
    }
  };

  // Harmonize facts between real server response and optimistic local store
  const facts: MemoryFact[] = useMemo(() => {
    if (serverFacts && serverFacts.length > 0) {
      return serverFacts.map((row: any) => ({
        id: String(row.id),
        key: row.key,
        title: row.title,
        category: (row.category === 'responsiveness' ? 'channel' : row.category === 'commitments' ? 'soft_commitment' : row.category) as MemoryFact['category'],
        source: (row.source || 'behavioral') as 'behavioral' | 'conversational',
        confidence: row.confidence ?? 85,
        evidenceCount: row.evidenceCount ?? 1,
        lastReinforcedAt: typeof row.lastReinforcedAt === 'string' ? row.lastReinforcedAt : new Date(row.lastReinforcedAt || Date.now()).toISOString(),
        multiplier: row.rule9Multiplier ?? row.multiplier,
        archived: Boolean(row.archived),
        value: row.value || {},
      }));
    }
    return localFacts;
  }, [serverFacts, localFacts]);

  // Harmonize confirmations between real server response and optimistic local store
  const confirmations: PendingConfirmation[] = useMemo(() => {
    if (serverConfirmations && serverConfirmations.length > 0) {
      return serverConfirmations.map((row: any) => ({
        id: String(row.id),
        prompt: row.confirmationPrompt || row.title || 'Inferred scheduling pattern requires your review',
        category: (row.category === 'responsiveness' ? 'channel' : row.category === 'commitments' ? 'soft_commitment' : row.category) as MemoryFact['category'],
        suggestedAction: (row.value?.suggestedAction as string) || (row.rule9Multiplier ? `Set duration multiplier to ${row.rule9Multiplier}x` : 'Update scheduling behavior'),
        proposedFact: {
          key: row.key,
          title: row.title,
          category: (row.category === 'responsiveness' ? 'channel' : row.category === 'commitments' ? 'soft_commitment' : row.category) as MemoryFact['category'],
          source: (row.source || 'conversational') as 'behavioral' | 'conversational',
          confidence: row.confidence ?? 80,
          evidenceCount: row.evidenceCount ?? 1,
          lastReinforcedAt: typeof row.lastReinforcedAt === 'string' ? row.lastReinforcedAt : new Date(row.lastReinforcedAt || Date.now()).toISOString(),
          multiplier: row.rule9Multiplier ?? undefined,
          archived: false,
          value: row.value || {},
        },
      }));
    }
    return localConfirmations;
  }, [serverConfirmations, localConfirmations]);

  const handleApproveConfirmation = async (conf: PendingConfirmation) => {
    soundFX.playCompletion();
    try {
      const numericId = parseInt(conf.id, 10);
      if (!isNaN(numericId)) {
        await fetch(`/api/memory/confirmations/${numericId}/approve`, { method: 'POST' });
      }
    } catch (err) {
      console.warn('API error approving confirmation:', err);
    }
    const newFact: MemoryFact = {
      ...conf.proposedFact,
      id: `fact-${Date.now()}`,
    };
    const updatedFacts = [newFact, ...localFacts];
    const updatedConfirmations = localConfirmations.filter((c) => c.id !== conf.id);
    saveLocalFacts(updatedFacts);
    saveLocalConfirmations(updatedConfirmations);
    queryClient.invalidateQueries({ queryKey: ['memoryFacts'] });
    queryClient.invalidateQueries({ queryKey: ['memoryConfirmations'] });
    toast.success('Fact approved and integrated into scheduling intelligence!', {
      description: `Learned: ${newFact.title}`,
    });
  };

  const handleRejectConfirmation = async (confId: string) => {
    soundFX.playTactileClick();
    try {
      const numericId = parseInt(confId, 10);
      if (!isNaN(numericId)) {
        await fetch(`/api/memory/confirmations/${numericId}/decline`, { method: 'POST' });
      }
    } catch (err) {
      console.warn('API error declining confirmation:', err);
    }
    const updated = localConfirmations.filter((c) => c.id !== confId);
    saveLocalConfirmations(updated);
    queryClient.invalidateQueries({ queryKey: ['memoryConfirmations'] });
    toast('Insight dismissed', {
      description: 'Cadence will not adapt behavior for this pattern.',
    });
  };

  const handleDeleteFact = async (factId: string) => {
    soundFX.playTactileClick();
    const fact = facts.find((f) => f.id === factId);
    try {
      const numericId = parseInt(factId, 10);
      if (!isNaN(numericId)) {
        await fetch(`/api/memory/facts/${numericId}`, { method: 'DELETE' });
      }
    } catch (err) {
      console.warn('API error deleting fact:', err);
    }
    const updated = localFacts.filter((f) => f.id !== factId);
    saveLocalFacts(updated);
    queryClient.invalidateQueries({ queryKey: ['memoryFacts'] });

    toast('Memory fact deleted', {
      description: `Removed "${fact?.title}"`,
      action: {
        label: 'Undo',
        onClick: async () => {
          if (fact) {
            saveLocalFacts([fact, ...updated]);
            try {
              await fetch('/api/memory/facts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  key: fact.key,
                  title: fact.title,
                  category: fact.category,
                  source: fact.source,
                  confidence: fact.confidence,
                  rule9Multiplier: fact.multiplier ?? null,
                  value: fact.value,
                }),
              });
              queryClient.invalidateQueries({ queryKey: ['memoryFacts'] });
            } catch {}
            soundFX.playTactileClick();
          }
        },
      },
    });
  };

  const handleToggleArchive = async (factId: string) => {
    soundFX.playTactileClick();
    const fact = facts.find((f) => f.id === factId);
    const newArchived = fact ? !fact.archived : false;
    try {
      const numericId = parseInt(factId, 10);
      if (!isNaN(numericId)) {
        await fetch(`/api/memory/facts/${numericId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: newArchived }),
        });
      }
    } catch (err) {
      console.warn('API error updating archive status:', err);
    }
    const updated = localFacts.map((f) =>
      f.id === factId ? { ...f, archived: !f.archived } : f,
    );
    saveLocalFacts(updated);
    queryClient.invalidateQueries({ queryKey: ['memoryFacts'] });
    toast.success('Fact status updated');
  };

  const handleCreateFact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    soundFX.playCompletion();
    const factKey = newKey.trim() || newTitle.toLowerCase().replace(/\s+/g, '_');
    const factPayload = {
      key: factKey,
      title: newTitle.trim(),
      category: newCategory,
      source: 'conversational' as const,
      confidence: 100,
      value: {
        userNote: newNote.trim(),
        createdByUser: true,
      },
    };

    try {
      await fetch('/api/memory/facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(factPayload),
      });
      queryClient.invalidateQueries({ queryKey: ['memoryFacts'] });
    } catch (err) {
      console.warn('API error creating fact, saved to local cache:', err);
    }

    const newFact: MemoryFact = {
      id: `fact-${Date.now()}`,
      ...factPayload,
      evidenceCount: 1,
      lastReinforcedAt: new Date().toISOString(),
      archived: false,
    };

    saveLocalFacts([newFact, ...localFacts]);
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
                Inspect, calibrate, and verify the structured patterns shaping your schedule (spec/agent-and-memory-subsystem.md §5).
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
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#0A84FF] flex items-center gap-2">
              <Sparkles className="size-4 text-[#0A84FF]" />
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
                className="p-4 sm:p-5 rounded-2xl bg-[#1C1C1E] border border-[#0A84FF]/30 shadow-lg relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4 animate-enter"
              >
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/30">
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
            { id: 'channel', label: 'Channels' },
            { id: 'procrastination', label: 'Procrastination' },
            { id: 'soft_commitment', label: 'Commitments' },
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
          <div className="col-span-full py-16 text-center rounded-2xl bg-[#1C1C1E]/50 border border-white/[0.06] p-8">
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
              className={`p-5 rounded-2xl bg-[#1C1C1E] border transition-all hover:border-white/[0.15] shadow-lg flex flex-col justify-between gap-4 ${
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
                      <span className="text-xs font-extrabold px-2.5 py-1 rounded-xl bg-[#0A84FF]/20 text-[#0A84FF] border border-[#0A84FF]/40 flex items-center gap-1">
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
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-enter">
          <div className="w-full sm:max-w-lg max-h-[92dvh] sm:max-h-[min(540px,calc(100dvh-2rem))] flex flex-col bg-[#141416] border-t sm:border border-white/[0.12] rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-black text-foreground overflow-hidden my-0 sm:my-auto">
            {/* Mobile Pull-Down Indicator Grab Bar */}
            <div className="sm:hidden mx-auto w-10 h-1 rounded-full bg-white/25 mt-2.5 mb-0.5 shrink-0" />
            <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-white/[0.08] bg-[#18181b] shrink-0">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Brain className="size-4 text-[#5E5CE6]" />
                <span>Record Custom Work Fact</span>
              </h3>
              <button
                onClick={() => setIsAddOpen(false)}
                className="grid size-7 place-items-center rounded-lg text-zinc-400 hover:bg-white/[0.08] hover:text-white transition-colors active:scale-95"
              >
                ✕
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
                  className="mt-1.5 h-9 w-full rounded-lg bg-[#18181b] border border-white/[0.08] px-3 text-xs text-white placeholder:text-zinc-500 focus:border-[#5E5CE6] focus:outline-none transition-colors"
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
                    className="mt-1.5 h-9 w-full rounded-lg bg-[#18181b] border border-white/[0.08] px-3 text-xs text-white placeholder:text-zinc-500 focus:border-[#5E5CE6] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-400">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as MemoryFact['category'])}
                    className="mt-1.5 h-9 w-full rounded-lg bg-[#18181b] border border-white/[0.08] px-2.5 text-xs text-white focus:border-[#5E5CE6] focus:outline-none transition-colors"
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
                  className="mt-1.5 w-full rounded-lg bg-[#18181b] border border-white/[0.08] p-3 text-xs text-white placeholder:text-zinc-500 focus:border-[#5E5CE6] focus:outline-none transition-colors resize-none leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="h-8 px-3 rounded-lg text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-8 px-4 rounded-lg bg-[#5E5CE6] hover:bg-[#5E5CE6]/90 text-white font-semibold text-xs shadow-sm transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <span>Save Fact</span>
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
