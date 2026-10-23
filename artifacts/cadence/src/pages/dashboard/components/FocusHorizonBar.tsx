import { useEffect, useMemo, useState } from 'react';
import { Clock, Zap } from 'lucide-react';
import type { TimeBlock } from '@workspace/api-client-react';

interface FocusHorizonBarProps {
  blocks: TimeBlock[];
  userTimezone: string;
}

export function FocusHorizonBar({ blocks, userTimezone: _userTimezone }: FocusHorizonBarProps) {
  // Update time every 30 seconds
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Active span: 06:00 to 24:00 (18 hours)
  const windowStartHour = 6;
  const windowEndHour = 24;
  const totalWindowMinutes = (windowEndHour - windowStartHour) * 60;

  const currentTotalMinutes = Math.max(
    0,
    Math.min(totalWindowMinutes, (currentHour - windowStartHour) * 60 + currentMinute),
  );
  const nowPct = (currentTotalMinutes / totalWindowMinutes) * 100;
  const hoursRemaining = Math.max(0, windowEndHour - currentHour);

  // Derived block statuses and focus window
  const { sortedBlocks, activeBlock, nextUpcomingBlock, focusRunwayText } = useMemo(() => {
    const sorted = [...blocks].sort((a, b) => a.startAt.localeCompare(b.startAt));
    const active = sorted.find((b) => {
      const s = new Date(b.startAt).getTime();
      const e = new Date(b.endAt).getTime();
      const t = now.getTime();
      return t >= s && t < e;
    });

    const upcoming = sorted.filter((b) => new Date(b.startAt).getTime() > now.getTime());
    const nextUp = upcoming[0] || null;

    let runway = '';
    if (active) {
      const msLeft = new Date(active.endAt).getTime() - now.getTime();
      const minsLeft = Math.max(0, Math.ceil(msLeft / 60_000));
      runway = `${minsLeft}m remaining in active block`;
    } else if (nextUp) {
      const msGap = new Date(nextUp.startAt).getTime() - now.getTime();
      const minsGap = Math.max(0, Math.floor(msGap / 60_000));
      if (minsGap >= 60) {
        const hrs = Math.floor(minsGap / 60);
        const remMins = minsGap % 60;
        runway = remMins > 0 ? `${hrs}h ${remMins}m free window` : `${hrs}h free window`;
      } else {
        runway = `${minsGap}m free window`;
      }
    } else {
      runway = 'Day runway clear';
    }

    return {
      sortedBlocks: sorted,
      activeBlock: active,
      nextUpcomingBlock: nextUp,
      focusRunwayText: runway,
    };
  }, [blocks, now]);

  return (
    <section
      aria-label="Day Focus Horizon"
      data-testid="section-dashboard-horizon"
      className="relative rounded-2xl border border-border-control/60 bg-card p-4 sm:p-5 shadow-lg overflow-hidden"
    >
      {/* Specular top highlight */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"
        aria-hidden="true"
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="grid size-7 place-items-center rounded-control bg-primary/15 text-primary-text shrink-0">
            <Clock size={15} aria-hidden="true" />
          </span>
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <h2 className="font-mono text-caption uppercase tracking-wider font-bold text-foreground">
              Day Horizon
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-status-success/15 px-2 py-0.5 font-mono text-micro text-status-success-text">
              <span className="size-1.5 rounded-full bg-status-success animate-pulse" aria-hidden="true" />
              <span>
                {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
              </span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 font-mono text-caption text-muted-foreground flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-primary-text font-semibold">
            <Zap size={13} className="text-primary-text" aria-hidden="true" />
            <span>{focusRunwayText}</span>
          </span>
          <span className="hidden sm:inline text-border-control" aria-hidden="true">·</span>
          <span>{hoursRemaining}h left in focus day</span>
        </div>
      </div>

      {/* Proportional Scrub Track */}
      <div className="relative h-8 w-full rounded-lg bg-muted/40 border border-border-control/40 overflow-hidden select-none">
        {/* Elapsed gradient background */}
        <div
          style={{ width: `${nowPct}%` }}
          className="absolute inset-y-0 left-0 bg-muted/70 transition-all duration-deliberate"
          aria-hidden="true"
        />

        {/* Scheduled blocks */}
        {sortedBlocks.map((block) => {
          const start = new Date(block.startAt);
          const end = new Date(block.endAt);
          const startMin = (start.getHours() - windowStartHour) * 60 + start.getMinutes();
          const endMin = (end.getHours() - windowStartHour) * 60 + end.getMinutes();
          const left = Math.max(0, Math.min(100, (startMin / totalWindowMinutes) * 100));
          const width = Math.max(2, Math.min(100 - left, ((endMin - startMin) / totalWindowMinutes) * 100));
          const isPast = end.getTime() < now.getTime();
          const isCurrent = activeBlock?.id === block.id;

          const title = block.taskTitle || 'Scheduled Block';
          const timeLabel = `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;

          return (
            <div
              key={block.id}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${title}: ${timeLabel}`}
              className={`absolute inset-y-1 rounded-md px-1.5 flex items-center truncate font-mono text-micro border transition-colors ${
                isCurrent
                  ? 'bg-primary/25 border-primary text-primary-text font-bold z-10 shadow-sm ring-1 ring-primary/40'
                  : isPast
                    ? 'bg-muted/60 border-border-control/40 text-muted-foreground opacity-60'
                    : 'bg-status-scheduled/15 border-status-scheduled/30 text-status-scheduled-text font-semibold'
              }`}
            >
              <span className="truncate">{title}</span>
            </div>
          );
        })}

        {/* Live laser playhead */}
        <div
          style={{ left: `${nowPct}%` }}
          className="absolute inset-y-0 w-0.5 bg-primary z-20 pointer-events-none"
          aria-hidden="true"
        >
          <div className="absolute -top-1 -left-1 size-2.5 rounded-full bg-primary ring-2 ring-card shadow-md" />
        </div>
      </div>

      {/* Hour Markers Track */}
      <div className="mt-2 flex justify-between font-mono text-micro text-muted-foreground px-0.5" aria-hidden="true">
        <span>06:00</span>
        <span>09:00</span>
        <span>12:00</span>
        <span>15:00</span>
        <span>18:00</span>
        <span>21:00</span>
        <span>24:00</span>
      </div>
    </section>
  );
}
