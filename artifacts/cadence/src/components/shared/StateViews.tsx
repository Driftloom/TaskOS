import { type ReactNode } from 'react';
import { Inbox, RotateCcw, Sparkles } from 'lucide-react';
import { soundFX } from '@/lib/sound-fx';

export function SectionHeading({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground font-semibold">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {detail && <p className="mt-0.5 text-xs text-muted-foreground font-medium">{detail}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function SkeletonList() {
  return (
    <div className="space-y-2.5" data-testid="loading-tasks">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-16 animate-pulse rounded-xl border border-border-control bg-card/[0.02]"
        />
      ))}
    </div>
  );
}

export function EmptyState({
  inbox = false,
  onAction,
}: {
  inbox?: boolean;
  onAction?: () => void;
}) {
  return (
    <div
      className="rounded-xl border border-dashed border-border-control bg-muted/50 px-6 py-10 text-center transition-all"
      data-testid={inbox ? 'empty-inbox' : 'empty-tasks'}
    >
      <div className="mx-auto grid size-9 place-items-center rounded-lg border border-border-control bg-card/[0.03] text-muted-foreground">
        {inbox ? <Inbox size={18} /> : <Sparkles size={18} />}
      </div>
      <h3 className="mt-3 text-sm font-semibold text-foreground">
        {inbox ? 'Inbox is clear' : 'A clean slate'}
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
        {inbox
          ? 'Loose thoughts and unscheduled captures live here until you assign them a place in the day.'
          : 'Capture one deliberate thing to give the day a clear direction.'}
      </p>
      {onAction && (
        <button
          onClick={() => {
            soundFX.playClick();
            onAction();
          }}
          className="mt-4 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border-control bg-card/[0.04] px-3.5 text-xs font-medium text-foreground hover:border-border-control4] hover:bg-card/[0.08] hover:text-foreground transition-all active:scale-[0.98] tap-target-expand"
        >
          <span>Capture task</span>
          <kbd className="rounded border border-border-control bg-card/[0.04] px-1 py-0.2 font-mono text-xs text-muted-foreground">
            N
          </kbd>
        </button>
      )}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="rounded-2xl border border-destructive/30 bg-destructive/[.07] p-8 text-center"
      data-testid="status-error"
    >
      <p className="font-semibold text-foreground">The workspace could not load.</p>
      <p className="mt-1 text-sm text-muted-foreground">Your data is safe. Try reconnecting to sync.</p>
      <button
        onClick={() => {
          soundFX.playClick();
          onRetry();
        }}
        data-testid="button-retry"
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-5 text-sm font-bold text-foreground hover:bg-muted"
      >
        <RotateCcw size={15} /> Try again
      </button>
    </div>
  );
}
