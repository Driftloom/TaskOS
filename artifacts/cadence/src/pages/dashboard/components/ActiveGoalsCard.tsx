import { Link } from 'wouter';
import { AlertTriangle, ArrowRight, CheckCircle2, Milestone, RotateCcw, Target } from 'lucide-react';
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
      className="flex flex-col justify-between rounded-2xl border border-border-control/70 bg-card p-4 sm:p-5 shadow-lg overflow-hidden"
    >
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-border-control/40 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="grid size-7 place-items-center rounded-control bg-ai/15 text-ai-text shrink-0">
              <Milestone size={15} aria-hidden="true" />
            </span>
            <h2
              id="active-goals-heading"
              className="font-mono text-caption uppercase tracking-wider text-muted-foreground font-bold truncate"
            >
              Monthly Goals
            </h2>
          </div>

          <span className="font-mono tabular-nums text-caption text-muted-foreground shrink-0">
            {unknown ? '— goals' : `${count} ${count === 1 ? 'goal' : 'goals'}`}
          </span>
        </div>

        <div className="mt-3.5 sm:mt-4">
          {isLoading ? (
            <div className="space-y-2">
              <div className="h-11 animate-pulse rounded-lg bg-muted/50" />
              <div className="h-11 animate-pulse rounded-lg bg-muted/50" />
            </div>
          ) : isError ? (
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
              <Target size={24} className="mx-auto text-muted-foreground mb-2 opacity-60" aria-hidden="true" />
              <p className="text-callout font-semibold text-foreground">No Monthly Goals</p>
              <p className="mt-1 text-caption text-muted-foreground">
                Set milestones for this month to guide your weekly focus.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {previewGoals.map((goal) => {
                const target = goal.target ?? 0;
                const actual = goal.actual ?? 0;
                const progressPct = Math.max(
                  0,
                  Math.min(100, Math.round(goal.progress ?? (target > 0 ? (actual / target) * 100 : 0))),
                );

                return (
                  <li key={goal.id} className="rounded-xl border border-border-control/50 bg-muted/25 p-2.5 transition-all hover:bg-muted/40 hover:border-border-control">
                    <div className="flex items-center justify-between text-callout font-semibold text-foreground mb-1.5 min-w-0 gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="truncate min-w-0">{goal.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {goal.onPace !== undefined && (
                          <span
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-micro font-bold uppercase ${
                              goal.onPace
                                ? 'bg-status-success/15 text-status-success-text'
                                : 'bg-status-warning/15 text-status-warning-text'
                            }`}
                          >
                            {goal.onPace ? (
                              <>
                                <CheckCircle2 size={10} aria-hidden="true" />
                                On Pace
                              </>
                            ) : (
                              <>
                                <AlertTriangle size={10} aria-hidden="true" />
                                Lagging
                              </>
                            )}
                          </span>
                        )}
                        <span className="font-mono tabular-nums text-caption text-muted-foreground">
                          {target > 0 ? `${actual}/${target} (${progressPct}%)` : `${actual} done`}
                        </span>
                      </div>
                    </div>

                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border-control/50">
                      <div
                        className={`h-full rounded-full transition-all duration-base ${
                          progressPct >= 100
                            ? 'bg-status-success'
                            : goal.onPace === false
                              ? 'bg-status-warning'
                              : 'bg-primary'
                        }`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
              {count > 3 && (
                <li className="text-center font-mono tabular-nums text-caption text-muted-foreground pt-1">
                  +{count - 3} more active goals
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-3.5 sm:mt-4 pt-3 border-t border-border-control/40">
        <Link
          href="/review"
          onClick={() => soundFX.playClick()}
          data-testid="link-dashboard-goals"
          className="inline-flex w-full tap-target-h items-center justify-between rounded-control border border-border-control bg-card px-3 text-caption font-bold text-foreground transition-colors hover:bg-muted active:scale-98"
        >
          <span>Open Goals & Rituals</span>
          <ArrowRight size={14} className="text-muted-foreground" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
