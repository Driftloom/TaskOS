import { useState } from 'react';
import { ArrowRight, Download, Volume2, VolumeX } from 'lucide-react';
import { Link } from 'wouter';
import { soundFX } from '@/lib/sound-fx';
import { useIsStandalone } from '@/lib/use-standalone';

export function LandingHeader() {
  const isStandalone = useIsStandalone();
  const [soundEnabled, setSoundEnabled] = useState(() => soundFX.isEnabled());

  const handleToggleSound = () => {
    const next = soundFX.toggle();
    setSoundEnabled(next);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border-control bg-background/80 backdrop-blur-xl transition-colors">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand identity */}
        <Link
          href="/"
          onClick={() => requestAnimationFrame(() => soundFX.playClick())}
          className="group flex items-center gap-3 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-control"
        >
          <div className="grid size-9 place-items-center rounded-control bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
            <span className="font-mono text-callout font-bold">C</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-callout font-bold tracking-tight text-foreground">
              Cadence
            </span>
            <span className="hidden rounded-control border border-border-control bg-card px-1.5 py-0.5 font-mono text-caption text-muted-foreground sm:inline-block">
              v0.1.6
            </span>
          </div>
        </Link>

        {/* Action cluster */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Sound FX Toggle */}
          <button
            type="button"
            onClick={handleToggleSound}
            aria-label={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
            className="flex size-11 items-center justify-center rounded-control border border-border-control bg-card text-muted-foreground transition-colors hover:text-foreground hover:bg-surface-elevated active:scale-95 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            title={soundEnabled ? 'Acoustics active' : 'Acoustics muted'}
          >
            {soundEnabled ? (
              <Volume2 size={18} className="text-primary-text" />
            ) : (
              <VolumeX size={18} />
            )}
          </button>

          {/* Conditional APK link for non-standalone web view */}
          {!isStandalone && (
            <Link
              href="/download"
              onClick={() => requestAnimationFrame(() => soundFX.playClick())}
              className="hidden md:inline-flex h-11 items-center justify-center gap-1.5 rounded-control border border-border-control bg-card px-3.5 text-caption font-semibold text-foreground hover:bg-surface-elevated transition-colors active:scale-98 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary whitespace-nowrap"
            >
              <Download size={14} className="text-primary-text" />
              <span>APK</span>
            </Link>
          )}

          {/* Sign In link */}
          <Link
            href="/sign-in"
            onClick={() => requestAnimationFrame(() => soundFX.playClick())}
            data-testid="link-header-sign-in"
            className="inline-flex h-11 items-center justify-center rounded-control border border-border-control bg-card px-3.5 text-caption font-bold text-foreground hover:bg-surface-elevated transition-colors active:scale-98 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary whitespace-nowrap"
          >
            Sign in
          </Link>

          {/* Get Started primary CTA */}
          <Link
            href="/sign-up"
            onClick={() => requestAnimationFrame(() => soundFX.playClick())}
            data-testid="link-header-sign-up"
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-control bg-primary px-3 sm:px-4 text-caption font-bold text-primary-foreground shadow-sm hover:brightness-110 transition-all active:scale-98 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary whitespace-nowrap"
          >
            <span className="hidden sm:inline">Get Started</span>
            <span className="sm:hidden">Start</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </header>
  );
}
