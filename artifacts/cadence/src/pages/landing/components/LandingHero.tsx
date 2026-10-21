import { ArrowRight, Smartphone, ShieldCheck, Send, Flame } from 'lucide-react';
import { Link } from 'wouter';
import { soundFX } from '@/lib/sound-fx';
import { useIsStandalone } from '@/lib/use-standalone';
import { ChronoCanvas3D } from './ChronoCanvas3D';

export function LandingHero() {
  const isStandalone = useIsStandalone();

  return (
    <section className="relative w-full min-h-[100dvh] flex items-center justify-center overflow-hidden">
      {/* Absolute Full-Bleed End-to-End 3D WebGL Canvas Layer */}
      <div className="absolute inset-0 size-full z-0 pointer-events-auto">
        <ChronoCanvas3D />
      </div>

      {/* Foreground Content Layer Floating Directly on the 3D Space */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 pointer-events-none flex items-center">
        <div className="max-w-2xl text-left space-y-6">
          {/* Spatial Craft Status Badge.
              No pulsing status dot: on a pre-auth marketing page a live-looking
              indicator claims a running service that nothing here is
              connected to. The bento grid's equivalent pulse was removed for
              the same reason. */}
          <div
            data-testid="landing-hero-badge"
            className="inline-flex items-center gap-2 rounded-full border border-border-control bg-card/85 px-3.5 py-1 text-caption font-mono uppercase tracking-wider text-muted-foreground shadow-md backdrop-blur-md pointer-events-auto"
          >
            <span className="font-semibold text-foreground">Spatial Task & Time OS</span>
            <span>·</span>
            <span className="text-primary-text font-bold">Rhythm & Rituals</span>
          </div>

          {/* Hero Headline (Load-bearing for Playwright E2E) */}
          <h1 className="text-display3 font-extrabold tracking-tight sm:text-display4 text-foreground leading-[1.05] drop-shadow-sm pointer-events-auto">
            Make room for the day.
          </h1>

          {/* Hero Copy */}
          <p className="max-w-[55ch] text-callout sm:text-body leading-relaxed text-muted-foreground/95 pointer-events-auto">
            Fast mobile capture, calendar time-blocking, focus momentum, and honest evening review
            rituals. The tactile clarity of a paper planner with the computational precision of an OS.
          </p>

          {/* CTA Cluster */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 w-full sm:w-auto pointer-events-auto">
            <Link
              href="/sign-up"
              onClick={() => requestAnimationFrame(() => soundFX.playClick())}
              data-testid="link-landing-sign-up"
              className="inline-flex overlay-cta-h items-center justify-center gap-2 rounded-control bg-primary px-7 text-callout font-bold text-primary-foreground shadow-xl hover:brightness-110 active:scale-98 transition-all touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary whitespace-nowrap"
            >
              <span>Create your cadence</span>
              <ArrowRight size={16} />
            </Link>

            <Link
              href="/sign-in"
              onClick={() => requestAnimationFrame(() => soundFX.playClick())}
              data-testid="link-landing-sign-in"
              className="inline-flex overlay-cta-h items-center justify-center rounded-control border border-border-control bg-card/90 px-6 text-callout font-bold text-foreground hover:bg-surface-elevated active:scale-98 transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary backdrop-blur-md whitespace-nowrap"
            >
              Sign in
            </Link>

            {!isStandalone && (
              <Link
                href="/download"
                onClick={() => requestAnimationFrame(() => soundFX.playClick())}
                data-testid="link-landing-download"
                className="inline-flex overlay-cta-h items-center justify-center gap-2 rounded-control border border-border-control bg-card/90 px-5 text-callout font-bold text-foreground hover:bg-surface-elevated active:scale-98 transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary backdrop-blur-md whitespace-nowrap"
              >
                <Smartphone size={16} className="text-primary-text" />
                <span>Download APK</span>
              </Link>
            )}
          </div>

          {/* Architectural Proof Bar */}
          <div className="pt-3 flex flex-wrap items-center gap-x-6 gap-y-2.5 text-caption text-muted-foreground pointer-events-auto">
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-status-success-text" />
              <span className="font-semibold text-foreground">Postgres RLS Isolation</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Send size={14} className="text-primary-text" />
              <span className="font-semibold text-foreground">Two-Way Telegram Webhook</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Flame size={14} className="text-accent" />
              <span className="font-semibold text-foreground">Strict Streaks · Zero Freeze</span>
            </div>
          </div>
        </div>
      </div>

      {/* Atmospheric Bottom Gradient Fade into subsequent sections */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-background via-background/60 to-transparent z-10"
        aria-hidden="true"
      />
    </section>
  );
}
