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
}

export function MomentumCommandCard({
  tasksCompleted,
  tasksTotal,
  roundsCompleted,
  roundTarget,
  streakDays,
  focusMinutes,
  openTasks,
}: MomentumCommandCardProps) {
  const handleTestChime = () => {
    soundFX.playCompletion();
  };

  return (
    <section
      aria-labelledby="momentum-overview-heading"
      data-testid="card-dashboard-momentum"
      className="relative flex flex-col justify-between rounded-2xl border border-border-control bg-card p-6 shadow-xl"
    >
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-border-control/40">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-control bg-primary/15 text-primary-text font-bold">
              <Flame size={18} aria-hidden="true" />
            </span>
            <div>
              <h2
                id="momentum-overview-heading"
                className="font-mono text-caption uppercase tracking-wider text-muted-foreground font-bold"
              >
                Daily Momentum
              </h2>
              <p className="text-callout font-bold text-foreground">
                {streakDays > 0 ? `${streakDays}-day streak` : 'Start your streak'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-caption font-semibold uppercase tracking-wider text-primary-text">
              Strict · No freeze
            </span>
            <button
              type="button"
              onClick={handleTestChime}
              title="Test completion chime"
              aria-label="Test completion chime"
              className="grid size-8 place-items-center rounded-control border border-border-control bg-muted/60 text-muted-foreground transition-colors hover:text-foreground active:scale-95"
            >
              <Volume2 size={15} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row items-center gap-6">
          <div className="shrink-0">
            <ActivityRings
              tasksCompleted={tasksCompleted}
              tasksTotal={tasksTotal}
              roundsCompleted={roundsCompleted}
              roundTarget={roundTarget}
              streakDays={streakDays}
              size={120}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 w-full">
            <div className="rounded-xl border border-border-control/60 bg-muted/40 p-3">
              <div className="flex items-center gap-1.5 text-status-success-text mb-1">
                <CheckCircle2 size={14} aria-hidden="true" />
                <span className="font-mono text-caption uppercase tracking-wider font-semibold">Done</span>
              </div>
              <p className="text-title3 font-bold text-foreground">
                {tasksCompleted} <span className="text-callout font-normal text-muted-foreground">/ {tasksTotal}</span>
              </p>
              <p className="text-caption text-muted-foreground mt-0.5">Tasks completed</p>
            </div>

            <div className="rounded-xl border border-border-control/60 bg-muted/40 p-3">
              <div className="flex items-center gap-1.5 text-primary-text mb-1">
                <Target size={14} aria-hidden="true" />
                <span className="font-mono text-caption uppercase tracking-wider font-semibold">Open</span>
              </div>
              <p className="text-title3 font-bold text-foreground">{openTasks}</p>
              <p className="text-caption text-muted-foreground mt-0.5">Awaiting focus</p>
            </div>

            <div className="rounded-xl border border-border-control/60 bg-muted/40 p-3">
              <div className="flex items-center gap-1.5 text-accent mb-1">
                <Clock size={14} aria-hidden="true" />
                <span className="font-mono text-caption uppercase tracking-wider font-semibold">Time</span>
              </div>
              <p className="text-title3 font-bold text-foreground">{focusMinutes}m</p>
              <p className="text-caption text-muted-foreground mt-0.5">Focus logged</p>
            </div>

            <div className="rounded-xl border border-border-control/60 bg-muted/40 p-3">
              <div className="flex items-center gap-1.5 text-status-warning-text mb-1">
                <Play size={14} aria-hidden="true" />
                <span className="font-mono text-caption uppercase tracking-wider font-semibold">Rounds</span>
              </div>
              <p className="text-title3 font-bold text-foreground">
                {roundsCompleted} <span className="text-callout font-normal text-muted-foreground">/ {roundTarget}</span>
              </p>
              <p className="text-caption text-muted-foreground mt-0.5">Focus targets</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-border-control/40 pt-4 font-mono text-caption text-muted-foreground">
        <span>Outer: Tasks · Inner: Focus Rounds</span>
        <span className="text-primary-text font-semibold">Compounding daily</span>
      </div>
    </section>
  );
}
