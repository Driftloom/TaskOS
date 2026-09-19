import { useState } from 'react';
import {
  Sun,
  Moon,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
  Inbox,
  Trash2,
  Clock,
  Flame,
  Star,
  Check,
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
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedNextUpId, setSelectedNextUpId] = useState<number | null>(null);
  const [reflection, setReflection] = useState('');

  const completedToday = tasks.filter((t) => t.status === 'completed');
  const incompleteToday = tasks.filter((t) => t.status === 'open');

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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md grid place-items-center p-4 animate-enter">
      <div className="w-full max-w-xl bg-[#1C1C1E] border border-white/[0.1] rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-3">
            <div
              className={`grid size-10 place-items-center rounded-2xl shadow-md ${
                type === 'morning'
                  ? 'bg-[#FF9F0A]/20 text-[#FF9F0A] border border-[#FF9F0A]/30'
                  : 'bg-[#5E5CE6]/20 text-[#5E5CE6] border border-[#5E5CE6]/30'
              }`}
            >
              {type === 'morning' ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight text-foreground">
                {type === 'morning' ? 'Plan My Day Ritual' : 'Close My Day Ritual'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {type === 'morning'
                  ? 'Give the day an intentional shape and commit to your #1 priority.'
                  : 'Review accomplishments, clean the ledger, and leave nothing hanging.'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="size-8 rounded-xl hover:bg-[#2C2C2E] grid place-items-center text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {/* Morning Ritual Flow */}
        {type === 'morning' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Star className="size-4 text-[#FF9F0A]" />
                Select Your #1 Next Up Focus Task
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                The single high-leverage task to tackle first when energy is highest.
              </p>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {incompleteToday.length === 0 ? (
                <div className="text-center py-8 rounded-2xl bg-[#262628] text-xs text-muted-foreground">
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
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                      selectedNextUpId === task.id
                        ? 'bg-[#FF9F0A]/15 border-[#FF9F0A] shadow-md'
                        : 'bg-[#262628] border-white/[0.06] hover:border-white/[0.15]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div
                        className={`size-4 rounded-full border grid place-items-center ${
                          selectedNextUpId === task.id
                            ? 'border-[#FF9F0A] bg-[#FF9F0A]'
                            : 'border-white/[0.2]'
                        }`}
                      >
                        {selectedNextUpId === task.id && <Check className="size-3 text-black stroke-[3]" />}
                      </div>
                      <span className="text-sm font-semibold text-foreground truncate">{task.title}</span>
                    </div>

                    {task.durationMin && (
                      <span className="text-xs font-mono text-muted-foreground shrink-0">
                        {task.durationMin}m
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-white/[0.06]">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-[#2C2C2E]"
              >
                Cancel
              </button>
              <button
                onClick={handleFinishMorning}
                className="px-6 py-2.5 rounded-xl bg-[#FF9F0A] hover:bg-[#FF9F0A]/90 text-black font-extrabold text-xs shadow-md transition-all active:scale-95 flex items-center gap-2"
              >
                Commit & Start Day
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        )}

        {/* Evening Close Ritual Flow */}
        {type === 'evening' && (
          <div className="space-y-5">
            {/* Step 1: Accomplishments */}
            <div className="p-4 rounded-2xl bg-[#262628] border border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#30D158] flex items-center gap-1.5">
                  <CheckCircle2 className="size-4" />
                  Today's Completed Wins ({completedToday.length})
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  {completedToday.reduce((acc, t) => acc + (t.durationMin || 0), 0)} min total
                </span>
              </div>

              <div className="max-h-32 overflow-y-auto space-y-1 pt-1">
                {completedToday.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No tasks completed yet today.</p>
                ) : (
                  completedToday.map((t) => (
                    <div key={t.id} className="text-xs text-foreground/80 flex items-center gap-2 truncate">
                      <span className="text-[#30D158]">✓</span>
                      <span className="truncate line-through text-muted-foreground">{t.title}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Incomplete Task Rollover Triage */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center justify-between">
                <span>Incomplete Tasks ({incompleteToday.length})</span>
                <span className="text-[11px] font-normal text-muted-foreground">Never leave items hanging</span>
              </h3>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {incompleteToday.length === 0 ? (
                  <div className="text-center py-6 rounded-2xl bg-[#262628] text-xs text-[#30D158] font-bold">
                    🎉 Inbox Zero! Everything scheduled for today is complete.
                  </div>
                ) : (
                  incompleteToday.map((task) => (
                    <div
                      key={task.id}
                      className="p-3 rounded-2xl bg-[#262628] border border-white/[0.06] flex items-center justify-between gap-2"
                    >
                      <span className="text-xs font-semibold text-foreground truncate max-w-[240px]">
                        {task.title}
                      </span>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleRolloverTomorrow(task.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#1C1C1E] hover:bg-[#323236] text-[11px] font-semibold text-foreground flex items-center gap-1 border border-white/[0.08]"
                          title="Move to Tomorrow 09:00"
                        >
                          <RotateCcw className="size-3 text-[#FF9F0A]" />
                          Tomorrow
                        </button>

                        <button
                          onClick={() => handleReturnToInbox(task.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#1C1C1E] hover:bg-[#323236] text-[11px] font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 border border-white/[0.08]"
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

            <div className="flex justify-end gap-3 pt-3 border-t border-white/[0.06]">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-[#2C2C2E]"
              >
                Close
              </button>
              <button
                onClick={handleFinishEvening}
                className="px-6 py-2.5 rounded-xl bg-[#30D158] hover:bg-[#30D158]/90 text-black font-extrabold text-xs shadow-md transition-all active:scale-95 flex items-center gap-2"
              >
                Complete Day Review
                <CheckCircle2 className="size-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default RitualDialog;
