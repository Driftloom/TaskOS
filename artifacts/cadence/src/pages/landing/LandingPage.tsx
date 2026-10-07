import { ArrowRight, CheckCircle2, Clock, Flame, Shield, Smartphone, Sparkles } from 'lucide-react';
import { Link } from 'wouter';
import { soundFX } from '@/lib/sound-fx';
import { useIsStandalone } from '@/lib/use-standalone';

export function LandingPage() {
  const isStandalone = useIsStandalone();

  return (
    <main id="main-content" role="main" className="noise relative min-h-[100dvh] flex flex-col items-center justify-center bg-background px-4 py-16 text-foreground overflow-y-auto">
      {/* Background Ambience */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 size-96 rounded-full bg-primary/[0.08] blur-[120px] pointer-events-none" />

      <div className="w-full max-w-4xl xl:max-w-5xl text-center z-10">
        {/* Brand Mark */}
        <div className="mx-auto grid size-14 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[0_8px_30px_rgba(255,159,10,0.35)] transition-transform hover:scale-105">
          <span className="font-mono text-title3 font-bold">C</span>
        </div>

        {/* Eyebrow */}
        <p className="mt-8 font-mono text-caption uppercase tracking-[0.25em] text-primary-text font-bold">
          A personal time OS
        </p>

        {/* Hero Headline */}
        <h1 className="mt-4 text-display3 font-extrabold tracking-tight sm:text-display4 text-foreground leading-[1.08]">
          Make room for the day.
        </h1>

        {/* Hero Paragraph */}
        <p className="mx-auto mt-6 max-w-lg text-micro sm:text-callout leading-7 text-muted-foreground">
          Fast mobile capture, focus momentum, time blocking, and honest review rituals.
          Replace the paper planner without turning your life into an administrative chore.
        </p>

        {/* Action Buttons */}
        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-xs sm:max-w-none mx-auto">
          <Link
            href="/sign-up"
            onClick={() => requestAnimationFrame(() => soundFX.playClick())}
            data-testid="link-landing-sign-up"
            className="w-full sm:w-auto inline-flex overlay-cta-h items-center justify-center rounded-xl bg-primary px-6 text-micro font-bold text-primary-foreground shadow-lg transition-all hover:brightness-110 active:scale-98 touch-manipulation"
          >
            <span>Create your cadence</span>
            <ArrowRight size={16} className="ml-2" />
          </Link>

          <Link
            href="/sign-in"
            onClick={() => requestAnimationFrame(() => soundFX.playClick())}
            data-testid="link-landing-sign-in"
            className="w-full sm:w-auto inline-flex overlay-cta-h items-center justify-center rounded-xl border border-border-control bg-card px-6 text-micro font-bold text-foreground hover:bg-card/10 transition-colors active:scale-98 touch-manipulation"
          >
            Sign in
          </Link>

          {!isStandalone && (
            <Link
              href="/download"
              onClick={() => requestAnimationFrame(() => soundFX.playClick())}
              data-testid="link-landing-download"
              className="w-full sm:w-auto inline-flex overlay-cta-h items-center justify-center gap-2 rounded-xl border border-border-control bg-card px-5 text-micro font-bold text-foreground hover:bg-card/10 transition-colors active:scale-98 touch-manipulation"
            >
              <Smartphone size={16} className="text-primary-text" />
              <span>Download APK</span>
            </Link>
          )}
        </div>

        {/* Feature Cards Triad */}
        <div className="mt-16 grid gap-4 text-left sm:grid-cols-3">
          <div className="rounded-lg border border-border-control bg-card p-6 shadow-xl hover:border-primary/40 transition-all">
            <div className="size-8 rounded-xl bg-primary/15 text-primary-text grid place-items-center mb-4">
              <Sparkles size={16} />
            </div>
            <p className="font-mono text-caption text-primary-text uppercase tracking-wider">01 · Capture</p>
            <h2 className="mt-1.5 text-micro font-bold text-foreground">Natural Speed</h2>
            <p className="mt-2 text-caption leading-5 text-muted-foreground">
              Type "tomorrow 5pm" or "in 2 hours". Instant natural parsing turns words into real schedules.
            </p>
          </div>

          <div className="rounded-lg border border-border-control bg-card p-6 shadow-xl hover:border-primary/40 transition-all">
            <div className="size-8 rounded-xl bg-success/15 text-status-success-text grid place-items-center mb-4">
              <Flame size={16} />
            </div>
            <p className="font-mono text-caption text-status-success-text uppercase tracking-wider">02 · Momentum</p>
            <h2 className="mt-1.5 text-micro font-bold text-foreground">Activity Rings</h2>
            <p className="mt-2 text-caption leading-5 text-muted-foreground">
              Commit to single focus rounds. Every closed ring compounds your multi-day streak.
            </p>
          </div>

          <div className="rounded-lg border border-border-control bg-card p-6 shadow-xl hover:border-primary/40 transition-all">
            <div className="size-8 rounded-xl bg-accent/15 text-accent grid place-items-center mb-4">
              <Clock size={16} />
            </div>
            <p className="font-mono text-caption text-accent uppercase tracking-wider">03 · Time OS</p>
            <h2 className="mt-1.5 text-micro font-bold text-foreground">Time Blocking</h2>
            <p className="mt-2 text-caption leading-5 text-muted-foreground">
              Drag tasks into hourly slots with overlap detection, quiet hours, and Telegram dispatch.
            </p>
          </div>
        </div>

        {/* Security & Reliability Footer */}
        <div className="mt-12 flex items-center justify-center gap-2 text-caption text-muted-foreground">
          <Shield size={14} className="text-primary-text" />
          <span>Multi-user safe · Row-Level Security · Zero third-party trackers</span>
        </div>
      </div>
    </main>
  );
}
