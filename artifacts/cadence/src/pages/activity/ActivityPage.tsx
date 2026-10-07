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
  Bot,
  ArrowUpDown,
  Search,
  Download,
  FileSpreadsheet,
  Trash,
  Filter,
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
    case 'task_rescheduled':
      return {
        icon: <ArrowUpDown className="size-4 text-primary-text" strokeWidth={2.5} />,
        bg: 'bg-primary/10 border-primary/20',
        label: 'Rescheduled',
        textColor: 'text-primary-text',
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
    case 'agent_action':
      return {
        icon: <Bot className="size-4 text-ai-text" strokeWidth={2.5} />,
        bg: 'bg-ai/10 border-ai/20',
        label: 'Assistant Action',
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

  return (
    <div className="animate-enter max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-xl bg-accent/15 text-accent border border-accent/20">
              <History size={20} />
            </span>
            <div>
              <h1 className="text-title3 sm:text-display1 font-bold tracking-tight text-foreground">
                My Activity &amp; History
              </h1>
              <p className="text-caption sm:text-micro text-muted-foreground mt-0.5">
                Zero-data-loss audit log of your tasks, focus sessions, and rituals.
              </p>
            </div>
          </div>
        </div>

        {/* Export / Clear Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              exportActivitiesJson(filtered);
              toast.success('Activity log exported as JSON');
            }}
            data-testid="button-export-activity-json"
            className="inline-flex filter-chip-h items-center gap-1.5 rounded-xl border border-border-control bg-card px-3.5 text-caption font-semibold text-foreground hover:bg-card/[0.08] transition-colors tap-target-expand"
          >
            <Download size={14} className="text-primary-text" />
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
            className="inline-flex filter-chip-h items-center gap-1.5 rounded-xl border border-border-control bg-card px-3.5 text-caption font-semibold text-foreground hover:bg-card/[0.08] transition-colors tap-target-expand"
          >
            <FileSpreadsheet size={14} className="text-success" />
            <span>CSV</span>
          </button>

          {count > 0 && !confirmClear && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex filter-chip-h items-center gap-1.5 rounded-xl border border-border-control bg-transparent px-3 text-caption font-medium text-muted-foreground hover:text-destructive transition-colors tap-target-expand"
            >
              <Trash size={14} />
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
                className="px-2.5 py-1.5 text-caption font-semibold text-destructive bg-destructive/10 border border-destructive/20 rounded-xl hover:bg-destructive/20 tap-target-expand"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-2 py-1.5 text-caption text-muted-foreground hover:text-foreground tap-target-expand"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Activity Stats Triad */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border-control bg-card p-4">
          <p className="text-caption font-mono uppercase tracking-wider text-muted-foreground">Total Events</p>
          <p className="mt-1 text-display1 font-extrabold text-foreground">{count}</p>
        </div>

        <div className="rounded-lg border border-border-control bg-card p-4">
          <p className="text-caption font-mono uppercase tracking-wider text-status-success-text">Completions</p>
          <p className="mt-1 text-display1 font-extrabold text-success">{stats.completed}</p>
        </div>

        <div className="rounded-lg border border-border-control bg-card p-4">
          <p className="text-caption font-mono uppercase tracking-wider text-accent">Focus Rounds</p>
          <p className="mt-1 text-display1 font-extrabold text-accent">{stats.focus}</p>
        </div>

        <div className="rounded-lg border border-border-control bg-card p-4">
          <p className="text-caption font-mono uppercase tracking-wider text-ai-text">Daily Rituals</p>
          <p className="mt-1 text-display1 font-extrabold text-ai-text">{stats.rituals}</p>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="rounded-lg border border-border-control bg-card p-4 space-y-3.5 shadow-sm">
        {/* Search Input */}
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search activity by task title or description…"
            className="w-full rounded-xl border border-border-control bg-card/[0.06] pl-10 pr-4 py-2 text-caption sm:text-micro text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors"
          />
        </div>

        {/* Date Scope Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border-control">
          <span className="text-caption font-semibold text-muted-foreground uppercase tracking-wider mr-1 flex items-center gap-1">
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
              className={`rounded-lg px-2.5 py-1 text-caption font-semibold transition-colors capitalize ${
                dateRange === r
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card/[0.04] text-muted-foreground hover:bg-card/[0.08] hover:text-foreground'
              }`}
            >
              {r === 'all' ? 'All Time' : r === 'week' ? 'Last 7 Days' : r === 'month' ? 'Last 30 Days' : r}
            </button>
          ))}
        </div>

        {/* Type Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border-control">
          <span className="text-caption font-semibold text-muted-foreground uppercase tracking-wider mr-1 flex items-center gap-1">
            <Filter size={12} />
            <span>Type:</span>
          </span>
          {(
            [
              ['all', 'All'],
              ['task_completed', 'Completed'],
              ['task_created', 'Created'],
              ['task_reopened', 'Reopened'],
              ['focus_session_completed', 'Focus'],
              ['ritual_completed', 'Rituals'],
              ['agent_action', 'Agent'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => {
                soundFX.playClick();
                setSelectedType(val as any);
              }}
              className={`rounded-lg px-2.5 py-1 text-caption font-semibold transition-colors ${
                selectedType === val
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card/[0.04] text-muted-foreground hover:bg-card/[0.08] hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline Section */}
      <div className="space-y-6">
        {grouped.length === 0 ? (
          <div className="rounded-lg border border-border-control bg-card p-12 text-center space-y-3">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-muted border border-border-control">
              <History size={22} className="text-muted-foreground" />
            </div>
            <h3 className="text-micro font-bold text-foreground">No matching activity found</h3>
            <p className="text-caption text-muted-foreground max-w-sm mx-auto">
              Try adjusting your search query, date filter, or action category.
            </p>
          </div>
        ) : (
          grouped.map(([dateKey, items]) => {
            const isToday = dateKey === today();
            const dateTitle = isToday ? 'Today' : dateHeading(dateKey);

            return (
              <div key={dateKey} className="space-y-3">
                <div className="flex items-center gap-2 text-caption font-bold text-muted-foreground uppercase tracking-wider px-1">
                  <Calendar size={13} className="text-primary-text" />
                  <span>{dateTitle}</span>
                  <span className="text-caption font-mono text-muted-foreground/70 font-normal">
                    ({items.length} {items.length === 1 ? 'event' : 'events'})
                  </span>
                </div>

                <div className="space-y-2">
                  {items.map((item) => {
                    const badge = getActivityBadge(item.type);
                    return (
                      <div
                        key={item.id}
                        className="flex items-start gap-3.5 rounded-lg border border-border-control bg-card p-3.5 sm:p-4 transition-all hover:border-primary/30 hover:bg-card/[0.04] shadow-sm"
                      >
                        {/* Icon Badge */}
                        <div className={`grid size-8 shrink-0 place-items-center rounded-xl border ${badge.bg}`}>
                          {badge.icon}
                        </div>

                        {/* Details */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span
                              className={`text-caption font-mono uppercase tracking-wider font-bold ${badge.textColor}`}
                            >
                              {badge.label}
                            </span>
                            <span className="text-caption font-mono text-muted-foreground flex items-center gap-1 shrink-0">
                              <Clock size={11} />
                              {formatRelativeTime(item.timestamp)}
                            </span>
                          </div>

                          <p className="mt-1 text-caption sm:text-micro font-semibold text-foreground break-words">
                            {item.title}
                          </p>

                          {item.description && (
                            <p className="mt-0.5 text-caption text-muted-foreground leading-relaxed">
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
  );
}

export default ActivityPage;
