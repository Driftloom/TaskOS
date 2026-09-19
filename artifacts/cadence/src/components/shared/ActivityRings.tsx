import React from 'react';

interface ActivityRingsProps {
  tasksCompleted: number;
  tasksTotal: number;
  roundsCompleted: number;
  roundTarget: number;
  streakDays: number;
  size?: number;
}

export function ActivityRings({
  tasksCompleted,
  tasksTotal,
  roundsCompleted,
  roundTarget,
  streakDays,
  size = 132,
}: ActivityRingsProps) {
  const strokeWidth = 8;
  const rings = [
    {
      fraction: tasksTotal > 0 ? tasksCompleted / tasksTotal : 0,
      color: '#0A84FF', // Apple System Blue (Tasks Completed)
      radius: (size - strokeWidth) / 2,
    },
    {
      fraction: roundTarget > 0 ? Math.min(1, roundsCompleted / roundTarget) : 0,
      color: '#30D158', // Apple System Green (Focus Rounds)
      radius: (size - strokeWidth) / 2 - strokeWidth - 4,
    },
  ];

  return (
    <div
      className="relative shrink-0 select-none"
      style={{ width: size, height: size }}
      data-testid="activity-rings"
      role="img"
      aria-label={`Activity rings: ${tasksCompleted} of ${tasksTotal} tasks done, ${roundsCompleted} of ${roundTarget} rounds done, ${streakDays} day streak`}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90 w-full h-full">
        {rings.map((ring, idx) => {
          const circumference = 2 * Math.PI * ring.radius;
          const dash = circumference * Math.min(1, Math.max(0, ring.fraction));
          return (
            <g key={idx}>
              {/* Background track */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={ring.radius}
                fill="none"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth={strokeWidth}
              />
              {/* Foreground progress arc */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={ring.radius}
                fill="none"
                stroke={ring.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circumference - dash}`}
                style={{
                  transition: 'stroke-dasharray 0.65s cubic-bezier(0.16, 1, 0.3, 1)',
                  filter: `drop-shadow(0 0 3px ${ring.color}66)`,
                }}
              />
            </g>
          );
        })}
      </svg>
      {/* Center Streak Metric */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-extrabold tracking-tight text-foreground">
          {streakDays}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          day streak
        </span>
      </div>
    </div>
  );
}

interface ProgressRingProps {
  completed: number;
  total: number;
  size?: number;
  strokeWidth?: number;
}

export function ProgressRing({
  completed,
  total,
  size = 120,
  strokeWidth = 8,
}: ProgressRingProps) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (circumference * percent) / 100;

  return (
    <div
      className="relative shrink-0 select-none"
      style={{ width: size, height: size }}
      data-testid="progress-ring"
      role="img"
      aria-label={`${percent}% completed`}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90 w-full h-full">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#0A84FF"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          style={{
            transition: 'stroke-dasharray 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
            filter: 'drop-shadow(0 0 4px rgba(10, 132, 255, 0.4))',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-extrabold tracking-tight text-foreground">
          {percent}%
        </span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          done
        </span>
      </div>
    </div>
  );
}
