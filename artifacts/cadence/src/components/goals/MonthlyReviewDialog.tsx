import { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  RotateCw,
  Trophy,
  XCircle,
} from 'lucide-react';
import {
  getGetMonthlyReviewQueryKey,
  type Goal,
  useCarryGoal,
  useGetMonthlyReview,
} from '@workspace/api-client-react';
import { toast } from 'sonner';
import { soundFX } from '@/lib/sound-fx';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { formatGoalMetric } from './GoalCard';

interface MonthlyReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  onCarried?: () => void;
}

export function MonthlyReviewDialog({
  open,
  onOpenChange,
  month,
  onCarried,
}: MonthlyReviewDialogProps) {
  const { data: review, isLoading } = useGetMonthlyReview(
    { month },
    // `enabled: open` keeps the review query off the network until the dialog is
    // actually shown. The queryKey must be repeated here because this generated
    // hook requires it alongside `enabled`.
    { query: { enabled: open, queryKey: getGetMonthlyReviewQueryKey({ month }) } },
  );

  const carryGoalMutation = useCarryGoal();
  const [carriedGoalIds, setCarriedGoalIds] = useState<Set<number>>(new Set());

  const handleCarry = async (goal: Goal) => {
    try {
      await carryGoalMutation.mutateAsync({
        id: goal.id,
        data: {},
      });
      setCarriedGoalIds((prev) => new Set(prev).add(goal.id));
      soundFX.playCompletion();
      toast.success(`Carried "${goal.title}" forward to next month.`);
      onCarried?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to carry goal forward';
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-card border-border sm:rounded-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Trophy className="size-5 text-status-warning" />
            <DialogTitle className="text-title2 font-bold tracking-tight text-foreground">
              Monthly Review — {month}
            </DialogTitle>
          </div>
          <DialogDescription className="text-caption text-muted-foreground">
            A reflective snapshot of your focus intentions and telemetry outcomes for this month.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 text-center text-caption text-muted-foreground">
            Calculating month telemetry...
          </div>
        ) : !review || review.totalGoals === 0 ? (
          <div className="py-12 text-center text-caption text-muted-foreground">
            No goals were set for {month}.
          </div>
        ) : (
          <div className="space-y-5 overflow-y-auto pr-1 flex-1 py-2">
            {/* Summary Metrics Banner */}
            <div className="grid grid-cols-3 gap-3 rounded-2xl border border-border bg-secondary/30 p-4">
              <div className="space-y-1">
                <span className="text-caption text-muted-foreground font-medium">Completion</span>
                <p className="text-title1 font-bold text-foreground">
                  {review.completionRate}%
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-caption text-status-success font-medium flex items-center gap-1">
                  <CheckCircle2 className="size-3.5" /> Achieved
                </span>
                <p className="text-title1 font-bold text-status-success">
                  {review.achievedGoals} / {review.totalGoals}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-caption text-muted-foreground font-medium flex items-center gap-1">
                  <Clock className="size-3.5" /> Missed
                </span>
                <p className="text-title1 font-bold text-muted-foreground">
                  {review.missedGoals}
                </p>
              </div>
            </div>

            {/* Goals List */}
            <div className="space-y-3">
              <h4 className="text-caption font-semibold uppercase font-mono text-muted-foreground">
                Goals Breakdown ({review.goals.length})
              </h4>

              <div className="space-y-2.5">
                {review.goals.map((goal) => {
                  const metricInfo = formatGoalMetric(
                    goal.metric,
                    goal.actual,
                    goal.target,
                  );
                  const isAchieved = goal.actual >= goal.target;
                  const isCarried = carriedGoalIds.has(goal.id);

                  return (
                    <div
                      key={goal.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5 transition-colors"
                    >
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-body font-semibold text-foreground truncate">
                            {goal.title}
                          </span>
                          {isAchieved ? (
                            <Badge className="bg-status-success/20 text-status-success border-status-success/30 text-caption font-medium">
                              Achieved
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground text-caption">
                              Incomplete
                            </Badge>
                          )}
                        </div>

                        <div className="text-caption text-muted-foreground">
                          {metricInfo.formattedActual} of {metricInfo.formattedTarget}{' '}
                          ({goal.progress}%) • {goal.scopeKind}
                        </div>
                      </div>

                      {/* Carry Forward action for incomplete goals (§5.2) */}
                      {!isAchieved && (
                        <div className="shrink-0">
                          {isCarried ? (
                            <span className="text-caption font-medium text-status-success flex items-center gap-1">
                              <CheckCircle2 className="size-3.5" /> Carried Forward
                            </span>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCarry(goal as Goal)}
                              disabled={carryGoalMutation.isPending}
                              className="h-8 text-caption gap-1.5"
                            >
                              <RotateCw className="size-3.5" />
                              Carry Over
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="pt-2 border-t border-border">
          <Button onClick={() => onOpenChange(false)}>Close Review</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
