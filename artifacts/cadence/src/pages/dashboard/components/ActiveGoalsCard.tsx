import { Link } from 'wouter';
import { AlertTriangle, ArrowRight, Milestone, RotateCcw, Target } from 'lucide-react';
import type { Goal } from '@workspace/api-client-react';
import { soundFX } from '@/lib/sound-fx';

interface ActiveGoalsCardProps {
  goals: Goal[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function ActiveGoalsCard({
  goals,
  isLoading,
  isError = false,
  onRetry,
}: ActiveGoalsCardProps) {
  const count = goals.length;
  const previewGoals = goals.slice(0, 3);
  const unknown = isLoading || isError;

  return (
    <section
      aria-labelledby="active-goals-heading"
      data-testid="card-dashboard-goals"
      className="flex flex-col justify-between rounded-2xl border border-border-control bg-card p-5 shadow-lg"
    >
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-border-control/40">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-control bg-primary/15 text-primary-text">
              <Milestone size={15} aria-hidden="true" />
            </span>
            <h2
              id="active-goals-heading"
              className="font-mono text-caption uppercase tracking-wider text-muted-foreground font-bold"
            >
              Monthly Goals
            </h2>
          </div>

          <span className="font-mono text-caption text-muted-foreground">
            {unknown ? '— goals' : `${count} ${count === 1 ? 'goal' : 'goals'}`}
          </span>
        </div>

        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-2">
              <div className="h-10 animate-pulse rounded-lg bg-muted/50" />
              <div className="h-10 animate-pulse rounded-lg bg-muted/50" />
            </div>
          ) : isError ? (
            // A failed goals query is "we don't know", not "you set no goals".
            <div className="py-5 text-center" data-testid="dashboard-goals-error">
              <AlertTriangle size={22} className="mx-auto mb-2 text-status-warning-text" aria-hidden="true" />
              <p className="text-callout font-semibold text-foreground">Goals couldn't load</p>
              <p className="mt-1 text-caption text-muted-foreground">
                We don't know what is tracked this month. Check your connection and try again.
              </p>
              {onRetry ? (
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    onRetry();
                  }}
                  className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-control border border-border-control bg-card px-3 text-caption font-bold text-foreground hover:bg-muted active:scale-98 tap-target-expand"
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  Retry
                </button>
              ) : null}
            </div>
          ) : count === 0 ? (
            <div className="py-6 text-center">
              <Target size={24} className="mx-auto text-muted-foreground mb-2" aria-hidden="true" />
              <p className="text-callout font-semibold text-foreground">No Monthly Goals</p>
              <p className="mt-1 text-caption text-muted-foreground">
                Set milestones for this month to guide your weekly focus.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {previewGoals.map((goal) => {
                // Never invent a denominator: a goal without a target shows
                // only what actually happened.
                const target = goal.target ?? 0;
                const actual = goal.actual ?? 0;
                const progressPct = Math.max(0, Math.min(100, Math.round(goal.progress ?? (target > 0 ? (actual / target) * 100 : 0))));

                return (
                  <li key={goal.id} className="rounded-lg border border-border-control/40 bg-muted/30 p-2.5">
                    <div className="flex items-center justify-between text-callout font-semibold text-foreground mb-1.5">
                      <span className="truncate">{goal.title}</span>
                      <span className="font-mono text-caption text-muted-foreground ml-2 shrink-0">
                        {target > 0 ? `${actual}/${target} (${progressPct}%)` : `${actual} done`}
                      </span>
                    </div>

                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border-control/60">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-base"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
              {count > 3 && (
                <li className="text-center font-mono text-caption text-muted-foreground pt-1">
                  +{count - 3} more active goals
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-border-control/40">
        <Link
          href="/goals"
          onClick={() => soundFX.playClick()}
          data-testid="link-dashboard-goals"
          className="inline-flex w-full tap-target-h items-center justify-between rounded-control border border-border-control bg-card px-3 text-caption font-bold text-foreground transition-colors hover:bg-muted active:scale-98"
        >
          <span>Manage Goals</span>
          <ArrowRight size={14} className="text-muted-foreground" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
