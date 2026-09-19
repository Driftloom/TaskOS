import { type ReactNode } from 'react';
import { Inbox, RotateCcw, Sparkles } from 'lucide-react';
import { soundFX } from '@/lib/sound-fx';

export function SectionHeading({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow: string;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
          {eyebrow}
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        {detail && <p className="mt-1.5 text-sm text-muted-foreground">{detail}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function SkeletonList() {
  return (
    <div className="space-y-3" data-testid="loading-tasks">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-20 animate-pulse rounded-2xl border border-border/70 bg-card/60"
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
      className="rounded-3xl border border-dashed border-border bg-card/40 px-6 py-14 text-center transition-all"
      data-testid={inbox ? 'empty-inbox' : 'empty-tasks'}
    >
      <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
        {inbox ? <Inbox size={22} /> : <Sparkles size={22} />}
      </div>
      <h3 className="mt-4 text-base font-bold text-foreground">
        {inbox ? 'Inbox is clear' : 'A clean slate'}
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
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
          className="mt-5 inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground hover:opacity-90"
        >
          Capture task (N)
        </button>
      )}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="rounded-3xl border border-destructive/30 bg-destructive/[.07] p-8 text-center"
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
