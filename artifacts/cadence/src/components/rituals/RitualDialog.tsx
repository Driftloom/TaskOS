import { useState, useEffect } from 'react';
import {
  Sun,
  Moon,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
  Inbox,
  Clock,
  Flame,
  Star,
  Check,
  X,
} from 'lucide-react';
import { soundFX } from '@/lib/sound-fx';
import { toast } from 'sonner';
import type { Task } from '@workspace/api-client-react';

interface RitualDialogProps {
  type: 'morning' | 'evening';
  tasks: Task[];
  onClose: () => void;
  onUpdateTask: (taskId: number, updates: { dueAt?: string | null; status?: 'inbox' | 'open' }) => void;
  onSelectNextUp?: (taskId: number) => void;
}

export function RitualDialog({
  type,
  tasks,
  onClose,
  onUpdateTask,
  onSelectNextUp,
}: RitualDialogProps) {
  const [selectedNextUpId, setSelectedNextUpId] = useState<number | null>(null);

  const completedToday = tasks.filter((t) => t.status === 'completed');
  const incompleteToday = tasks.filter((t) => t.status === 'open');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [onClose]);

  const handleFinishMorning = () => {
    soundFX.playFocusStart();
    if (selectedNextUpId && onSelectNextUp) {
      onSelectNextUp(selectedNextUpId);
    }
    toast.success('Morning plan locked in!', {
      description: 'Your #1 focus priority has been set on Today.',
    });
    onClose();
  };

  const handleRolloverTomorrow = (taskId: number) => {
    soundFX.playTactileClick();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    onUpdateTask(taskId, { dueAt: tomorrow.toISOString(), status: 'open' });
    toast.success('Rolled over to tomorrow at 09:00');
  };

  const handleReturnToInbox = (taskId: number) => {
    soundFX.playTactileClick();
    onUpdateTask(taskId, { dueAt: null, status: 'inbox' });
    toast('Returned task to Inbox');
  };

  const handleFinishEvening = () => {
    soundFX.playCelebration();
    toast.success('Day closed with clarity!', {
      description: 'Incomplete tasks addressed. Rest up for tomorrow.',
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/90 backdrop-blur-md overflow-y-auto animate-enter"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-xl max-h-[92dvh] sm:max-h-[min(600px,calc(100dvh-2rem))] flex flex-col rounded-t-2xl sm:rounded-2xl border-t sm:border border-white/[0.12] bg-[#141416] shadow-2xl shadow-black text-foreground transition-all overflow-hidden my-0 sm:my-auto"
      >
        {/* Mobile Pull-Down Indicator Grab Bar */}
        <div className="sm:hidden mx-auto w-10 h-1 rounded-full bg-white/25 mt-2.5 mb-0.5 shrink-0" />

        {/* Fixed Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-white/[0.08] bg-[#18181b] shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`grid size-9 place-items-center rounded-xl shadow-sm ${
                type === 'morning'
                  ? 'bg-[#0A84FF]/20 text-[#0A84FF] border border-[#0A84FF]/30'
                  : 'bg-[#5E5CE6]/20 text-[#5E5CE6] border border-[#5E5CE6]/30'
              }`}
            >
              {type === 'morning' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-white">
                {type === 'morning' ? 'Plan My Day' : 'Close My Day'}
              </h2>
              <p className="text-[11px] text-zinc-400">
                {type === 'morning'
                  ? 'Set your intentional shape and commit to your #1 priority.'
                  : 'Review accomplishments, clean the ledger, and leave nothing hanging.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <kbd className="hidden sm:inline-block rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
              Esc
            </kbd>
            <button
              onClick={onClose}
              className="grid size-7 place-items-center rounded-lg text-zinc-400 hover:bg-white/[0.08] hover:text-white transition-colors active:scale-95"
              aria-label="Close dialog"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5 custom-scrollbar">
          {/* Morning Ritual Flow */}
          {type === 'morning' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Star className="size-3.5 text-[#0A84FF]" />
                  <span>Select Your #1 Next Up Focus Task</span>
                </h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  The single high-leverage task to tackle first when energy is highest.
                </p>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {incompleteToday.length === 0 ? (
                  <div className="text-center py-8 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs text-zinc-500">
                    No tasks due today. Add tasks from Inbox to plan your day.
                  </div>
                ) : (
                  incompleteToday.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => {
                        soundFX.playTactileClick();
                        setSelectedNextUpId(task.id);
                      }}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                        selectedNextUpId === task.id
                          ? 'bg-[#0A84FF]/15 border-[#0A84FF]/60 shadow-sm'
                          : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <div
                          className={`size-4 rounded-full border grid place-items-center ${
                            selectedNextUpId === task.id
                              ? 'border-[#0A84FF] bg-[#0A84FF]'
                              : 'border-white/[0.2]'
                          }`}
                        >
                          {selectedNextUpId === task.id && <Check className="size-3 text-white stroke-[3]" />}
                        </div>
                        <span className="text-xs font-medium text-zinc-100 truncate">{task.title}</span>
                      </div>

                      {task.durationMin && (
                        <span className="text-[11px] font-mono text-zinc-500 shrink-0">
                          {task.durationMin}m
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Evening Close Ritual Flow */}
          {type === 'evening' && (
            <div className="space-y-4">
              {/* Step 1: Accomplishments */}
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#30D158] flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5" />
                    Today's Completed Wins ({completedToday.length})
                  </span>
                  <span className="text-[11px] font-mono text-zinc-500">
                    {completedToday.reduce((acc, t) => acc + (t.durationMin || 0), 0)} min total
                  </span>
                </div>

                <div className="max-h-32 overflow-y-auto space-y-1 pt-1">
                  {completedToday.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic">No tasks completed yet today.</p>
                  ) : (
                    completedToday.map((t) => (
                      <div key={t.id} className="text-xs text-zinc-300 flex items-center gap-2 truncate">
                        <span className="text-[#30D158]">✓</span>
                        <span className="truncate line-through text-zinc-500">{t.title}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Incomplete Task Rollover Triage */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-zinc-300">
                    Incomplete Tasks ({incompleteToday.length})
                  </h3>
                  <span className="text-[10px] text-zinc-500">Never leave items hanging</span>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {incompleteToday.length === 0 ? (
                    <div className="text-center py-6 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs text-[#30D158] font-semibold">
                      🎉 Inbox Zero! Everything scheduled for today is complete.
                    </div>
                  ) : (
                    incompleteToday.map((task) => (
                      <div
                        key={task.id}
                        className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between gap-2"
                      >
                        <span className="text-xs font-medium text-zinc-200 truncate max-w-[240px]">
                          {task.title}
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleRolloverTomorrow(task.id)}
                            className="px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-[11px] font-medium text-zinc-200 flex items-center gap-1 border border-white/[0.08] transition-colors"
                            title="Move to Tomorrow 09:00"
                          >
                            <RotateCcw className="size-3 text-[#0A84FF]" />
                            Tomorrow
                          </button>

                          <button
                            onClick={() => handleReturnToInbox(task.id)}
                            className="px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-[11px] font-medium text-zinc-400 hover:text-zinc-200 flex items-center gap-1 border border-white/[0.08] transition-colors"
                            title="Return to Inbox"
                          >
                            <Inbox className="size-3" />
                            Inbox
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Fixed Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-3.5 border-t border-white/[0.08] bg-[#18181b] shrink-0 pb-safe sm:pb-3.5">
          <button
            onClick={onClose}
            className="h-8 rounded-lg px-3 text-xs font-medium text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200 transition-colors active:scale-95"
          >
            Cancel
          </button>
          {type === 'morning' ? (
            <button
              onClick={handleFinishMorning}
              className="h-8 px-4 rounded-lg bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white font-bold text-xs shadow-sm transition-all active:scale-95 flex items-center gap-1.5"
            >
              <span>Commit & Start Day</span>
              <ArrowRight className="size-3.5" />
            </button>
          ) : (
            <button
              onClick={handleFinishEvening}
              className="h-8 px-4 rounded-lg bg-[#30D158] hover:bg-[#30D158]/90 text-black font-bold text-xs shadow-sm transition-all active:scale-95 flex items-center gap-1.5"
            >
              <span>Complete Day Review</span>
              <CheckCircle2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default RitualDialog;
