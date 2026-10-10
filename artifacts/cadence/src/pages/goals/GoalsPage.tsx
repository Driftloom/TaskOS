import { useMemo, useState } from 'react';
import { Plus, Target, Trophy } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListGoalsQueryKey,
  useDeleteGoal,
  useListGoals,
  type Goal,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { soundFX } from '@/lib/sound-fx';
import { GoalCard } from '@/components/goals/GoalCard';
import { GoalEditor } from '@/components/goals/GoalEditor';
import { MonthlyReviewDialog } from '@/components/goals/MonthlyReviewDialog';
import { ErrorState, SectionHeading, SkeletonList } from '@/components/shared/StateViews';

const MONTH_PATTERN = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(isoMonth: string, delta: number): string {
  const [y, m] = isoMonth.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function GoalsPage() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [editorOpen, setEditorOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | undefined>(undefined);

  const { data, isLoading, isError, refetch } = useListGoals({ month });
  const deleteGoal = useDeleteGoal();

  const goals = useMemo(() => data ?? [], [data]);

  const handleDelete = (goal: Goal) => {
    deleteGoal.mutate(
      { id: goal.id },
      {
        onSuccess: () => {
          toast.success('Goal removed');
          queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
        },
        onError: () => toast.error('Could not remove that goal'),
      },
    );
  };

  const openCreate = () => {
    setEditing(undefined);
    setEditorOpen(true);
  };

  const openEdit = (goal: Goal) => {
    setEditing(goal);
    setEditorOpen(true);
  };

  return (
    <div className="app-canvas mx-auto flex w-full max-w-app-canvas flex-col gap-6 px-5 py-6">
      <SectionHeading
        eyebrow={month}
        title="Monthly Goals"
        detail="A few intentions, measured from what you actually did. Nothing to log."
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setReviewOpen(true)}>
              Review Month
            </Button>
            <Button onClick={openCreate}>
              <Plus aria-hidden="true" /> New Goal
            </Button>
          </div>
        }
      />

      <div className="flex items-end gap-2">
        <Button variant="ghost" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
          Previous
        </Button>
        <div className="flex flex-col gap-1">
          <Label htmlFor="goals-month" className="text-micro text-secondary-foreground">
            Month
          </Label>
          <Input
            id="goals-month"
            value={month}
            maxLength={7}
            onChange={(e) => {
              const v = e.target.value;
              if (MONTH_PATTERN.test(v)) setMonth(v);
            }}
            className="w-32 sm:w-40"
          />
        </div>
        <Button variant="ghost" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
          Next
        </Button>
      </div>

      {isLoading && <SkeletonList />}
      {isError && <ErrorState onRetry={() => void refetch()} />}

      {!isLoading && !isError && goals.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border-control bg-card p-8 text-center">
          <Target aria-hidden="true" className="text-macro text-secondary-foreground" />
          <p className="text-callout font-semibold text-foreground">
            Nothing set for {month}
          </p>
          <p className="text-caption text-secondary-foreground">
            Add one intention. You will see how it goes without having to log a
            thing.
          </p>
          <Button onClick={openCreate}>Add your first goal</Button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {goals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>

      <GoalEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        month={month}
        goal={editing}
      />

      <MonthlyReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        month={month}
        onCarried={() =>
          queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() })
        }
      />
    </div>
  );
}