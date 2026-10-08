import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListGoalsQueryKey,
  useCreateGoal,
  useGetGoalBaselines,
  useListProjects,
  useUpdateGoal,
  type Goal,
  type GoalMetric,
  type GoalScopeKind,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

/**
 * Metric copy is deliberately plain-language. "focus_minutes" is an identifier,
 * not something a person sets a goal with.
 */
const METRIC_LABELS: Record<GoalMetric, string> = {
  focus_minutes: 'Focus minutes',
  focus_sessions: 'Focus sessions',
  focus_days: 'Days with focus',
  tasks_completed: 'Tasks completed',
  tasks_completed_on_time: 'Tasks completed on time',
};

const METRIC_HINTS: Record<GoalMetric, string> = {
  focus_minutes: 'Total focused minutes this month.',
  focus_sessions: 'Number of completed focus sessions.',
  focus_days: 'Distinct days you focused at all. This is the habit metric.',
  tasks_completed: 'Tasks marked complete this month.',
  tasks_completed_on_time: 'Completed tasks finished on or before their due date.',
};

/**
 * Baselines exist so a target is chosen against reality. Proposing 600 focus
 * minutes to someone averaging 200 is noise, and a goal the user already knows
 * is unreachable stops being read.
 */
function BaselineHint({ metric }: { metric: GoalMetric }) {
  const baselines = useGetGoalBaselines();
  const entry = baselines.data?.[metric];
  if (baselines.isLoading || !entry) return null;
  const { trailing30dMonthlyEquivalent, trailing90dMonthlyEquivalent } = entry;
  return (
    <p className="text-micro text-secondary-foreground">
      Your recent pace:{' '}
      <span className="font-semibold text-foreground">{trailing30dMonthlyEquivalent}</span>{' '}
      per month over 30 days,{' '}
      <span className="font-semibold text-foreground">{trailing90dMonthlyEquivalent}</span>{' '}
      over 90 days.
    </p>
  );
}

interface GoalEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  /** Present when editing; omit to create. */
  goal?: Goal;
}

export function GoalEditor({ open, onOpenChange, month, goal }: GoalEditorProps) {
  const queryClient = useQueryClient();
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const projects = useListProjects();

  const [title, setTitle] = useState(goal?.title ?? '');
  const [metric, setMetric] = useState<GoalMetric>(goal?.metric ?? 'focus_minutes');
  const [target, setTarget] = useState(String(goal?.target ?? ''));
  const [scopeProjectId, setScopeProjectId] = useState<string>(
    goal?.scopeProjectId != null ? String(goal.scopeProjectId) : 'none',
  );

  const trimmedTitle = title.trim();
  const parsedTarget = Number(target);
  const canSubmit = useMemo(
    () =>
      trimmedTitle.length > 0 &&
      trimmedTitle.length <= 120 &&
      Number.isInteger(parsedTarget) &&
      parsedTarget >= 1,
    [trimmedTitle, parsedTarget],
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });

  const handleSubmit = () => {
    if (!canSubmit) return;
    const scopeKind: GoalScopeKind = scopeProjectId === 'none' ? 'global' : 'project';
    const payload = {
      title: trimmedTitle,
      month: goal?.month ?? month,
      metric,
      target: parsedTarget,
      scopeKind,
      scopeProjectId: scopeProjectId === 'none' ? null : Number(scopeProjectId),
    };
    if (goal) {
      updateGoal.mutate(
        { id: goal.id, data: payload },
        {
          onSuccess: () => {
            toast.success('Goal updated');
            invalidate();
            onOpenChange(false);
          },
          onError: () => toast.error('Could not update that goal'),
        },
      );
      return;
    }
    createGoal.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast.success('Goal added');
          invalidate();
          onOpenChange(false);
        },
        onError: () => toast.error('Could not add that goal'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="menu-surface dialog-surface">
        <DialogHeader>
          <DialogTitle className="text-headline">
            {goal ? 'Edit goal' : 'New monthly goal'}
          </DialogTitle>
          <DialogDescription className="text-caption text-secondary-foreground">
            Pick what you want to move, then set a target you can actually see
            yourself reaching. Everything else is measured for you.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="goal-title" className="text-caption font-semibold">
              What do you want this month to be about?
            </Label>
            <Input
              id="goal-title"
              value={title}
              maxLength={120}
              placeholder="Ship the reschedule engine"
              onChange={(e) => setTitle(e.target.value)}
            />
            {trimmedTitle.length >= 120 && (
              <p className="text-micro text-destructive-foreground">
                Title is at the 120 character limit.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-caption font-semibold">What will you measure?</Label>
            <Select value={metric} onValueChange={(v) => setMetric(v as GoalMetric)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(METRIC_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-micro text-secondary-foreground">{METRIC_HINTS[metric]}</p>
            <BaselineHint metric={metric} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="goal-target" className="text-caption font-semibold">
              Target for this month
            </Label>
            <Input
              id="goal-target"
              type="number"
              min={1}
              inputMode="numeric"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-caption font-semibold">Limit to a project?</Label>
            <Select value={scopeProjectId} onValueChange={setScopeProjectId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Everything</SelectItem>
                {(projects.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-micro text-secondary-foreground">
              Leave this on Everything to measure your whole month.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="min-h-overlay-action-h"
          >
            {goal ? 'Save' : 'Add goal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { METRIC_LABELS };