import { Link } from 'wouter';
import { AlertCircle, AlertTriangle, ArrowRight, Sparkles } from 'lucide-react';
import type { RescheduleProposal } from '@workspace/api-client-react';
import { soundFX } from '@/lib/sound-fx';

interface AttentionFlightStripProps {
  pendingProposals: RescheduleProposal[];
  reschedulePaused?: boolean;
  overdueCount?: number;
}

export function AttentionFlightStrip({
  pendingProposals,
  reschedulePaused = false,
  overdueCount = 0,
}: AttentionFlightStripProps) {
  const hasProposals = pendingProposals.length > 0;
  const hasItems = hasProposals || reschedulePaused || overdueCount > 0;

  if (!hasItems) return null;

  return (
    <aside
      role="status"
      aria-label="System Attention & Autonomous Flight Strip"
      className="space-y-2.5"
    >
      {/* Pending Reschedule Proposals Flight Card */}
      {hasProposals && (
        <div
          data-testid="banner-reschedule-proposals"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-status-warning/40 bg-status-warning/10 p-3.5 sm:p-4 shadow-sm"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="grid size-8 place-items-center rounded-control bg-status-warning/20 text-status-warning-text shrink-0">
              <AlertCircle size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-callout font-bold text-foreground">
                {pendingProposals.length} reschedule proposal{pendingProposals.length === 1 ? '' : 's'} waiting for review
              </p>
              <p className="text-caption text-muted-foreground">
                Cadence proposed moves to preserve your focus commitments without silent rescheduling.
              </p>
            </div>
          </div>

          <Link
            href="/today"
            onClick={() => soundFX.playClick()}
            className="inline-flex tap-target-h items-center justify-center gap-1.5 rounded-control border border-border-control bg-card px-3.5 text-caption font-bold text-foreground transition-colors hover:bg-muted active:scale-98 shrink-0 w-full sm:w-auto ml-0 sm:ml-3"
          >
            <span>Review on Today</span>
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* Slipped / Overdue Backlog Alert */}
      {overdueCount > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-3.5 sm:p-4 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <span className="grid size-8 place-items-center rounded-control bg-accent/20 text-accent shrink-0">
              <AlertTriangle size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-callout font-bold text-foreground">
                {overdueCount} task{overdueCount === 1 ? '' : 's'} slipped from prior days
              </p>
              <p className="text-caption text-muted-foreground">
                Roll them forward or triage during your morning calibration.
              </p>
            </div>
          </div>

          <Link
            href="/today"
            onClick={() => soundFX.playClick()}
            className="inline-flex tap-target-h items-center justify-center gap-1.5 rounded-control border border-border-control bg-card px-3.5 text-caption font-bold text-foreground transition-colors hover:bg-muted active:scale-98 shrink-0 w-full sm:w-auto ml-0 sm:ml-3"
          >
            <span>Triage Backlog</span>
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* Reschedule Engine Paused Kill Switch Alert */}
      {reschedulePaused && (
        <div className="flex items-center gap-3 rounded-2xl border border-border-control bg-muted/40 p-3 sm:p-3.5 text-caption font-mono text-muted-foreground">
          <Sparkles size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
          <span>Auto-reschedule engine is paused via kill switch. Re-enable in Settings.</span>
        </div>
      )}
    </aside>
  );
}
