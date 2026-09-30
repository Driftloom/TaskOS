import { AlertTriangle, CloudOff, Info, Loader2, ShieldAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * SystemStatusBanner — spec P11.1 (P0) / P17.1.
 *
 * A single surface for system-level state the user must be able to see and act
 * on: offline, queued writes, automation paused, stale heartbeat, session expiry.
 *
 * P17.1 rules encoded here:
 *  - `critical` is non-dismissible and MUST carry an action.
 *  - `warning` / `info` are dismissible only when the caller passes onDismiss.
 *  - Errors use assertive announcement; everything else is polite.
 *  - Never colour-alone: every state ships an icon AND a text label (P6.3).
 *
 * ASSUMPTION: the `automation paused` instance is specified and this component
 * can render it, but it is NOT wired, because `automation_flags` is deliberately
 * owner-writable only (lib/db/src/schema/notifications.ts:65-67) and its only
 * readers are /internal/* routes behind DISPATCH_SECRET. Surfacing it would
 * require a new API route plus a new RLS write policy, which P0 rule 4 puts out
 * of scope for design work. See docs/audit/2026-09-30-design-system-audit/.
 */

export type BannerTone = 'info' | 'warning' | 'critical';

export interface SystemStatusBannerProps {
  tone: BannerTone;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: { label: string; onClick: () => void; busy?: boolean };
  onDismiss?: () => void;
  /** Banners that repeat while the condition persists (e.g. offline) should not announce on every render. */
  className?: string;
}

const TONE_STYLES: Record<BannerTone, { wrap: string; icon: string }> = {
  info: {
    wrap: 'border-border bg-card text-card-foreground',
    icon: 'text-accent',
  },
  warning: {
    wrap: 'border-status-warning-fill/40 bg-status-warning-fill/10 text-card-foreground',
    icon: 'text-status-warning-text',
  },
  critical: {
    wrap: 'border-status-danger-fill/50 bg-status-danger-fill/10 text-card-foreground',
    icon: 'text-status-danger-text',
  },
};

const DEFAULT_ICONS: Record<BannerTone, ReactNode> = {
  info: <Info size={16} aria-hidden="true" />,
  warning: <AlertTriangle size={16} aria-hidden="true" />,
  critical: <ShieldAlert size={16} aria-hidden="true" />,
};

export function SystemStatusBanner({
  tone,
  title,
  description,
  icon,
  action,
  onDismiss,
  className = '',
}: SystemStatusBannerProps) {
  const isCritical = tone === 'critical';
  const styles = TONE_STYLES[tone];

  return (
    <div
      role={isCritical ? 'alert' : 'status'}
      aria-live={isCritical ? 'assertive' : 'polite'}
      data-testid={`system-status-banner-${tone}`}
      className={`flex items-start gap-3 rounded-lg border px-3.5 py-3 text-sm ${styles.wrap} ${className}`}
    >
      <span className={`mt-0.5 shrink-0 ${styles.icon}`}>{icon ?? DEFAULT_ICONS[tone]}</span>

      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            disabled={action.busy}
            aria-busy={action.busy || undefined}
            data-testid="system-status-banner-action"
            className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-control bg-card px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-50 tap-target-expand"
          >
            {action.busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
            {action.label}
          </button>
        ) : null}
      </div>

      {/* critical banners are non-dismissible per P17.1 */}
      {onDismiss && !isCritical ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Dismiss: ${title}`}
          data-testid="system-status-banner-dismiss"
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground tap-target-expand"
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Offline banner with queued-change count — P17.1:
 * 'Offline — n changes queued', persistent until online, role="status".
 */
export function OfflineBanner({ queuedCount = 0 }: { queuedCount?: number }) {
  return (
    <SystemStatusBanner
      tone="warning"
      icon={<CloudOff size={16} aria-hidden="true" />}
      title="Offline"
      description={
        queuedCount > 0
          ? `${queuedCount} change${queuedCount === 1 ? '' : 's'} queued. They'll sync automatically when you reconnect.`
          : "You're offline. Changes will sync automatically when you reconnect."
      }
    />
  );
}
