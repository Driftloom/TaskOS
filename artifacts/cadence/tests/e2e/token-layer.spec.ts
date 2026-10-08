import { expect } from '@playwright/test';
import { CONTRAST_HELPER, installMockApi, test } from './fixtures';

/**
 * Regression coverage for two changes whose visual effect had only been verified
 * at the token level, in a generated file, on 2026-10-07. Both are the kind of
 * change that reads as obviously correct in a diff and silently renders wrong,
 * so both are pinned here against what the browser actually computes.
 *
 *   1. The P8 radius scale. `--radius-*` is the namespace `rounded-*` resolves
 *      against, and the values are NOT Tailwind's defaults (lg is 20px where
 *      Tailwind ships 8px). 511 rendered radii changed. `rounded-2xl` was
 *      remapped to `rounded-lg` because P8 defines no 2xl step and leaving
 *      Tailwind's 16px in place would have put 2xl BELOW lg at 20px.
 *
 *   2. The high-contrast component layer. Until bd9ac54 the
 *      `prefers-contrast: more` block wrote `--components-sidebar-*` while the
 *      wired namespace was `--component-sidebar-*`, so high-contrast mode
 *      overrode nothing in the component layer. These tests are the only
 *      evidence the fix works; nothing else in the ladder exercises a media
 *      query on a custom property.
 *
 * Assertions are on computed values and resolved custom properties. No test here
 * asserts a class name, because a class name proves intent and not effect.
 */

async function bootToday(page: import('@playwright/test').Page) {
  await page.addInitScript(CONTRAST_HELPER);
  await installMockApi(page);
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('cadence_test_auth', 'true');
    } catch {
      /* the ?test_auth=true query param is the fallback */
    }
  });
  await page.goto('/today?test_auth=true', { waitUntil: 'commit' });
  await expect(page.getByTestId('button-theme-toggle')).toBeVisible({ timeout: 45_000 });
}

/** Resolves a custom property on :root to its computed rgb()/string form. */
async function rootVar(page: import('@playwright/test').Page, name: string): Promise<string> {
  return page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  );
}

/**
 * Normalises a length token to px. tokens.json authors these in rem, so asserting
 * `"6px"` against a computed `"0.375rem"` fails on units rather than on value.
 * An earlier version of this test made exactly that mistake.
 */
async function rootVarPx(page: import('@playwright/test').Page, name: string): Promise<number> {
  const raw = await rootVar(page, name);
  const m = /^(-?[\d.]+)(rem|px)$/.exec(raw);
  if (!m) throw new Error(`${name} is not a length token: ${JSON.stringify(raw)}`);
  return m[2] === 'rem' ? Number.parseFloat(m[1]) * 16 : Number.parseFloat(m[1]);
}

test.describe('P7 typography scale', () => {
  /**
   * Values as emitted on 2026-10-07, read out of tokens.css. Asserted literally
   * rather than derived from tokens.json on purpose: if the emitter and the
   * source of truth ever disagree, a test that reads both sides and compares
   * them can only report that they differ. A literal pins what the app actually
   * renders, so a silent change becomes a visible test failure.
   */
  const SCALE: Record<string, { px: number; weight: number; lineHeight: number }> = {
    caption: { px: 12, weight: 500, lineHeight: 16 },
    footnote: { px: 13, weight: 400, lineHeight: 18 },
    micro: { px: 14, weight: 400, lineHeight: 20 },
    subhead: { px: 15, weight: 400, lineHeight: 20 },
    callout: { px: 16, weight: 400, lineHeight: 22 },
    body: { px: 17, weight: 400, lineHeight: 24 },
    headline: { px: 17, weight: 600, lineHeight: 22 },
    macro: { px: 18, weight: 400, lineHeight: 28 },
    title3: { px: 20, weight: 600, lineHeight: 25 },
    title2: { px: 22, weight: 600, lineHeight: 28 },
    display1: { px: 24, weight: 400, lineHeight: 32 },
    title1: { px: 28, weight: 700, lineHeight: 34 },
    display2: { px: 30, weight: 400, lineHeight: 36 },
    'large-title': { px: 34, weight: 700, lineHeight: 41 },
    display3: { px: 36, weight: 400, lineHeight: 40 },
    timer: { px: 56, weight: 600, lineHeight: 56 },
  };

  test('every step renders its declared size, weight and leading', async ({ page }) => {
    await bootToday(page);

    const measured = await page.evaluate((steps) => {
      const probe = document.createElement('div');
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      document.body.appendChild(probe);
      const out: Record<string, { px: number; weight: number; lineHeight: number }> = {};
      for (const [step] of Object.entries(steps)) {
        probe.className = `text-${step}`;
        const cs = getComputedStyle(probe);
        out[step] = {
          px: Number.parseFloat(cs.fontSize),
          weight: Number(cs.fontWeight),
          lineHeight: Number.parseFloat(cs.lineHeight),
        };
      }
      probe.remove();
      return out;
    }, SCALE);

    const rows: string[] = [];
    const bad: string[] = [];
    for (const [step, want] of Object.entries(SCALE)) {
      const got = measured[step];
      const ok = got.px === want.px && got.weight === want.weight && got.lineHeight === want.lineHeight;
      rows.push(`  ${ok ? 'PASS' : 'FAIL'}  text-${step}  ${got.px}px/${got.weight}/${got.lineHeight}px`);
      if (!ok) {
        bad.push(
          `text-${step}: expected ${want.px}px/${want.weight}/${want.lineHeight}px, ` +
            `got ${got.px}px/${got.weight}/${got.lineHeight}px`,
        );
      }
    }
    console.log(`P7 typography scale in the browser:\n${rows.join('\n')}`);
    expect(bad.join('\n'), bad.join('\n')).toBe('');
  });

  test('the scale never falls below the 12px floor P7 sets for caption', async ({ page }) => {
    await bootToday(page);

    // P7's one hard typographic rule: type.caption is the floor, and P8.4 repeats
    // it for density. A scale step below 12px would be unreadable on a phone,
    // which is this app's primary surface.
    const sizes = await page.evaluate((steps) => {
      const probe = document.createElement('div');
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      document.body.appendChild(probe);
      const out: Record<string, number> = {};
      for (const step of steps) {
        probe.className = `text-${step}`;
        out[step] = Number.parseFloat(getComputedStyle(probe).fontSize);
      }
      probe.remove();
      return out;
    }, Object.keys(SCALE));

    const below = Object.entries(sizes).filter(([, px]) => px < 12);
    expect(
      below.map(([s, px]) => `${s}=${px}px`).join(', '),
      'a P7 step renders below the 12px caption floor',
    ).toBe('');
  });

  test('no raw Tailwind size utilities remain outside the token scale', async ({ page }) => {
    await bootToday(page);

    // Guards the migration itself. `text-sm`, `text-base`, `text-lg` and the
    // arbitrary values bypass the scale entirely, so a reintroduction would
    // render correctly and still be off-system. Measured by walking the live DOM
    // rather than grepping source, because that is what actually paints.
    //
    // Colour utilities share the `text-` prefix (`text-foreground`,
    // `text-muted-foreground`, `text-sidebar-primary`), so they are separated by
    // MEASUREMENT rather than by an allowlist: a size utility changes
    // font-size, a colour utility does not. An earlier version of this test kept
    // a list of known colour tokens and flagged `text-foreground` as an unknown
    // type step, which is a false positive that would have trained readers to
    // ignore this test.
    const offScale = await page.evaluate(() => {
      const TOKEN_STEPS = new Set([
        'micro', 'caption', 'footnote', 'subhead', 'callout', 'body', 'headline', 'macro',
        'title3', 'title2', 'title1', 'large-title', 'display1', 'display2', 'display3',
        'display4', 'timer',
      ]);
      const probe = document.createElement('div');
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      document.body.appendChild(probe);
      const baseline = (() => {
        probe.className = '';
        return getComputedStyle(probe).fontSize;
      })();
      const changesFontSize = (cls: string) => {
        probe.className = cls;
        return getComputedStyle(probe).fontSize !== baseline;
      };

      const offenders: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
        for (const cls of Array.from(el.classList)) {
          const m = /^text-(.+)$/.exec(cls);
          if (!m) continue;
          const rest = m[1];
          if (rest.includes('/')) continue; // text-<size>/<leading> modifier
          if (!changesFontSize(`text-${rest}`)) continue; // a colour utility
          if (!TOKEN_STEPS.has(rest)) {
            offenders.push(`text-${rest} on <${el.tagName.toLowerCase()}>`);
          }
        }
      }
      probe.remove();
      return Array.from(new Set(offenders));
    });

    expect(
      offScale.join('\n'),
      'off-scale text utilities are rendering again; the P7 migration is incomplete',
    ).toBe('');
  });
});

test.describe('sizing and container utilities resolve', () => {
  test('every @utility dimension resolves to a real box, not a silent no-op', async ({ page }) => {
    await bootToday(page);

    /*
     * The failure this guards against has already happened twice in this repo.
     * `min-h-*`, `max-w-*` and `min-w-*` resolve ONLY from Tailwind's `--spacing`
     * namespace, so migrating `min-h-[40px]` to `min-h-size-control-md` emits
     * ZERO CSS: the class is valid, typecheck passes, lint sees nothing wrong,
     * tokens:check compares generated files that never changed, and the build
     * SUCCEEDS. 47 markup sites then carried classes that did nothing and
     * min-height silently fell back to `auto`.
     *
     * Nothing short of measuring the rendered result catches that, which is why
     * this asserts a non-zero computed box rather than the presence of a class.
     */
    // Property names are read from the @utility bodies in index.css, not guessed.
    // Six of the fourteen below were initially asserted against the wrong
    // property (e.g. dialog-surface sets max-width, not max-height), which reported
    // a dead class that was in fact working perfectly.
    const probes: Array<{ cls: string; prop: 'height' | 'width' | 'maxHeight' | 'maxWidth' | 'minWidth' | 'minHeight' }> = [
      { cls: 'control-md-h', prop: 'height' },
      { cls: 'control-sm-h', prop: 'height' },
      { cls: 'control-lg-w', prop: 'width' },
      { cls: 'tap-target-h', prop: 'height' },
      { cls: 'overlay-cta-h', prop: 'height' },
      { cls: 'overlay-action-h', prop: 'height' },
      { cls: 'filter-chip-h', prop: 'height' },
      { cls: 'density-control', prop: 'height' },
      { cls: 'dialog-surface', prop: 'maxWidth' },
      { cls: 'menu-surface', prop: 'minWidth' },
      { cls: 'side-panel', prop: 'maxWidth' },
      { cls: 'app-canvas', prop: 'maxWidth' },
      { cls: 'calendar-cell', prop: 'minHeight' },
      { cls: 'automation-card', prop: 'minHeight' },
    ];

    const dead = await page.evaluate((list) => {
      const out: string[] = [];
      for (const { cls, prop } of list) {
        const probe = document.createElement('div');
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.className = cls;
        document.body.appendChild(probe);
        const cs = getComputedStyle(probe);
        const raw = cs[prop as 'height'];
        const value = Number.parseFloat(raw);
        // A resolved utility gives a positive length. A dead class leaves the
        // Tailwind default (auto -> NaN, or content/0px) in place.
        if (!Number.isFinite(value) || value <= 0) out.push(`${cls} -> ${prop}: ${raw}`);
        probe.remove();
      }
      return out;
    }, probes);

    expect(
      dead.join('\n'),
      'these sizing utilities emit no CSS, so they are dead classes doing nothing. ' +
        'A successful build does not mean a class works.',
    ).toBe('');
  });
});

test.describe('P8 radius scale', () => {
  test('the token scale matches the canonical spec, not Tailwind defaults', async ({ page }) => {
    await bootToday(page);

// docs/13-master-design-system-prompt.md P8: xs 6 - sm 10 - md 14 - lg 20 - xl 28.
    // Compared in px because tokens.json authors these in rem.
    const expected: Record<string, number> = {
      '--radius-xs': 6,
      '--radius-sm': 10,
      '--radius-control': 12,
      '--radius-md': 14,
      '--radius-lg': 20,
      '--radius-xl': 28,
    };
    for (const [name, want] of Object.entries(expected)) {
      expect(await rootVarPx(page, name), `${name} does not match the P8 spec`).toBe(want);
    }

    // Tailwind's defaults are 4/6/8/12px. If any of these resolve to the
    // default, the token is declared but not emitted, which is the exact bug
    // class that hit space/duration/zIndex/radius before 2026-10-07.
    expect(await rootVarPx(page, '--radius-lg'), 'rounded-lg silently fell back to the Tailwind default').not.toBe(8);
  });

  test('rounded-* utilities resolve to the token scale in the browser', async ({ page }) => {
    await bootToday(page);

    // Measure what a real element computes, not what the token says. If the
    // utility stopped resolving against --radius-*, these would be Tailwind's
    // defaults while the token test above still passed.
    const measured = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      document.body.appendChild(probe);
      const read = (cls: string) => {
        probe.className = cls;
        return getComputedStyle(probe).borderRadius;
      };
      const out = {
        sm: read('rounded-sm'),
        control: read('rounded-control'),
        md: read('rounded-md'),
        lg: read('rounded-lg'),
        xl: read('rounded-xl'),
      };
      probe.remove();
      return out;
    });

    expect(measured.sm, 'rounded-sm should compute to the 10px token').toBe('10px');
    expect(measured.control, 'rounded-control should compute to the 12px token').toBe('12px');
    expect(measured.md, 'rounded-md should compute to the 14px token').toBe('14px');
    expect(measured.lg, 'rounded-lg should compute to the 20px token').toBe('20px');
    expect(measured.xl, 'rounded-xl should compute to the 28px token').toBe('28px');
  });

  test('the scale is monotonic, so nothing renders LESS rounded than a smaller step', async ({ page }) => {
    await bootToday(page);

    const steps = ['xs', 'sm', 'control', 'md', 'lg', 'xl'];
    const px: number[] = [];
    for (const s of steps) {
      px.push(await rootVarPx(page, `--radius-${s}`));
    }
    for (let i = 1; i < px.length; i++) {
      expect(
        px[i],
        `radius scale is not monotonic at ${steps[i]} (${px[i]}px after ${steps[i - 1]} at ${px[i - 1]}px); ` +
          'a lower step must never render larger-radius than the step above it',
      ).toBeGreaterThan(px[i - 1]);
    }
  });
});

test.describe('high-contrast component layer', () => {
  test('prefers-contrast: more actually reaches the component namespace', async ({ page }) => {
    await bootToday(page);

    // Baseline: the unscoped dark default.
    await page.emulateMedia({ contrast: 'no-preference' });
    const normal = await rootVar(page, '--component-sidebar-background');
    expect(normal, 'the component sidebar token should resolve at baseline').not.toBe('');

    // The wired namespace must move when the user asks for more contrast. Before
    // bd9ac54 this never changed, because the media block wrote the plural
    // --components-sidebar-* name that nothing reads.
    await page.emulateMedia({ contrast: 'more' });
    const boosted = await rootVar(page, '--component-sidebar-background');
    expect(
      boosted,
      'prefers-contrast: more did not change --component-sidebar-background; ' +
        'the high-contrast block is writing a variable name nothing reads',
    ).not.toBe(normal);
    expect(boosted, 'the high-contrast sidebar should be pure black').toBe('#000000');
  });

  test('the dead plural namespace is gone, not merely unused', async ({ page }) => {
    await bootToday(page);
    await page.emulateMedia({ contrast: 'more' });

    // Asserting absence, because the failure mode was presence: a token family
    // emitted under a second name looks like working coverage to any tool that
    // only checks "is there a variable for this concept?".
    const plural = await rootVar(page, '--components-sidebar-background');
    expect(plural, 'the plural --components-* shadow namespace is back').toBe('');

    const singular = await rootVar(page, '--component-sidebar-background');
    expect(singular, 'the wired singular namespace must still resolve').not.toBe('');
  });

  test('the sidebar utility alias follows the component token, not a stale copy', async ({ page }) => {
    await bootToday(page);

    // --color-sidebar is the Tailwind-facing alias that `bg-sidebar` resolves
    // against, and it is authored as `var(--component-sidebar-background)`.
    // getComputedStyle substitutes custom-property references at computed-value
    // time, so the alias reads back as the literal it points at -- an earlier
    // version of this test asserted the raw text contained "var(" and failed for
    // exactly that reason. The contract worth pinning is that the alias and its
    // source stay equal, and that a real element resolves to the boosted value.
    const read = async () => {
      await page.emulateMedia({ contrast: 'more' });
      return page.evaluate(() => {
        const s = getComputedStyle(document.documentElement);
        const probe = document.createElement('div');
        probe.style.color = 'var(--color-sidebar)';
        document.body.appendChild(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return {
          alias: s.getPropertyValue('--color-sidebar').trim(),
          source: s.getPropertyValue('--component-sidebar-background').trim(),
          resolved,
        };
      });
    };

    const hc = await read();
    expect(
      hc.alias,
      '--color-sidebar drifted from --component-sidebar-background; the alias must not be a stale literal copy',
    ).toBe(hc.source);
    expect(hc.resolved, 'bg-sidebar did not resolve to the high-contrast black').toBe('rgb(0, 0, 0)');

    await page.emulateMedia({ contrast: 'no-preference' });
    const normal = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        alias: s.getPropertyValue('--color-sidebar').trim(),
        source: s.getPropertyValue('--component-sidebar-background').trim(),
      };
    });
    expect(normal.alias, 'the alias must track its source at baseline too').toBe(normal.source);
  });
});