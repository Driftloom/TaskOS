import { CheckCircle2, Clock, Flame, Play, Target, Volume2 } from 'lucide-react';
import { ActivityRings } from '@/components/shared/ActivityRings';
import { soundFX } from '@/lib/sound-fx';

interface MomentumCommandCardProps {
  tasksCompleted: number;
  tasksTotal: number;
  roundsCompleted: number;
  roundTarget: number;
  streakDays: number;
  focusMinutes: number;
  openTasks: number;
  isLoading?: boolean;
}

export function MomentumCommandCard({
  tasksCompleted,
  tasksTotal,
  roundsCompleted,
  roundTarget,
  streakDays,
  focusMinutes,
  openTasks,
  isLoading = false,
}: MomentumCommandCardProps) {
  const value = (n: number) => (isLoading ? '—' : n);
  const handleTestChime = () => {
    soundFX.playCompletion();
  };

  return (
    <section
      aria-labelledby="momentum-overview-heading"
      data-testid="card-dashboard-momentum"
      className="relative flex flex-col justify-between rounded-2xl border border-border-control bg-card p-4 sm:p-6 shadow-xl"
    >
      <div>
        <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-border-control/40 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="grid size-8 place-items-center rounded-control bg-primary/15 text-primary-text font-bold shrink-0">
              <Flame size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2
                id="momentum-overview-heading"
                className="font-mono text-caption uppercase tracking-wider text-muted-foreground font-bold truncate"
              >
                Daily Momentum
              </h2>
              <p className="text-callout font-bold text-foreground truncate">
                {isLoading
                  ? 'Loading momentum…'
                  : streakDays > 0
                    ? `${streakDays}-day streak`
                    : 'Start your streak'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 sm:px-2.5 sm:py-1 font-mono text-caption font-semibold uppercase tracking-wider text-primary-text">
              Strict · No freeze
            </span>
            <button
              type="button"
              onClick={handleTestChime}
              title="Test completion chime"
              aria-label="Test completion chime"
              className="grid size-8 place-items-center rounded-control border border-border-control bg-muted/60 text-muted-foreground transition-colors hover:text-foreground active:scale-95 tap-target-expand"
            >
              <Volume2 size={15} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
          <div className="shrink-0">
            {isLoading ? (
              <div className="size-[120px] animate-pulse rounded-full bg-muted/50" aria-hidden="true" />
            ) : (
              <ActivityRings
                tasksCompleted={tasksCompleted}
                tasksTotal={tasksTotal}
                roundsCompleted={roundsCompleted}
                roundTarget={roundTarget}
                streakDays={streakDays}
                size={120}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 w-full">
            <div className="rounded-xl border border-border-control/60 bg-muted/40 p-2.5 sm:p-3 min-w-0">
              <div className="flex items-center gap-1.5 text-status-success-text mb-1">
                <CheckCircle2 size={14} aria-hidden="true" />
                <span className="font-mono text-caption uppercase tracking-wider font-semibold">Done</span>
              </div>
              <p className="font-mono text-title3 sm:text-title2 font-bold tabular-nums text-foreground truncate">
                {value(tasksCompleted)}{' '}
                <span className="font-mono text-footnote sm:text-callout font-normal text-muted-foreground">/ {value(tasksTotal)}</span>
              </p>
              <p className="text-micro sm:text-caption text-muted-foreground mt-0.5 truncate">Tasks completed</p>
            </div>

            <div className="rounded-xl border border-border-control/60 bg-muted/40 p-2.5 sm:p-3 min-w-0">
              <div className="flex items-center gap-1.5 text-primary-text mb-1">
                <Target size={14} aria-hidden="true" />
                <span className="font-mono text-caption uppercase tracking-wider font-semibold">Open</span>
              </div>
              <p className="font-mono text-title3 sm:text-title2 font-bold tabular-nums text-foreground truncate">{value(openTasks)}</p>
              <p className="text-micro sm:text-caption text-muted-foreground mt-0.5 truncate">Awaiting focus</p>
            </div>

            <div className="rounded-xl border border-border-control/60 bg-muted/40 p-2.5 sm:p-3 min-w-0">
              <div className="flex items-center gap-1.5 text-accent mb-1">
                <Clock size={14} aria-hidden="true" />
                <span className="font-mono text-caption uppercase tracking-wider font-semibold">Time</span>
              </div>
              <p className="font-mono text-title3 sm:text-title2 font-bold tabular-nums text-foreground truncate">
                {isLoading ? '—' : `${focusMinutes}m`}
              </p>
              <p className="text-micro sm:text-caption text-muted-foreground mt-0.5 truncate">Focus logged</p>
            </div>

            <div className="rounded-xl border border-border-control/60 bg-muted/40 p-2.5 sm:p-3 min-w-0">
              <div className="flex items-center gap-1.5 text-status-warning-text mb-1">
                <Play size={14} aria-hidden="true" />
                <span className="font-mono text-caption uppercase tracking-wider font-semibold">Rounds</span>
              </div>
              <p className="font-mono text-title3 sm:text-title2 font-bold tabular-nums text-foreground truncate">
                {value(roundsCompleted)}{' '}
                <span className="font-mono text-footnote sm:text-callout font-normal text-muted-foreground">/ {value(roundTarget)}</span>
              </p>
              <p className="text-micro sm:text-caption text-muted-foreground mt-0.5 truncate">Focus targets</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 sm:mt-6 flex flex-col xs:flex-row items-start xs:items-center justify-between gap-1 border-t border-border-control/40 pt-3 sm:pt-4 font-mono text-caption text-muted-foreground">
        <span>Outer: Tasks · Inner: Focus Rounds</span>
        <span className="text-primary-text font-semibold">Compounding daily</span>
      </div>
    </section>
  );
}
