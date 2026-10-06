import { useState } from 'react';
import {
  Flame,
  CheckCircle2,
  Clock,
  Sparkles,
  Layers,
  Target,
} from 'lucide-react';
import { ActivityRings } from '@/components/shared/ActivityRings';
import { useDensity, type DensityMode } from '@/components/chrome/DensityProvider';

export function DesignCatalogPage() {
  const { density, setDensity } = useDensity();
  const [selectedDensity, setSelectedDensity] = useState<DensityMode>(density);

  const colorTokens = [
    {
      name: 'Background & Surface',
      role: 'App Canvas',
      bgClass: 'bg-background',
      textClass: 'text-foreground',
      borderClass: 'border-border-control',
      notes: 'OLED True Black in dark mode, Apple Fog in light mode.',
    },
    {
      name: 'Card & Panel',
      role: 'Primary Containers',
      bgClass: 'bg-card',
      textClass: 'text-foreground',
      borderClass: 'border-border-control',
      notes: 'Elevation 1 surface. Subtle 1px border with WCAG 3:1 control border.',
    },
    {
      name: 'Energy Accent (Primary)',
      role: 'Action & Momentum',
      bgClass: 'bg-primary',
      textClass: 'text-primary-foreground',
      borderClass: 'border-primary',
      notes: 'Apple Energy Orange token. Start CTAs, focus indicators and streaks.',
    },
    {
      name: 'Success Completion',
      role: 'Tasks Finished',
      bgClass: 'bg-status-success-fill',
      textClass: 'text-foreground',
      borderClass: 'border-status-success-fill',
      notes: 'Vibrant green semantic token. Paired with CheckCircle2 icon.',
    },
    {
      name: 'Urgent / Overdue',
      role: 'At-risk Deadlines',
      bgClass: 'bg-status-danger-fill',
      textClass: 'text-foreground',
      borderClass: 'border-status-danger-fill',
      notes: 'High-visibility red semantic token. Paired with AlertTriangle icon.',
    },
    {
      name: 'Scheduled / Calendar',
      role: 'Time Blocks & Next Up',
      bgClass: 'bg-accent',
      textClass: 'text-accent-foreground',
      borderClass: 'border-accent',
      notes: 'System Blue semantic token. Paired with Clock icon.',
    },
    {
      name: 'AI / Memory Subsystem',
      role: 'Learned Patterns & Agent',
      bgClass: 'bg-ai-fill',
      textClass: 'text-primary-foreground',
      borderClass: 'border-ai-fill',
      notes: 'System Indigo semantic token. Paired with Sparkles icon.',
    },
  ];

  const typeTokens = [
    { name: 'Timer', class: 'text-timer', size: '56px / 3.5rem', weight: '600' },
    { name: 'Large Title', class: 'text-large-title', size: '34px / 2.125rem', weight: '700' },
    { name: 'Title 1', class: 'text-title1', size: '28px / 1.75rem', weight: '700' },
    { name: 'Title 2', class: 'text-title2', size: '22px / 1.375rem', weight: '600' },
    { name: 'Title 3', class: 'text-title3', size: '20px / 1.25rem', weight: '600' },
    { name: 'Headline', class: 'text-headline', size: '17px / 1.0625rem', weight: '600' },
    { name: 'Body', class: 'text-body', size: '17px / 1.0625rem', weight: '400' },
    { name: 'Callout', class: 'text-callout', size: '16px / 1rem', weight: '400' },
    { name: 'Subhead', class: 'text-subhead', size: '15px / 0.9375rem', weight: '400' },
    { name: 'Footnote', class: 'text-footnote', size: '13px / 0.8125rem', weight: '400' },
    { name: 'Caption', class: 'text-caption', size: '12px / 0.75rem', weight: '500' },
  ];

  return (
    <div className="container max-w-5xl mx-auto py-12 px-4 space-y-12">
      {/* Header */}
      <header className="space-y-3 border-b border-border-control pb-8">
        <div className="flex items-center gap-2 text-primary-text font-mono text-xs uppercase tracking-widest font-bold">
          <Layers size={14} />
          <span>Cadence Design System (P1–P32 Canonical Specification)</span>
        </div>
        <h1 className="text-large-title text-foreground">Interactive Design Catalog</h1>
        <p className="text-body text-muted-foreground max-w-2xl">
          Visual contract showroom verifying Apple Human Interface Guidelines tokens, 
          WCAG 2.1 AA/AAA contrast ratios, 11-step typography scale, responsive density, 
          and vestibular motion safety.
        </p>
      </header>

      {/* Color Palette Section */}
      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-accent" />
          <h2 className="text-title2 text-foreground font-bold">Semantic Color System</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {colorTokens.map((token) => (
            <div
              key={token.name}
              className="card-enterprise rounded-xl p-4 border border-border-control space-y-3"
            >
              <div
                className={`h-16 w-full rounded-lg ${token.bgClass} ${token.borderClass} border flex items-center justify-center font-mono text-xs font-bold ${token.textClass}`}
              >
                Sample Swatch
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground">{token.name}</h3>
                <p className="font-mono text-xs text-primary-text">{token.role}</p>
                <p className="text-xs text-muted-foreground mt-1">{token.notes}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Typography Scale Section */}
      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <Layers className="size-5 text-accent" />
          <h2 className="text-title2 text-foreground font-bold">11-Step Typography Scale</h2>
        </div>
        <div className="card-enterprise rounded-xl border border-border-control p-6 space-y-6">
          {typeTokens.map((t) => (
            <div
              key={t.name}
              className="flex flex-col sm:flex-row sm:items-baseline justify-between border-b border-border-control/40 pb-4 gap-2"
            >
              <div className="min-w-44">
                <span className="font-mono text-xs text-muted-foreground uppercase">{t.name}</span>
                <span className="block font-mono text-xs text-muted-foreground/80">{t.size} · w{t.weight}</span>
              </div>
              <div className={`text-foreground flex-1 truncate ${t.class}`}>
                Cadence Focus and Flow
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Density System Preview */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="size-5 text-accent" />
            <h2 className="text-title2 text-foreground font-bold">Display Density System (§8.4 P1)</h2>
          </div>
          <div className="flex gap-2">
            {(['comfortable', 'default', 'compact'] as DensityMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  setSelectedDensity(mode);
                  setDensity(mode);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors tap-target-expand ${
                  selectedDensity === mode
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-foreground border-border-control hover:bg-muted'
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="card-enterprise rounded-xl border border-border-control p-6 space-y-4">
          <p className="text-xs text-muted-foreground">
            Current active density mode: <strong className="text-foreground uppercase">{selectedDensity}</strong>.
            (Compact is gated to fine-pointer devices to ensure 44px touch targets on mobile).
          </p>
          <div className="space-y-2">
            {[
              { title: 'Deep Work Session on Architecture', time: '50m', tag: 'Core' },
              { title: 'Zero-Trust Verification Audit', time: '30m', tag: 'Quality' },
              { title: 'Plan Evening Ritual and Sync Inbox', time: '15m', tag: 'Ritual' },
            ].map((item, idx) => (
              <div
                key={idx}
                className="card-enterprise row-density rounded-xl border border-border-control bg-card flex items-center justify-between px-4 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="size-4 rounded-full border border-border-control" />
                  <span className="text-sm font-medium text-foreground">{item.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{item.time}</span>
                  <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-foreground border border-border-control">
                    {item.tag}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Activity Rings & Visual Momentum */}
      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <Flame className="size-5 text-primary-text" />
          <h2 className="text-title2 text-foreground font-bold">Activity Rings Momentum</h2>
        </div>
        <div className="card-enterprise rounded-xl border border-border-control p-8 flex flex-col sm:flex-row items-center justify-around gap-8">
          <div className="flex flex-col items-center gap-3">
            <ActivityRings
              tasksCompleted={7}
              tasksTotal={10}
              roundsCompleted={4}
              roundTarget={6}
              streakDays={14}
              size={140}
            />
            <span className="font-mono text-xs text-muted-foreground">Standard Interactive Rings</span>
          </div>
          <div className="space-y-3 max-w-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <span className="size-3 rounded-full bg-primary" />
              <span>Outer: Tasks Done (7/10)</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <span className="size-3 rounded-full bg-status-success-fill" />
              <span>Middle: Focus Time (120/150m)</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <span className="size-3 rounded-full bg-accent" />
              <span>Center: Unbroken Streak (14 Days)</span>
            </div>
            <p className="text-xs text-muted-foreground pt-2 border-t border-border-control">
              Vestibular safety: Rings observe <code className="text-primary-text font-mono">prefers-reduced-motion</code> and the in-app accessibility toggle.
            </p>
          </div>
        </div>
      </section>

      {/* Interactive Controls & Safety Targets */}
      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-accent" />
          <h2 className="text-title2 text-foreground font-bold">Touch Safety & Button System</h2>
        </div>
        <div className="card-enterprise rounded-xl border border-border-control p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <button className="btn-primary">
              <Flame size={14} className="mr-1.5" />
              <span>Primary CTA (.btn-primary)</span>
            </button>
            <button className="btn-secondary">
              <span>Secondary Button (.btn-secondary)</span>
            </button>
            <button className="tap-target-44 border border-border-control rounded-lg px-3 text-xs font-medium text-foreground bg-card">
              Guaranteed 44px Hit Box (.tap-target-44)
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            All interactive targets adhere strictly to Apple HIG 44×44px minimum target sizes with .tap-target-expand pseudo-elements for compact visuals.
          </p>
        </div>
      </section>
    </div>
  );
}

export default DesignCatalogPage;
