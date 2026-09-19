import { ArrowRight, CheckCircle2, Clock, Flame, Shield, Sparkles } from 'lucide-react';
import { Link } from 'wouter';
import { soundFX } from '@/lib/sound-fx';

export function LandingPage() {
  return (
    <main className="noise relative min-h-[100dvh] flex flex-col items-center justify-center bg-background px-4 py-16 text-foreground overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 size-96 rounded-full bg-primary/[0.08] blur-[120px] pointer-events-none" />

      <div className="w-full max-w-3xl text-center z-10">
        {/* Brand Mark */}
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_30px_rgba(255,159,10,0.35)] transition-transform hover:scale-105">
          <span className="font-mono text-xl font-bold">C</span>
        </div>

        {/* Eyebrow */}
        <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.25em] text-primary font-bold">
          A personal time OS
        </p>

        {/* Hero Headline */}
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-6xl text-foreground leading-[1.08]">
          Make room for the day.
        </h1>

        {/* Hero Paragraph */}
        <p className="mx-auto mt-6 max-w-lg text-sm sm:text-base leading-7 text-muted-foreground">
          Fast mobile capture, focus momentum, time blocking, and honest review rituals.
          Replace the paper planner without turning your life into an administrative chore.
        </p>

        {/* Action Buttons */}
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/sign-up"
            onClick={() => soundFX.playClick()}
            data-testid="link-landing-sign-up"
            className="inline-flex min-h-[46px] items-center justify-center rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-lg transition-all hover:brightness-110 active:scale-98"
          >
            <span>Create your cadence</span>
            <ArrowRight size={16} className="ml-2" />
          </Link>

          <Link
            href="/sign-in"
            onClick={() => soundFX.playClick()}
            data-testid="link-landing-sign-in"
            className="inline-flex min-h-[46px] items-center justify-center rounded-xl border border-white/[0.1] bg-[#1C1C1E] px-6 text-sm font-bold text-foreground hover:bg-white/10 transition-colors active:scale-98"
          >
            Sign in
          </Link>
        </div>

        {/* Feature Cards Triad */}
        <div className="mt-16 grid gap-4 text-left sm:grid-cols-3">
          <div className="rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-6 shadow-xl hover:border-primary/40 transition-all">
            <div className="size-8 rounded-xl bg-primary/15 text-primary grid place-items-center mb-4">
              <Sparkles size={16} />
            </div>
            <p className="font-mono text-[10px] text-primary uppercase tracking-wider">01 · Capture</p>
            <h3 className="mt-1.5 text-sm font-bold text-foreground">Natural Speed</h3>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Type "tomorrow 5pm" or "in 2 hours". Instant natural parsing turns words into real schedules.
            </p>
          </div>

          <div className="rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-6 shadow-xl hover:border-primary/40 transition-all">
            <div className="size-8 rounded-xl bg-emerald-500/15 text-emerald-400 grid place-items-center mb-4">
              <Flame size={16} />
            </div>
            <p className="font-mono text-[10px] text-emerald-400 uppercase tracking-wider">02 · Momentum</p>
            <h3 className="mt-1.5 text-sm font-bold text-foreground">Activity Rings</h3>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Commit to single focus rounds. Every closed ring compounds your multi-day streak.
            </p>
          </div>

          <div className="rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-6 shadow-xl hover:border-primary/40 transition-all">
            <div className="size-8 rounded-xl bg-sky-500/15 text-sky-400 grid place-items-center mb-4">
              <Clock size={16} />
            </div>
            <p className="font-mono text-[10px] text-sky-400 uppercase tracking-wider">03 · Time OS</p>
            <h3 className="mt-1.5 text-sm font-bold text-foreground">Time Blocking</h3>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Drag tasks into hourly slots with overlap detection, quiet hours, and Telegram dispatch.
            </p>
          </div>
        </div>

        {/* Security & Reliability Footer */}
        <div className="mt-12 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Shield size={14} className="text-primary" />
          <span>Multi-user safe · Row-Level Security · Zero third-party trackers</span>
        </div>
      </div>
    </main>
  );
}
