import { ArrowRight, Download, Shield, Volume2, VolumeX, Sparkles } from 'lucide-react';
import { Link } from 'wouter';
import { useState } from 'react';
import { soundFX } from '@/lib/sound-fx';
import { useIsStandalone } from '@/lib/use-standalone';
import { TiltCard3D } from './TiltCard3D';

export function LandingFooter() {
  const isStandalone = useIsStandalone();
  const [soundEnabled, setSoundEnabled] = useState(() => soundFX.isEnabled());

  const handleToggleSound = () => {
    const next = soundFX.toggle();
    setSoundEnabled(next);
  };

  return (
    <footer className="relative w-full border-t border-border-control bg-background/80 backdrop-blur-xl pt-16 pb-12 overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* 3D Call to Action Banner */}
        <TiltCard3D maxTilt={4} sheen glow="amber" className="p-8 sm:p-14 text-center shadow-2xl relative">
          {/* Volumetric Radial Aura Backlight */}
          <div
            className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden rounded-2xl"
            aria-hidden="true"
          >
            <div
              className="w-[120%] h-[150%] opacity-45 blur-3xl"
              style={{
                background:
                  'radial-gradient(ellipse 70% 60% at 50% 50%, color-mix(in srgb, var(--primary) 22%, transparent) 0%, color-mix(in srgb, var(--status-info-text) 8%, transparent) 45%, transparent 75%)',
              }}
            />
          </div>

          <div className="relative z-10 max-w-2xl mx-auto space-y-4" style={{ transform: 'translateZ(20px)' }}>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border-control bg-card/90 px-3 py-1 font-mono text-caption uppercase tracking-wider text-muted-foreground shadow-sm">
              <Sparkles size={12} className="text-primary-text" />
              <span>Begin Your Rhythm</span>
            </div>

            <h2 className="text-title1 sm:text-display2 font-extrabold tracking-tight text-foreground drop-shadow-sm">
              Reclaim your focus.
            </h2>
            <p className="text-caption sm:text-callout leading-relaxed text-muted-foreground">
              Replace the clutter of scattered to-do apps with a unified rhythm that compounds every single day.
            </p>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
              <Link
                href="/sign-up"
                onClick={() => requestAnimationFrame(() => soundFX.playClick())}
                data-testid="link-footer-sign-up"
                className="w-full sm:w-auto inline-flex overlay-cta-h items-center justify-center gap-2 rounded-control bg-primary px-8 text-callout font-bold text-primary-foreground shadow-xl hover:brightness-110 active:scale-98 transition-all touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary whitespace-nowrap"
              >
                <span>Get Started Free</span>
                <ArrowRight size={16} />
              </Link>

              <Link
                href="/sign-in"
                onClick={() => requestAnimationFrame(() => soundFX.playClick())}
                data-testid="link-footer-sign-in"
                className="w-full sm:w-auto inline-flex overlay-cta-h items-center justify-center rounded-control border border-border-control bg-card/90 px-6 text-callout font-bold text-foreground hover:bg-surface-elevated active:scale-98 transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary backdrop-blur-md whitespace-nowrap"
              >
                Sign in
              </Link>

              {!isStandalone && (
                <Link
                  href="/download"
                  onClick={() => requestAnimationFrame(() => soundFX.playClick())}
                  data-testid="link-footer-download"
                  className="w-full sm:w-auto inline-flex overlay-cta-h items-center justify-center gap-2 rounded-control border border-border-control bg-card/90 px-5 text-callout font-bold text-foreground hover:bg-surface-elevated active:scale-98 transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary backdrop-blur-md whitespace-nowrap"
                >
                  <Download size={16} className="text-primary-text" />
                  <span>Download APK</span>
                </Link>
              )}
            </div>
          </div>
        </TiltCard3D>

        {/* Security & Multi-User Guarantee */}
        <div className="mt-12 flex items-center justify-center gap-2 text-caption text-muted-foreground">
          <Shield size={14} className="text-primary-text" />
          <span>Multi-user safe · Row-Level Security · Zero third-party trackers · MIT Licensed</span>
        </div>

        {/* Bottom Metadata & Acoustic Toggle */}
        <div className="mt-8 pt-8 border-t border-border-control/50 flex flex-col sm:flex-row items-center justify-between gap-4 text-caption text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="grid size-6 place-items-center rounded bg-primary text-primary-foreground font-mono font-bold text-caption shadow-sm">
              C
            </div>
            <span className="font-mono font-semibold text-foreground">Cadence OS</span>
            <span>·</span>
            <span>Personal Task & Time Management</span>
          </div>

          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={handleToggleSound}
              className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
              title={soundEnabled ? 'Mute acoustic effects' : 'Enable acoustic effects'}
            >
              {soundEnabled ? <Volume2 size={14} className="text-primary-text" /> : <VolumeX size={14} />}
              <span>{soundEnabled ? 'Audio Active' : 'Muted'}</span>
            </button>
            <Link href="/download" className="hover:text-foreground transition-colors">
              Android APK
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <span className="font-mono text-caption">v0.1.6</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
