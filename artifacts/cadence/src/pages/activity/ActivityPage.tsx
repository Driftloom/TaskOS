import { useMemo, useState } from 'react';
import {
  History,
  Calendar,
  Clock,
  CheckCircle2,
  PlusCircle,
  RotateCcw,
  Trash2,
  Flame,
  Sparkles,
  Search,
  Download,
  FileSpreadsheet,
  Trash,
  Filter,
  X,
  Layers,
  Archive,
  ArchiveRestore,
} from 'lucide-react';
import {
  useActivityHistory,
  filterActivities,
  exportActivitiesJson,
  exportActivitiesCsv,
  type ActivityEntry,
  type ActivityType,
} from '@/lib/activity-history';
import { dateHeading, shortTime, today } from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';
import { toast } from 'sonner';
import { SectionHeading } from '@/components/shared/StateViews';

function getActivityBadge(type: ActivityType) {
  switch (type) {
    case 'task_completed':
      return {
        icon: <CheckCircle2 className="size-3.5 text-status-success-text" strokeWidth={2.5} />,
        bg: 'bg-status-success-fill/15 border-status-success-fill/30 text-status-success-text',
        nodeBg: 'bg-status-success-text',
        label: 'Completed',
      };
    case 'task_created':
      return {
        icon: <PlusCircle className="size-3.5 text-primary-text" strokeWidth={2.5} />,
        bg: 'bg-primary/15 border-primary/30 text-primary-text',
        nodeBg: 'bg-primary',
        label: 'Created',
      };
    case 'task_reopened':
      return {
        icon: <RotateCcw className="size-3.5 text-accent" strokeWidth={2.5} />,
        bg: 'bg-accent/15 border-accent/30 text-accent',
        nodeBg: 'bg-accent',
        label: 'Reopened',
      };
    case 'task_deleted':
      return {
        icon: <Trash2 className="size-3.5 text-status-danger-text" strokeWidth={2.5} />,
        bg: 'bg-destructive/15 border-destructive/30 text-status-danger-text',
        nodeBg: 'bg-status-danger-text',
        label: 'Deleted',
      };
    // Archive and restore are LIVE events: the Inbox writes both
    // (pages/inbox/InboxPage.tsx). Without a case they fell through to the
    // generic "Activity" badge, and the type filter offered no chip for
    // them either -- the map covered the dead and missed the live.
    case 'task_archived':
      return {
        icon: <Archive className="size-3.5 text-muted-foreground" strokeWidth={2.5} />,
        bg: 'bg-muted border-border-control text-muted-foreground',
        nodeBg: 'bg-muted-foreground',
        label: 'Archived',
      };
    case 'task_restored':
      return {
        icon: <ArchiveRestore className="size-3.5 text-accent" strokeWidth={2.5} />,
        bg: 'bg-accent/15 border-accent/30 text-accent',
        nodeBg: 'bg-accent',
        label: 'Restored',
      };
    case 'focus_session_completed':
      return {
        icon: <Flame className="size-3.5 text-accent" strokeWidth={2.5} />,
        bg: 'bg-accent/15 border-accent/30 text-accent',
        nodeBg: 'bg-accent',
        label: 'Focus Session',
      };
    case 'ritual_completed':
      return {
        icon: <Sparkles className="size-3.5 text-ai-text" strokeWidth={2.5} />,
        bg: 'bg-ai/15 border-ai/30 text-ai-text',
        nodeBg: 'bg-ai-text',
        label: 'Daily Ritual',
      };
    default:
      return {
        icon: <Clock className="size-3.5 text-muted-foreground" strokeWidth={2.5} />,
        bg: 'bg-muted border-border-control text-muted-foreground',
        nodeBg: 'bg-muted-foreground',
        label: 'Activity',
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

export function ActivityPage() {
  const { activities, clearHistory, count } = useActivityHistory();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | ActivityType>('all');
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month'>('all');
  const [confirmClear, setConfirmClear] = useState(false);

  // Filtered dataset
  const filtered = useMemo(() => {
    return filterActivities(activities, {
      type: selectedType,
      dateRange,
      searchQuery,
    });
  }, [activities, selectedType, dateRange, searchQuery]);

  // Aggregate stats
  const stats = useMemo(() => {
    let completed = 0;
    let focus = 0;
    let rituals = 0;
    for (const a of activities) {
      if (a.type === 'task_completed') completed++;
      if (a.type === 'focus_session_completed') focus++;
      if (a.type === 'ritual_completed') rituals++;
    }
    return { completed, focus, rituals };
  }, [activities]);

  // Group by day (YYYY-MM-DD)
  const grouped = useMemo(() => {
    const map = new Map<string, ActivityEntry[]>();
    for (const item of filtered) {
      const dayKey = item.timestamp.slice(0, 10);
      const list = map.get(dayKey) ?? [];
      list.push(item);
      map.set(dayKey, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  // "Nothing here" has two very different causes: this device has never
  // recorded anything, or the filters hid what it did record. Only the
  // second one is the user's to fix.
  const filtersActive =
    searchQuery.trim() !== '' || selectedType !== 'all' || dateRange !== 'all';
  const deviceHasNoHistory = activities.length === 0;

  return (
    <div className="animate-enter w-full space-y-8 pb-16">
      {/* 1. Page Header */}
      <SectionHeading
        eyebrow="On-device log"
        title="Activity & History"
        detail="Stored in this browser only — the most recent 1,000 task, focus, and ritual events."
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                exportActivitiesJson(filtered);
                toast.success('Activity log exported as JSON');
              }}
              data-testid="button-export-activity-json"
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border-control bg-card px-3 text-caption font-semibold text-foreground hover:bg-surface-elevated transition-colors"
              title="Download JSON export of currently filtered events"
            >
              <Download size={13} className="text-primary-text" />
              <span>JSON</span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                exportActivitiesCsv(filtered);
                toast.success('Activity log exported as CSV');
              }}
              data-testid="button-export-activity-csv"
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border-control bg-card px-3 text-caption font-semibold text-foreground hover:bg-surface-elevated transition-colors"
              title="Download CSV spreadsheet of currently filtered events"
            >
              <FileSpreadsheet size={13} className="text-status-success-text" />
              <span>CSV</span>
            </button>

            {count > 0 && !confirmClear && (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border-control bg-card/40 px-3 text-caption font-medium text-muted-foreground hover:text-status-danger-text hover:border-destructive/30 transition-colors"
              >
                <Trash size={13} />
                <span>Clear</span>
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
                    toast.success('Activity history cleared');
                  }}
                  className="h-11 px-3 text-caption font-semibold text-primary-foreground bg-destructive rounded-lg hover:brightness-110 transition-all"
                >
                  Clear all?
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="h-11 px-2.5 text-caption font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        }
      />

      {/* 2. Integrated Metric Ribbon (Apple Health / Linear style) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 rounded-xl border border-border-control bg-card shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-caption font-mono uppercase tracking-wider text-muted-foreground">
            <Layers size={13} className="text-muted-foreground" />
            <span>Total Events</span>
          </div>
          <div className="mt-2.5">
            <span className="text-title1 sm:text-display2 font-black font-mono text-foreground">
              {count}
            </span>
            <span className="block text-caption text-muted-foreground mt-0.5">Events stored</span>
          </div>
        </div>

        <div className="border-l border-border-control/60 p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-caption font-mono uppercase tracking-wider text-status-success-text">
            <CheckCircle2 size={13} className="text-status-success-text" />
            <span>Completions</span>
          </div>
          <div className="mt-2.5">
            <span className="text-title1 sm:text-display2 font-black font-mono text-status-success-text">
              {stats.completed}
            </span>
            <span className="block text-caption text-muted-foreground mt-0.5">Tasks checked off</span>
          </div>
        </div>

        <div className="border-t border-border-control/60 sm:border-t-0 sm:border-l p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-caption font-mono uppercase tracking-wider text-accent">
            <Flame size={13} className="text-accent" />
            <span>Focus Rounds</span>
          </div>
          <div className="mt-2.5">
            <span className="text-title1 sm:text-display2 font-black font-mono text-accent">
              {stats.focus}
            </span>
            <span className="block text-caption text-muted-foreground mt-0.5">Deep work blocks</span>
          </div>
        </div>

        <div className="border-l border-t border-border-control/60 sm:border-t-0 p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-caption font-mono uppercase tracking-wider text-ai-text">
            <Sparkles size={13} className="text-ai-text" />
            <span>Daily Rituals</span>
          </div>
          <div className="mt-2.5">
            <span className="text-title1 sm:text-display2 font-black font-mono text-ai-text">
              {stats.rituals}
            </span>
            <span className="block text-caption text-muted-foreground mt-0.5">Morning &amp; evening</span>
          </div>
        </div>
      </div>

      {/* 3. Unified Filter & Search Toolbar */}
      <div className="rounded-xl border border-border-control bg-card p-4 space-y-3.5 shadow-xs">
        {/* Search Input */}
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search activity by title or description…"
            className="w-full min-h-11 rounded-lg border border-border-control bg-surface-elevated/70 pl-10 pr-9 py-2 text-callout text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground tap-target-expand"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter controls row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-border-control/60">
          {/* Time Scopes */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-caption font-mono font-bold text-muted-foreground uppercase tracking-wider mr-1.5 flex items-center gap-1">
              <Calendar size={12} />
              <span>Time:</span>
            </span>
            {(['all', 'today', 'yesterday', 'week', 'month'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  soundFX.playClick();
                  setDateRange(r);
                }}
                className={`rounded-md px-2.5 tap-target-h inline-flex items-center text-caption font-semibold transition-all capitalize ${
                  dateRange === r
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-card/[0.04] text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {r === 'all' ? 'All Time' : r === 'week' ? 'Last 7 Days' : r === 'month' ? 'Last 30 Days' : r}
              </button>
            ))}
          </div>

          {/* Type Filter Pills */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-caption font-mono font-bold text-muted-foreground uppercase tracking-wider mr-1.5 flex items-center gap-1">
              <Filter size={12} />
              <span>Type:</span>
            </span>
            {(
              [
                ['all', 'All'],
                ['task_completed', 'Completed'],
                ['task_created', 'Created'],
                ['task_reopened', 'Reopened'],
                ['task_archived', 'Archived'],
                ['task_restored', 'Restored'],
                ['focus_session_completed', 'Focus'],
                ['ritual_completed', 'Rituals'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => {
                  soundFX.playClick();
                  setSelectedType(val as any);
                }}
                className={`rounded-md px-2.5 tap-target-h inline-flex items-center text-caption font-semibold transition-all ${
                  selectedType === val
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-card/[0.04] text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Continuous Timeline Thread */}
      <div className="space-y-8">
        {grouped.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-control bg-card/60 p-12 text-center space-y-3">
            <div className="mx-auto grid size-12 place-items-center rounded-xl bg-muted border border-border-control text-muted-foreground">
              <History size={22} />
            </div>
            <h3 className="text-headline font-bold text-foreground">
              {deviceHasNoHistory
                ? 'Nothing has been recorded on this device yet'
                : 'No matching activity found'}
            </h3>
            <p className="text-caption text-muted-foreground max-w-sm mx-auto leading-relaxed">
              {/* "Adjust your filters" only helps when there IS something to
                  adjust. On a device that never recorded anything there is
                  nothing to broaden, and telling the user to adjust filters
                  would be a misdirection. */}
              {filtersActive && !deviceHasNoHistory
                ? 'Adjust your filters to broaden your view.'
                : 'Task, focus, and ritual events appear here as you use Cadence on this device. Nothing is synced to your account.'}
            </p>
          </div>
        ) : (
          grouped.map(([dateKey, items]) => {
            const isToday = dateKey === today();
            const dateTitle = isToday ? 'Today' : dateHeading(dateKey);

            return (
              <div key={dateKey} className="space-y-4">
                {/* Day Header Badge */}
                <div className="sticky top-16 z-10 flex items-center gap-2 py-1 bg-background/90 backdrop-blur-md">
                  <div className="flex items-center gap-2 rounded-full border border-border-control bg-card px-3 py-1 shadow-xs">
                    <Calendar size={12} className="text-primary-text" />
                    <span className="font-mono text-caption font-bold text-foreground">{dateTitle}</span>
                    <span className="text-caption font-mono text-muted-foreground">
                      · {items.length} {items.length === 1 ? 'event' : 'events'}
                    </span>
                  </div>
                  <div className="h-px flex-1 bg-border-control/60" />
                </div>

                {/* Timeline Spine & Event Nodes */}
                <div className="relative border-l-2 border-border-control/70 ml-4 pl-6 space-y-3">
                  {items.map((item) => {
                    const badge = getActivityBadge(item.type);
                    return (
                      <div
                        key={item.id}
                        className="relative group rounded-xl border border-border-control bg-card p-3.5 sm:p-4 hover:border-primary/40 hover:bg-surface-elevated/70 transition-all shadow-xs"
                      >
                        {/* Timeline Node Pip */}
                        <div
                          className={`absolute -left-[31px] top-3.5 sm:top-4 size-3 rounded-full border-2 border-background ${badge.nodeBg} shadow-xs transition-transform group-hover:scale-125`}
                        />

                        {/* Top row: Category Badge & Timestamp */}
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border font-mono text-caption font-bold ${badge.bg}`}
                          >
                            {badge.icon}
                            <span>{badge.label}</span>
                          </span>

                          <span className="text-caption font-mono text-muted-foreground flex items-center gap-1 shrink-0">
                            <Clock size={11} />
                            <span>{formatRelativeTime(item.timestamp)}</span>
                          </span>
                        </div>

                        {/* Event Title */}
                        <p className="mt-2 text-callout font-semibold text-foreground break-words leading-snug">
                          {item.title}
                        </p>

                        {/* Event Description (if any) */}
                        {item.description && (
                          <p className="mt-1 text-caption text-muted-foreground leading-relaxed">
                            {item.description}
                          </p>
                        )}
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
  );
}

export default ActivityPage;
