import { useState } from 'react';
import { ShieldCheck, Compass, CheckCircle2, Lock, BellOff, Sparkles, Sun, Moon, Database } from 'lucide-react';
import { soundFX } from '@/lib/sound-fx';
import { TiltCard3D } from './TiltCard3D';

export function LandingPhilosophy() {
  const [anxietyMode, setAnxietyMode] = useState<'calm' | 'noisy'>('calm');
  const [ritualMode, setRitualMode] = useState<'morning' | 'evening'>('morning');

  return (
    <section className="relative w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 border-t border-border-control/60">
      {/* Section Header */}
      <div className="text-left space-y-3 mb-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-border-control bg-card/80 px-3 py-1 font-mono text-caption uppercase tracking-wider text-muted-foreground shadow-sm backdrop-blur-md">
          <Sparkles size={12} className="text-primary-text" />
          <span>Core Invariants & Tenets</span>
        </div>
        <h2 className="text-title1 sm:text-display2 font-extrabold tracking-tight text-foreground">
          Calm by design. Private by architecture.
        </h2>
        <p className="max-w-[65ch] text-callout sm:text-body text-muted-foreground leading-relaxed">
          Built for craftsmen who need their tools to get out of the way.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Pillar 1: Paper Calm & Batch Summaries */}
        <TiltCard3D
          maxTilt={7}
          sheen
          glow="amber"
          className="p-6 sm:p-7 flex flex-col justify-between"
        >
          <div>
            <div
              className="grid size-11 place-items-center rounded-control bg-primary/15 text-primary-text mb-4 shadow-sm"
              style={{ transform: 'translateZ(32px)' }}
            >
              <Compass size={22} />
            </div>
            <h3
              className="text-title3 sm:text-title2 font-bold text-foreground tracking-tight"
              style={{ transform: 'translateZ(24px)' }}
            >
              Zero Artificial Anxiety
            </h3>
            <p
              className="mt-2.5 text-caption leading-relaxed text-muted-foreground"
              style={{ transform: 'translateZ(14px)' }}
            >
              No notification bombardment, no gamified guilt trips, no fake motivational badges.
              Batch catch-up alerts compress pending alerts into a single calm summary when you return.
            </p>

            {/* Interactive Batch Alert Demonstration */}
            <div
              className="mt-5 rounded-xl border border-border-control bg-surface-elevated/90 p-3.5 space-y-2 backdrop-blur-md shadow-inner text-caption"
              style={{ transform: 'translateZ(30px)' }}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-micro font-bold text-muted-foreground uppercase">
                  ALERT STRATEGY
                </span>
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    setAnxietyMode(anxietyMode === 'calm' ? 'noisy' : 'calm');
                  }}
                  className="font-mono text-caption text-primary-text hover:underline"
                >
                  {anxietyMode === 'calm' ? 'Show standard noisy apps' : 'Show Cadence calm'}
                </button>
              </div>

              {anxietyMode === 'calm' ? (
                <div className="flex items-start gap-2 text-foreground font-medium pt-1">
                  <BellOff size={15} className="text-primary-text shrink-0 mt-0.5" />
                  <span>"1 summary: 3 tasks completed, 1 rescheduled to tomorrow."</span>
                </div>
              ) : (
                <div className="space-y-1 text-status-danger-text text-micro font-mono pt-1">
                  <p>⚠️ Task overdue! (10m ago)</p>
                  <p>🔥 Your streak will break in 2 hours!</p>
                  <p>🚨 3 tasks need your attention now!</p>
                </div>
              )}
            </div>
          </div>
        </TiltCard3D>

        {/* Pillar 2: RLS Isolation & Cryptographic Tenancy */}
        <TiltCard3D
          maxTilt={7}
          sheen
          glow="emerald"
          className="p-6 sm:p-7 flex flex-col justify-between"
        >
          <div>
            <div
              className="grid size-11 place-items-center rounded-control bg-status-success-text/15 text-status-success-text mb-4 shadow-sm"
              style={{ transform: 'translateZ(32px)' }}
            >
              <ShieldCheck size={22} />
            </div>
            <h3
              className="text-title3 sm:text-title2 font-bold text-foreground tracking-tight"
              style={{ transform: 'translateZ(24px)' }}
            >
              Row-Level Security on Every Table
            </h3>
            <p
              className="mt-2.5 text-caption leading-relaxed text-muted-foreground"
              style={{ transform: 'translateZ(14px)' }}
            >
              Multi-user safe from day one. Every database query enforces Clerk JWT claims{' '}
              <code className="text-primary font-mono font-semibold">(auth.jwt()-&gt;&gt;'sub')</code> inside
              Supabase Postgres. Zero cross-tenant data leakage is mathematically provable.
            </p>

            {/* Cryptographic RLS Query Proof */}
            <div
              className="mt-5 rounded-xl border border-border-control bg-card/90 p-3.5 space-y-1.5 font-mono text-caption shadow-inner backdrop-blur-md"
              style={{ transform: 'translateZ(30px)' }}
            >
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5 text-status-success-text font-bold">
                  <Lock size={12} />
                  RLS ENFORCED
                </span>
                <span className="text-caption font-bold">20 MIGRATIONS</span>
              </div>
              <p className="text-foreground pt-1 select-all font-semibold">
                SELECT * FROM tasks
              </p>
              <p className="text-accent select-all">
                WHERE user_id = auth.jwt()-&gt;&gt;'sub'
              </p>
            </div>
          </div>
        </TiltCard3D>

        {/* Pillar 3: Honest Rituals & No Fake Badges */}
        <TiltCard3D
          maxTilt={7}
          sheen
          glow="cyan"
          className="p-6 sm:p-7 flex flex-col justify-between"
        >
          <div>
            <div
              className="grid size-11 place-items-center rounded-control bg-accent/15 text-accent mb-4 shadow-sm"
              style={{ transform: 'translateZ(32px)' }}
            >
              <CheckCircle2 size={22} />
            </div>
            <h3
              className="text-title3 sm:text-title2 font-bold text-foreground tracking-tight"
              style={{ transform: 'translateZ(24px)' }}
            >
              Honest Morning & Evening Rituals
            </h3>
            <p
              className="mt-2.5 text-caption leading-relaxed text-muted-foreground"
              style={{ transform: 'translateZ(14px)' }}
            >
              Start the day by setting intentional focus priorities. Close the evening with a 2-minute honest
              ledger: see what slipped and why, then reset cleanly without carrying forward unreviewed guilt.
            </p>

            {/* Interactive Ritual Switcher */}
            <div
              className="mt-5 rounded-xl border border-border-control bg-surface-elevated/90 p-3.5 space-y-2 backdrop-blur-md shadow-inner text-caption"
              style={{ transform: 'translateZ(30px)' }}
            >
              <div className="flex items-center justify-between">
                <div className="inline-flex rounded-full border border-border-control bg-card p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.playClick();
                      setRitualMode('morning');
                    }}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-micro font-bold transition-all ${
                      ritualMode === 'morning'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Sun size={10} />
                    <span>Morning Intent</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.playClick();
                      setRitualMode('evening');
                    }}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-micro font-bold transition-all ${
                      ritualMode === 'evening'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Moon size={10} />
                    <span>Evening Ledger</span>
                  </button>
                </div>
              </div>

              {ritualMode === 'morning' ? (
                <p className="text-foreground font-semibold pt-1">
                  Pick exactly 3 high-leverage focus anchors for the day.
                </p>
              ) : (
                <p className="text-foreground font-semibold pt-1">
                  Reconcile unfinished tasks with 1 click: reschedule or cleanly drop.
                </p>
              )}
            </div>
          </div>
        </TiltCard3D>
      </div>
    </section>
  );
}
