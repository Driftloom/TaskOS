import { useMemo } from 'react';
import { Sparkles, Shield, Cpu, Activity, Undo2 } from 'lucide-react';
import {
  getListTasksQueryKey,
  useGetAgentUsage,
  useListTasks,
} from '@workspace/api-client-react';
import { today, timezone } from '@/lib/date-utils';
import { SectionHeading } from '@/components/shared/StateViews';
import { AgentPanel } from '@/components/agent/AgentPanel';

/**
 * Enterprise Agent Screen (/agent).
 *
 * Implements System Requirements spec §3 IA (/agent: In-app chat panel)
 * and Design System spec §P15 (Conversational Agent Surface).
 * Anti-anthropomorphic, data-honest, reversible action logging.
 */
export function AgentPage() {
  const params = useMemo(
    () => ({ date: today(), timezone: timezone() }),
    [],
  );
  const { data: tasks } = useListTasks(params, {
    query: { queryKey: getListTasksQueryKey(params) },
  });

  const { data: usageData } = useGetAgentUsage();
  const usage = usageData?.usage;

  const spendCents = usage?.totalCostEstimateCents ?? 0;
  const ceilingCents = usage?.spendCeilingCents ?? 500;
  const spendPercent = Math.min(100, Math.round((spendCents / ceilingCents) * 100));

  return (
    <div className="animate-enter space-y-6">
      {/* Page Header */}
      <SectionHeading
        eyebrow="Intelligent Assistant"
        title="Assistant"
        detail={`${tasks?.length ?? 0} active tasks in context · Conversational scheduling with reversible action logging`}
      />

      {/* Telemetry & Trust Boundary Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Trust Boundary Card */}
        <div className="card-enterprise rounded-xl border border-border-control bg-card p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2">
            <span className="grid size-7 place-items-center rounded-lg bg-ai/20 text-ai-text">
              <Shield size={15} />
            </span>
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Trust Boundary
            </span>
          </div>
          <p className="text-xs text-foreground/80 leading-relaxed">
            Actions are executed deterministically and logged to the ledger.
            Bulk actions over 10 tasks require explicit confirmation.
          </p>
        </div>

        {/* Token Quota & Monthly Spend Guard */}
        <div className="card-enterprise rounded-xl border border-border-control bg-card p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-primary/20 text-primary-text">
                <Cpu size={15} />
              </span>
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                LLM Safety Ceiling
              </span>
            </div>
            <span className="font-mono text-xs font-bold text-primary-text">
              {spendPercent}% used
            </span>
          </div>
          <div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${spendPercent}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between font-mono text-xs text-muted-foreground">
              <span>{usage?.totalCalls ?? 0} calls</span>
              <span>
                ${(spendCents / 100).toFixed(2)} / ${(ceilingCents / 100).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Reversibility Contract Card */}
        <div className="card-enterprise rounded-xl border border-border-control bg-card p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2">
            <span className="grid size-7 place-items-center rounded-lg bg-status-success/20 text-status-success-text">
              <Undo2 size={15} />
            </span>
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Reversible by Design
            </span>
          </div>
          <p className="text-xs text-foreground/80 leading-relaxed">
            Every creation, update, and reschedule can be undone with a single tap.
            Permanent deletions are strictly forbidden for agent workflows.
          </p>
        </div>
      </div>

      {/* Main Conversational Agent Surface */}
      <div className="card-enterprise rounded-2xl border border-border-control bg-card shadow-xl overflow-hidden">
        <AgentPanel tasks={tasks ?? []} className="p-4 sm:p-6" />
      </div>
    </div>
  );
}

export default AgentPage;
