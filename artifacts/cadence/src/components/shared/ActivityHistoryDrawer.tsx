import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  History,
  CheckCircle2,
  PlusCircle,
  RotateCcw,
  Trash2,
  Flame,
  Sparkles,
  Calendar,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { Link } from 'wouter';
import {
  useActivityHistory,
  type ActivityEntry,
  type ActivityType,
} from '@/lib/activity-history';
import { soundFX } from '@/lib/sound-fx';
import { dateHeading, shortTime, today } from '@/lib/date-utils';

interface ActivityHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

function getActivityBadge(type: ActivityType) {
  switch (type) {
    case 'task_completed':
      return {
        icon: <CheckCircle2 className="size-4 text-success" strokeWidth={2.5} />,
        bg: 'bg-success/10 border-success/20',
        label: 'Completed',
        textColor: 'text-success',
      };
    case 'task_created':
      return {
        icon: <PlusCircle className="size-4 text-primary-text" strokeWidth={2.5} />,
        bg: 'bg-primary/10 border-primary/20',
        label: 'Created',
        textColor: 'text-primary-text',
      };
    case 'task_reopened':
      return {
        icon: <RotateCcw className="size-4 text-accent" strokeWidth={2.5} />,
        bg: 'bg-accent/10 border-accent/20',
        label: 'Reopened',
        textColor: 'text-accent',
      };
    case 'task_deleted':
      return {
        icon: <Trash2 className="size-4 text-destructive" strokeWidth={2.5} />,
        bg: 'bg-destructive/10 border-destructive/20',
        label: 'Deleted',
        textColor: 'text-destructive',
      };
    case 'focus_session_completed':
      return {
        icon: <Flame className="size-4 text-accent" strokeWidth={2.5} />,
        bg: 'bg-accent/10 border-accent/20',
        label: 'Focus Session',
        textColor: 'text-accent',
      };
    case 'ritual_completed':
      return {
        icon: <Sparkles className="size-4 text-ai-text" strokeWidth={2.5} />,
        bg: 'bg-ai/10 border-ai/20',
        label: 'Ritual',
        textColor: 'text-ai-text',
      };
    default:
      return {
        icon: <Clock className="size-4 text-muted-foreground" strokeWidth={2.5} />,
        bg: 'bg-muted border-border-control',
        label: 'Activity',
        textColor: 'text-muted-foreground',
      };
  }
}

function formatRelativeTime(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return shortTime(timestamp);
}

export function ActivityHistoryDrawer({ isOpen, onClose }: ActivityHistoryDrawerProps) {
  const { activities, clearHistory, count } = useActivityHistory();
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setConfirmClear(false);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  // Group activities by date key (YYYY-MM-DD)
  const grouped = useMemo(() => {
    const map = new Map<string, ActivityEntry[]>();
    for (const item of activities) {
      const dayKey = item.timestamp.slice(0, 10);
      const list = map.get(dayKey) ?? [];
      list.push(item);
      map.set(dayKey, list);
    }
    return Array.from(map.entries());
  }, [activities]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity animate-in fade-in"
        onClick={() => {
          soundFX.playClick();
          onClose();
        }}
        aria-hidden="true"
      />

      {/* Slide-over Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Activity History"
        className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-border-control bg-card shadow-2xl transition-transform animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-control px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg bg-accent/10 border border-accent/20">
              <History className="size-4 text-accent" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Activity History
              </h2>
              <p className="text-xs text-muted-foreground font-mono">
                {count} {count === 1 ? 'event' : 'events'} recorded
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Link
              href="/activity"
              onClick={() => {
                soundFX.playClick();
                onClose();
              }}
              className="px-2 py-1 text-xs font-semibold text-primary-text hover:underline transition-colors tap-target-expand flex items-center gap-1"
            >
              <span>Full Page</span>
              <ExternalLink size={12} />
            </Link>

            {count > 0 && !confirmClear && (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="px-2.5 py-1 text-xs text-muted-foreground hover:text-destructive transition-colors rounded-md hover:bg-card/[0.04] tap-target-expand"
              >
                Clear
              </button>
            )}

            {confirmClear && (
              <div className="flex items-center gap-1.5 animate-in fade-in">
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    clearHistory();
                    setConfirmClear(false);
                  }}
                  className="px-2.5 py-1 text-xs font-medium text-destructive bg-destructive/10 border border-destructive/20 rounded-md hover:bg-destructive/20 tap-target-expand"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground tap-target-expand"
                >
                  Cancel
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                onClose();
              }}
              className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-card/[0.06] hover:text-foreground transition-colors tap-target-expand ml-1"
              aria-label="Close activity history"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6">
          {count === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-muted border border-border-control">
                <History className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No activity recorded yet</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Tasks created, completions, focus sessions, and daily rituals will appear here in chronological order.
              </p>
            </div>
          ) : (
            grouped.map(([dateKey, items]) => {
              const isToday = dateKey === today();
              const dateTitle = isToday ? 'Today' : dateHeading(dateKey);

              return (
                <div key={dateKey} className="space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                    <Calendar className="size-3 text-muted-foreground" />
                    <span>{dateTitle}</span>
                  </div>

                  <div className="space-y-2">
                    {items.map((item) => {
                      const badge = getActivityBadge(item.type);
                      return (
                        <div
                          key={item.id}
                          className="flex items-start gap-3 rounded-xl border border-border-control bg-card/[0.03] p-3 transition-colors hover:bg-card/[0.06]"
                        >
                          {/* Action Icon Badge */}
                          <div
                            className={`grid size-7 shrink-0 place-items-center rounded-lg border ${badge.bg}`}
                          >
                            {badge.icon}
                          </div>

                          {/* Action Details */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span
                                className={`text-xs font-mono uppercase tracking-wider font-semibold ${badge.textColor}`}
                              >
                                {badge.label}
                              </span>
                              <span className="text-xs font-mono text-muted-foreground flex items-center gap-1 shrink-0">
                                <Clock size={10} />
                                {formatRelativeTime(item.timestamp)}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs font-medium text-foreground break-words">
                              {item.title}
                            </p>
                            {item.description && (
                              <p className="mt-0.5 text-xs text-muted-foreground leading-normal">
                                {item.description}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
