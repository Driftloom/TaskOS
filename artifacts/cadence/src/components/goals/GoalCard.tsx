import { AlertTriangle, CheckCircle2, Target } from 'lucide-react';
import type { Goal, GoalMetric } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { METRIC_LABELS } from './GoalEditor';

/**
 * Formats a metric value the way a person would say it.
 *
 * Exported because `MonthlyReviewDialog` consumes it for its summary rows.
 * Focus minutes are the only metric that benefits from unit shaping — "1,140"
 * is unreadable where "19h" is not. Everything else is a plain count.
 */
export function formatGoalMetric(
  metric: GoalMetric,
  actual: number,
  target: number,
): { formattedActual: string; formattedTarget: string } {
  if (metric !== 'focus_minutes') {
    return { formattedActual: String(actual), formattedTarget: String(target) };
  }
  const shape = (mins: number): string => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };
  return { formattedActual: shape(actual), formattedTarget: shape(target) };
}

interface GoalCardProps {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
}

/**
 * One monthly intention.
 *
 * Two display rules here are deliberate, not cosmetic:
 *
 * 1. A deleted scope shows an explanation, never a zero bar. A zero bar reads
 *    as "you achieved nothing", which is a different and false statement when
 *    the real cause is that the thing you were counting no longer exists.
 *
 * 2. On-pace is advisory and always sits beside the real number. It is derived
 *    from elapsed time, not behaviour, so someone who front-loaded their month
 *    is "behind pace" while already past their target. Nothing on this card may
 *    call a goal missed while the month is still running.
 */
export function GoalCard({ goal, onEdit, onDelete }: GoalCardProps) {
  const scopeDeleted = goal.scopeDeleted === true;
  const pct = Math.max(0, Math.min(100, Math.round(goal.progress)));
  const met = goal.actual >= goal.target;
  const pace = goal.onPace;

  const scopeText =
    goal.scopeKind === 'global'
      ? 'Everything'
      : goal.scopeLabel || (scopeDeleted ? 'Deleted project' : 'Scoped');

  return (
    <article
      className="rounded-xl border border-border-control bg-card p-4"
      data-testid={`goal-card-${goal.id}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-callout font-semibold text-foreground">{goal.title}</h3>
          <p className="text-micro text-secondary-foreground">
            {METRIC_LABELS[goal.metric]}
            <span aria-hidden="true"> &middot; </span>
            <span>{scopeText}</span>
            {goal.carriedFromId != null && (
              <>
                <span aria-hidden="true"> &middot; </span>
                <span>carried forward</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onEdit(goal)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(goal)}>
            Delete
          </Button>
        </div>
      </header>

      {scopeDeleted ? (
        <p
          className="mt-3 flex items-start gap-2 rounded-lg border border-border-control bg-muted p-3 text-caption text-foreground"
          data-testid="goal-scope-deleted"
        >
          <AlertTriangle className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            This goal was limited to {goal.scopeLabel ?? 'a project'} and that scope
            has been deleted, so it can no longer be measured. Editing the goal will
            let you re-scope it or make it measure everything.
          </span>
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-title3 font-semibold text-foreground">
              {goal.actual}
              <span className="text-caption text-secondary-foreground">
                {' '}
                / {goal.target}
              </span>
            </span>
            {met ? (
              <span className="flex items-center gap-1 text-caption font-semibold text-success-text">
                <CheckCircle2 aria-hidden="true" />
                <span>Target reached</span>
              </span>
            ) : (
              <span className="text-caption text-secondary-foreground">
                {pace
                  ? `On pace — about ${goal.expectedSoFar} expected by now`
                  : `Behind pace — about ${goal.expectedSoFar} expected by now`}
              </span>
            )}
          </div>
          <Progress value={pct} aria-label={`${goal.title} progress`} />
          <p className="text-micro text-secondary-foreground">
            <span>{goal.progress}%</span> complete
          </p>
        </div>
      )}

      {goal.status === 'open' && goal.actual >= goal.target && (
        <p className="mt-3 flex items-center gap-2 text-caption text-secondary-foreground">
          <Target aria-hidden="true" />
          This one is done. It will be sealed when the month closes.
        </p>
      )}
    </article>
  );
}