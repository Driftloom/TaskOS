import { Link } from 'wouter';
import { ArrowRight, CheckCircle2, Inbox } from 'lucide-react';
import type { Task } from '@workspace/api-client-react';
import { soundFX } from '@/lib/sound-fx';

interface InboxTriageCardProps {
  inboxTasks: Task[];
  isLoading: boolean;
}

export function InboxTriageCard({ inboxTasks, isLoading }: InboxTriageCardProps) {
  const count = inboxTasks.length;
  const previewItems = inboxTasks.slice(0, 3);

  return (
    <section
      aria-labelledby="inbox-triage-heading"
      data-testid="card-dashboard-inbox"
      className="flex flex-col justify-between rounded-2xl border border-border-control bg-card p-5 shadow-lg"
    >
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-border-control/40">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-control bg-primary/15 text-primary-text">
              <Inbox size={15} aria-hidden="true" />
            </span>
            <h2
              id="inbox-triage-heading"
              className="font-mono text-caption uppercase tracking-wider text-muted-foreground font-bold"
            >
              Inbox Triage
            </h2>
          </div>

          <span
            className={`rounded-full px-2 py-0.5 font-mono text-caption font-semibold ${
              count > 0
                ? 'bg-primary/15 text-primary-text'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {count} {count === 1 ? 'item' : 'items'}
          </span>
        </div>

        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-2">
              <div className="h-10 animate-pulse rounded-lg bg-muted/50" />
              <div className="h-10 animate-pulse rounded-lg bg-muted/50" />
            </div>
          ) : count === 0 ? (
            <div className="py-6 text-center">
              <CheckCircle2 size={24} className="mx-auto text-status-success-text mb-2" aria-hidden="true" />
              <p className="text-callout font-semibold text-foreground">Inbox Zero</p>
              <p className="mt-1 text-caption text-muted-foreground">
                All raw captures processed and scheduled.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {previewItems.map((task) => (
                <li
                  key={task.id}
                  className="rounded-lg border border-border-control/40 bg-muted/30 p-2.5 text-callout text-foreground line-clamp-1"
                >
                  {task.title}
                </li>
              ))}
              {count > 3 && (
                <li className="text-center font-mono text-caption text-muted-foreground pt-1">
                  +{count - 3} more awaiting triage
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-border-control/40">
        <Link
          href="/inbox"
          onClick={() => soundFX.playClick()}
          data-testid="link-dashboard-inbox"
          className="inline-flex w-full tap-target-h items-center justify-between rounded-control border border-border-control bg-card px-3 text-caption font-bold text-foreground transition-colors hover:bg-muted active:scale-98"
        >
          <span>Open Full Inbox</span>
          <ArrowRight size={14} className="text-muted-foreground" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
