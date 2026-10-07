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

  // The P7 type scale, largest to smallest. Extended 2026-10-07 from 11 to 17
  // steps with micro / macro / display1-4, which were added at exactly the values
  // the raw Tailwind utilities already rendered so adopting them was a pure
  // rename. Values here must track tokens/tokens.json -- if you add a step there,
  // add it here, or this page under-reports the system it documents.
  const typeTokens = [
    { name: 'Timer', class: 'text-timer', size: '56px / 3.5rem', weight: '600' },
    { name: 'Display 4', class: 'text-display4', size: '60px / 3.75rem', weight: '400' },
    { name: 'Large Title', class: 'text-large-title', size: '34px / 2.125rem', weight: '700' },
    { name: 'Display 3', class: 'text-display3', size: '36px / 2.25rem', weight: '400' },
    { name: 'Display 2', class: 'text-display2', size: '30px / 1.875rem', weight: '400' },
    { name: 'Title 1', class: 'text-title1', size: '28px / 1.75rem', weight: '700' },
    { name: 'Display 1', class: 'text-display1', size: '24px / 1.5rem', weight: '400' },
    { name: 'Title 2', class: 'text-title2', size: '22px / 1.375rem', weight: '600' },
    { name: 'Title 3', class: 'text-title3', size: '20px / 1.25rem', weight: '600' },
    { name: 'Macro', class: 'text-macro', size: '18px / 1.125rem', weight: '400' },
    { name: 'Headline', class: 'text-headline', size: '17px / 1.0625rem', weight: '600' },
    { name: 'Body', class: 'text-body', size: '17px / 1.0625rem', weight: '400' },
    { name: 'Callout', class: 'text-callout', size: '16px / 1rem', weight: '400' },
    { name: 'Subhead', class: 'text-subhead', size: '15px / 0.9375rem', weight: '400' },
    { name: 'Micro', class: 'text-micro', size: '14px / 0.875rem', weight: '400' },
    { name: 'Footnote', class: 'text-footnote', size: '13px / 0.8125rem', weight: '400' },
    { name: 'Caption', class: 'text-caption', size: '12px / 0.75rem', weight: '500' },
  ];

  // Spatial scales. All four families now emit to the Tailwind @theme surface
  // (verified by `node scripts/build-tokens.cjs --check`, which fails if any
  // declared global.* family emits zero CSS). The radius values are the canonical
  // spec P8 scale, so they are printed from the token source rather than
  // hard-coded twice.
  const radiusSteps = [
    { name: 'Full', value: '9999px', varName: '--radius-full' },
    { name: 'XL', value: '1.75rem (28px)', varName: '--radius-xl' },
    { name: 'LG', value: '1.25rem (20px)', varName: '--radius-lg' },
    { name: 'MD', value: '0.875rem (14px)', varName: '--radius-md' },
    { name: 'SM', value: '0.625rem (10px)', varName: '--radius-sm' },
    { name: 'XS', value: '0.375rem (6px)', varName: '--radius-xs' },
    { name: 'None', value: '0', varName: '--radius-none' },
  ];

  const spacingSteps = [
    { name: '16', value: '4rem / 64px' },
    { name: '12', value: '3rem / 48px' },
    { name: '10', value: '2.5rem / 40px' },
    { name: '8', value: '2rem / 32px' },
    { name: '6', value: '1.5rem / 24px' },
    { name: '5', value: '1.25rem / 20px' },
    { name: '4', value: '1rem / 16px' },
    { name: '3', value: '0.75rem / 12px' },
    { name: '2', value: '0.5rem / 8px' },
    { name: '1', value: '0.25rem / 4px' },
    { name: '0', value: '0' },
  ];

  // Declared as @utility rules in index.css, because Tailwind v4 resolves
  // min-h-*/max-w-* from the --spacing namespace ONLY -- a custom token under any
  // other namespace emits no class at all. Each verified to resolve to its token
  // value by scripts/verify-sizing-utilities.cjs.
  const sizingUtilities = [
    { name: 'Control Md', cls: 'control-md-h', expected: '40px' },
    { name: 'Control Lg width', cls: 'control-lg-w', expected: '48px' },
    { name: 'Control Sm', cls: 'control-sm-h', expected: '32px' },
    { name: 'Tap target', cls: 'tap-target-h', expected: '44px' },
    { name: 'Primary CTA', cls: 'overlay-cta-h', expected: '46px' },
    { name: 'Secondary action', cls: 'overlay-action-h', expected: '42px' },
    { name: 'Filter chip', cls: 'filter-chip-h', expected: '38px' },
    { name: 'Calendar cell', cls: 'calendar-cell', expected: '212px' },
    { name: 'Automation card', cls: 'automation-card', expected: '92px' },
    { name: 'Menu surface', cls: 'menu-surface', expected: 'min 128px' },
    { name: 'Dialog surface', cls: 'dialog-surface', expected: 'max 420px' },
    { name: 'Side panel', cls: 'side-panel', expected: 'max 240px' },
    { name: 'App canvas', cls: 'app-canvas', expected: 'max 1680px' },
  ];

  const motionSteps = [
    { name: 'Deliberate', value: '480ms' },
    { name: 'Slow', value: '320ms' },
    { name: 'Base', value: '200ms' },
    { name: 'Fast', value: '120ms' },
    { name: 'Instant', value: '0ms' },
  ];

  return (
    <div className="container max-w-5xl mx-auto py-12 px-4 space-y-12">
      {/* Header */}
      <header className="space-y-3 border-b border-border-control pb-8">
        <div className="flex items-center gap-2 text-primary-text font-mono text-caption uppercase tracking-widest font-bold">
          <Layers size={14} />
          <span>Cadence Design System (P1–P32 Canonical Specification)</span>
        </div>
        <h1 className="text-large-title text-foreground">Interactive Design Catalog</h1>
        <p className="text-body text-muted-foreground max-w-2xl">
          Visual contract showroom verifying Apple Human Interface Guidelines tokens,
          WCAG 2.1 AA/AAA contrast ratios, the 17-step typography scale, the P8 radius
          and spacing scales, the sizing utilities, the P10 motion scale, responsive
          density, and vestibular motion safety.
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
                className={`h-16 w-full rounded-lg ${token.bgClass} ${token.borderClass} border flex items-center justify-center font-mono text-caption font-bold ${token.textClass}`}
              >
                Sample Swatch
              </div>
              <div>
                <h3 className="font-semibold text-micro text-foreground">{token.name}</h3>
                <p className="font-mono text-caption text-primary-text">{token.role}</p>
                <p className="text-caption text-muted-foreground mt-1">{token.notes}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Typography Scale Section */}
      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <Layers className="size-5 text-accent" />
          <h2 className="text-title2 text-foreground font-bold">17-Step Typography Scale</h2>
        </div>
        <div className="card-enterprise rounded-xl border border-border-control p-6 space-y-6">
          {typeTokens.map((t) => (
            <div
              key={t.name}
              className="flex flex-col sm:flex-row sm:items-baseline justify-between border-b border-border-control/40 pb-4 gap-2"
            >
              <div className="min-w-44">
                <span className="font-mono text-caption text-muted-foreground uppercase">{t.name}</span>
                <span className="block font-mono text-caption text-muted-foreground/80">{t.size} · w{t.weight}</span>
              </div>
              <div className={`text-foreground flex-1 truncate ${t.class}`}>
                Cadence Focus and Flow
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Spatial Scales: Radius, Spacing, Sizing, Motion */}
      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <Layers className="size-5 text-accent" />
          <h2 className="text-title2 text-foreground font-bold">Spatial &amp; Motion Scales</h2>
        </div>

        <div className="card-enterprise rounded-xl border border-border-control p-6 space-y-8">
          <div>
            <h3 className="text-headline font-semibold text-foreground mb-3">
              Radius — canonical spec P8 (xs 6 · sm 10 · md 14 · lg 20 · xl 28)
            </h3>
            <p className="text-caption text-muted-foreground mb-4">
              Emitted as <code className="font-mono">--radius-*</code>. These replaced
              Tailwind&apos;s defaults (4/6/8/12px); the app previously rendered off-spec.
            </p>
            <div className="flex flex-wrap gap-4">
              {radiusSteps.map((r) => (
                <div key={r.name} className="flex flex-col items-center gap-2 w-24">
                  <div
                    className="size-14 w-full border-2 border-border-control bg-card"
                    style={{ borderRadius: `var(${r.varName})` }}
                  />
                  <span className="font-mono text-caption font-semibold uppercase text-muted-foreground">
                    {r.name}
                  </span>
                  <span className="font-mono text-caption text-muted-foreground/80">{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-headline font-semibold text-foreground mb-3">
              Spacing — <code className="font-mono text-micro">--spacing-*</code>
            </h3>
            <div className="flex flex-col gap-2">
              {spacingSteps.map((s) => (
                <div key={s.name} className="flex items-center gap-3">
                  <span className="font-mono text-caption font-semibold uppercase text-muted-foreground w-8 text-right">
                    {s.name}
                  </span>
                  <div className="h-2 bg-accent rounded-xs" style={{ width: `var(--spacing-${s.name})` }} />
                  <span className="font-mono text-caption text-muted-foreground/80">{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-headline font-semibold text-foreground mb-3">
              Sizing utilities — <code className="font-mono text-micro">@utility</code> in
              index.css
            </h3>
            <p className="text-caption text-muted-foreground mb-4">
              Tailwind resolves <code className="font-mono">min-h-*</code>/
              <code className="font-mono">max-w-*</code> from <code className="font-mono">--spacing</code> only, so a
              custom token class would emit no CSS at all. These are explicit utilities
              reading token variables. Verified against browser-computed values by
              <code className="font-mono"> scripts/verify-sizing-utilities.cjs</code>.
            </p>
            <div className="flex flex-wrap gap-2">
              {sizingUtilities.map((u) => (
                <span
                  key={u.cls}
                  className={`inline-flex items-center rounded-lg border border-border-control bg-card px-3 py-2 ${u.cls}`}
                >
                  <span className="font-mono text-caption">{u.cls}</span>
                  <span className="font-mono text-caption text-muted-foreground ml-2">
                    {u.expected}
                  </span>
                </span>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-headline font-semibold text-foreground mb-3">
              Motion — <code className="font-mono text-micro">--duration-*</code> /{' '}
              <code className="font-mono text-micro">--ease-*</code>
            </h3>
            <div className="flex flex-wrap gap-2">
              {motionSteps.map((m) => (
                <span
                  key={m.name}
                  className="inline-flex items-center rounded-lg border border-border-control bg-card px-3 py-2"
                >
                  <span className="font-mono text-caption">duration-{m.name.toLowerCase()}</span>
                  <span className="font-mono text-caption text-muted-foreground ml-2">
                    {m.value}
                  </span>
                </span>
              ))}
            </div>
          </div>
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
                className={`px-3 py-1.5 rounded-lg text-caption font-medium border transition-colors tap-target-expand ${
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
          <p className="text-caption text-muted-foreground">
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
                  <span className="text-micro font-medium text-foreground">{item.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-caption text-muted-foreground">{item.time}</span>
                  <span className="font-mono text-caption px-1.5 py-0.5 rounded bg-muted text-foreground border border-border-control">
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
            <span className="font-mono text-caption text-muted-foreground">Standard Interactive Rings</span>
          </div>
          <div className="space-y-3 max-w-sm">
            <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
              <span className="size-3 rounded-full bg-primary" />
              <span>Outer: Tasks Done (7/10)</span>
            </div>
            <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
              <span className="size-3 rounded-full bg-status-success-fill" />
              <span>Middle: Focus Time (120/150m)</span>
            </div>
            <div className="flex items-center gap-2 text-caption font-semibold text-foreground">
              <span className="size-3 rounded-full bg-accent" />
              <span>Center: Unbroken Streak (14 Days)</span>
            </div>
            <p className="text-caption text-muted-foreground pt-2 border-t border-border-control">
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
            <button className="tap-target-44 border border-border-control rounded-lg px-3 text-caption font-medium text-foreground bg-card">
              Guaranteed 44px Hit Box (.tap-target-44)
            </button>
          </div>
          <p className="text-caption text-muted-foreground">
            All interactive targets adhere strictly to Apple HIG 44×44px minimum target sizes with .tap-target-expand pseudo-elements for compact visuals.
          </p>
        </div>
      </section>
    </div>
  );
}

export default DesignCatalogPage;
