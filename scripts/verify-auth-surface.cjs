/**
 * verify-auth-surface.cjs -- rendered-style probe for the Clerk auth surfaces
 * (/sign-in and /sign-up).
 *
 * WHY THIS EXISTS
 * ---------------
 * `verify-contrast.cjs` reads `tokens/tokens.json` and never opens a browser.
 * `verify-no-dead-classes.cjs` asks whether a class EMITS css. Neither can see a
 * cascade loss, and that is exactly how the defect in AUDIT-2026-10-10.md shipped
 * with contrast reporting 93/93 passing: the "Continue with Google" label rendered
 * at 1.22:1 while every token pair passed, because Clerk injects its component
 * stylesheet at runtime as an UNLAYERED constructable sheet that outranks the
 * app's bundled Tailwind layer. The class was present, emitted, and lost.
 *
 * This probe measures what the browser actually resolves. It is the same method
 * as verify-sizing-utilities.cjs, applied to a surface no existing gate could
 * reach.
 *
 * FAIL-CLOSED, DELIBERATELY
 * ------------------------
 * If Clerk's widget does not render, this EXITS NON-ZERO. A gate that reports
 * green when the thing it guards is unreachable is the same failure mode as the
 * 101-entry token-lint baseline that was pruned in 2026-10-07: it looked like a
 * safety net and was not one. A missing widget is a defect here, not a skip.
 *
 * This gate needs a browser and a reachable Clerk instance, which no other gate
 * in run-gates.cjs does. It is therefore deliberately EXCLUDED from
 * FAST_GATE_IDS and runs only in the full ladder.
 *
 * Usage:
 *   node scripts/verify-auth-surface.cjs            # assert, exit 1 on failure
 *   node scripts/verify-auth-surface.cjs --report   # print measurements, always exit 0
 */

'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const { chromium } = require(require.resolve('@playwright/test', {
  paths: [path.join(process.cwd(), 'artifacts', 'cadence')],
}));

const CADENCE_DIR = path.join(process.cwd(), 'artifacts', 'cadence');
const PORT = Number(process.env.AUTH_PROBE_PORT || 4174);
const BASE = `http://127.0.0.1:${PORT}`;
const REPORT_ONLY = process.argv.includes('--report');

/* vite's "exports" map does not expose ./bin/vite.js, so require.resolve cannot
 * reach it directly. Walk up from the resolved entry to the package root instead.
 * Under pnpm the entry resolves through a symlink into .pnpm, and that real path
 * is where bin/vite.js actually lives. */
function resolveViteBin() {
  const entry = require.resolve('vite', { paths: [CADENCE_DIR] });
  let dir = path.dirname(entry);
  while (dir !== path.dirname(dir)) {
    if (
      path.basename(dir) === 'vite' &&
      fs.existsSync(path.join(dir, 'package.json'))
    ) {
      const bin = path.join(dir, 'bin', 'vite.js');
      if (fs.existsSync(bin)) return bin;
    }
    dir = path.dirname(dir);
  }
  throw new Error('verify-auth-surface: could not locate vite/bin/vite.js');
}

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];
const THEMES = ['dark', 'light'];
const ROUTES = ['/sign-in', '/sign-up'];

/* Minimum usable content width inside the card on a 390px phone. The audit
 * measured 272px with 59px of wasted gutter on each side; 320 recovers most of
 * it while keeping the card visually a card. */
const MIN_CARD_CONTENT_W = 320;
const MIN_TAP = 44;
const MIN_TEXT_CONTRAST = 4.5;
const MIN_FONT_PX = 16; /* iOS Safari zooms the viewport on focus below this */

/* ------------------------------------------------------------------ *
 * Preview server
 * ------------------------------------------------------------------ */

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error(`preview server never came up at ${url}`));
        else setTimeout(attempt, 300);
      });
      req.setTimeout(2000, () => req.destroy());
    };
    attempt();
  });
}

async function startPreview() {
  /* Spawn vite's JS entry through the current node binary rather than shelling
   * out to `pnpm`. Two reasons: Windows refuses to spawn a bare `.cmd` without
   * `shell: true` (spawn EINVAL), and run-gates.cjs carries a standing
   * constraint that no gate script uses shell syntax.
   *
   * `vite/bin/vite.js` cannot be reached with require.resolve because vite's
   * package.json "exports" does not expose that subpath, so the package root is
   * found by walking up from the resolved entry instead. */
  const viteBin = resolveViteBin();

  /* vite.config.ts THROWS at config-load without PORT and BASE_PATH, and it is
   * evaluated even for `preview`, so both are injected into the child env
   * rather than passed as CLI flags. */
  const child = spawn(
    process.execPath,
    [viteBin, 'preview', '--port', String(PORT), '--strictPort'],
    {
      cwd: CADENCE_DIR,
      env: { ...process.env, PORT: String(PORT), BASE_PATH: '/', NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  await waitForServer(BASE, 60000);
  return child;
}

/* ------------------------------------------------------------------ *
 * In-page measurement
 *
 * The whole probe runs inside the page so every colour is flattened to a
 * concrete sRGB triple at the point of use. Handing computed strings back to
 * Node would mean a second colour parser, and parseColor() in contrast-lib
 * only understands hex from tokens.json -- not rgb(), color(srgb ...), or
 * color-mix() -- so it cannot consume these values at all.
 * ------------------------------------------------------------------ */

function collectInPage(spec) {
  const { sel, routes, viewports, themes, minCardContentW, minTap, minTextContrast, minFontPx } = spec;

  /* ---- colour helpers ---- */
  const toLin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const relLum = (rgb) => 0.2126 * toLin(rgb[0]) + 0.7152 * toLin(rgb[1]) + 0.0722 * toLin(rgb[2]);
  const contrast = (a, b) => {
    const l1 = relLum(a);
    const l2 = relLum(b);
    const hi = Math.max(l1, l2);
    const lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  };

  /* Accepts rgb()/rgba(), color(srgb r g b / a), and hex. Anything else is
   * reported as unparsed rather than silently coerced to black, which would
   * manufacture a passing number out of a value we did not understand. */
  const parseColor = (str) => {
    if (!str) return null;
    const s = String(str).trim();
    if (s === 'transparent') return [0, 0, 0, 0];
    let m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.%]+))?\s*\)$/i);
    if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : parseFloat(m[4])];
    m = s.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.%]+))?\s*\)$/i);
    if (m) {
      const a = m[4] === undefined ? 1 : parseFloat(m[4]) / (String(m[4]).includes('%') ? 100 : 1);
      return [Math.round(+m[1] * 255), Math.round(+m[2] * 255), Math.round(+m[3] * 255), a];
    }
    m = s.match(/^#([0-9a-f]{3,8})$/i);
    if (m) {
      let h = m[1];
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      if (h.length === 6) h += 'ff';
      if (h.length !== 8) return null;
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), parseInt(h.slice(6, 8), 16) / 255];
    }
    return null;
  };

  const composite = (fg, bg) => {
    const a = fg[3];
    return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
  };

  /* Walks ancestors until a background that actually paints is found, so a
   * transparent control is measured against what the user really sees. */
  const effectiveBg = (el) => {
    let node = el;
    let stack = [];
    while (node && node !== document.documentElement.parentNode) {
      const c = parseColor(getComputedStyle(node).backgroundColor);
      if (c && c[3] > 0) {
        stack.push(c);
        if (c[3] >= 0.999) break;
      }
      node = node.parentElement;
    }
    if (!stack.length) return [255, 255, 255, 1];
    let base = stack[stack.length - 1];
    for (let i = stack.length - 2; i >= 0; i--) base = composite(stack[i], base);
    return base;
  };

  /* Resolves an app token to a concrete colour the same way the app does:
   * read the raw HSL triple off :root, then let the browser resolve it. */
  const resolveToken = (tokenName) => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
    if (!raw) return null;
    const probe = document.createElement('div');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.color = tokenName.startsWith('--') && /^[-\d\s.%]+$/.test(raw) ? `hsl(${raw})` : raw;
    document.body.appendChild(probe);
    const resolved = parseColor(getComputedStyle(probe).color);
    probe.remove();
    return resolved;
  };

  const q = (root, selector) => root.querySelector(selector);
  const rgb3 = (c) => (c ? `${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])}` : '?');

  /* Text contrast of a label against the surface behind its own control. */
  const textContrast = (labelEl, bgOverride) => {
    if (!labelEl) return null;
    const fg = parseColor(getComputedStyle(labelEl).color);
    if (!fg) return null;
    const bg = bgOverride || effectiveBg(labelEl);
    const solid = composite(fg, bg);
    return {
      ratio: Math.round(contrast(solid, bg) * 100) / 100,
      fg: rgb3(solid),
      bg: rgb3(bg),
    };
  };

  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      w: Math.round(r.width * 100) / 100,
      h: Math.round(r.height * 100) / 100,
    };
  };

  const out = { runs: [], tokenRefs: {} };

  for (const route of routes) {
    for (const viewport of viewports) {
      for (const theme of themes) {
        /* --report mode is driven one page at a time by the caller; this is a
         * synchronous single-route collector. */
        const rec = { route, viewport: viewport.name, width: viewport.width, theme, checks: {} };
        const c = rec.checks;

        const card = q(document, '.cl-cardBox');
        const rootBox = q(document, '.cl-rootBox');
        const title = q(document, '.cl-headerTitle');
        const socialBtn = q(document, '.cl-socialButtonsBlockButton');
        const socialTxt = q(document, '.cl-socialButtonsBlockButtonText');
        const email = q(document, 'input[name="email"]') || q(document, '.cl-formFieldInput');
        const password = q(document, 'input[name="password"]');
        const showPw = q(document, '.cl-formFieldInputShowPasswordButton');
        const cta = q(document, '.cl-formButtonPrimary');
        const link = q(document, '.cl-footerActionLink');

        out.tokenRefs.primary = rgb3(resolveToken('--primary'));
        out.tokenRefs.accent = rgb3(resolveToken('--accent'));

        /* F1 + F5: CTA background must paint and must be the brand --primary,
         * not --accent. */
        if (cta) {
          const cs = getComputedStyle(cta);
          const bg = parseColor(cs.backgroundColor);
          c.ctaBackground = { value: cs.backgroundColor, rgb: rgb3(bg), alpha: bg ? bg[3] : null };
          c.ctaHeight = box(cta);
        }
        /* F2: social button label contrast against the button's own fill. */
        c.socialLabel = textContrast(socialTxt || socialBtn, socialBtn ? effectiveBg(socialBtn) : null);
        c.socialHeight = box(socialBtn);

        /* F3: border-width on every bordered control. A colour-only utility
         * leaves borderWidth at 0 because preflight zeroes it. */
        const borderOf = (el) => {
          if (!el) return null;
          const cs = getComputedStyle(el);
          return { width: cs.borderTopWidth, style: cs.borderTopStyle, color: cs.borderTopColor };
        };
        /* F3: a visible control boundary. Clerk ships a deliberately borderless
         * base (`[data-variant] { border-width: 0 }`), so the appearance object
         * has to draw the boundary some other way -- measured as either a real
         * border >=1px OR an inset box-shadow spread >=1px. Asserting borderWidth
         * alone would have reported FAIL against a control that is in fact
         * correctly drawn with an inset shadow. */
        const boundaryOf = (el) => {
          if (!el) return null;
          const cs = getComputedStyle(el);
          const bw = parseFloat(cs.borderTopWidth) || 0;
          const borderOk = cs.borderTopStyle !== 'none' && bw >= 1;
          const shadowStr = cs.boxShadow || '';
          const isInset = /inset/.test(shadowStr);
          const pxs = (shadowStr.match(/([\d.]+)px/g) || []).map((s) => parseFloat(s));
          const shadowOk = isInset && pxs.length > 0 && Math.max.apply(null, pxs) >= 1;
          const colourRaw = borderOk ? cs.borderTopColor : (pxs.length ? (shadowStr.match(/rgba?\([^)]+\)/) || [null])[0] : null);
          const colour = parseColor(colourRaw);
          const bg = effectiveBg(el.parentElement || el);
          const against = bg ? { ratio: Math.round(contrast(composite(colour || [0, 0, 0], bg), bg) * 100) / 100, bg: rgb3(bg) } : null;
          return {
            borderWidth: cs.borderTopWidth,
            borderStyle: cs.borderTopStyle,
            boxShadow: shadowStr.slice(0, 80),
            via: borderOk ? 'border' : shadowOk ? 'inset-shadow' : 'NONE',
            ok: borderOk || shadowOk,
            vs: against,
          };
        };
        c.boundarySocial = boundaryOf(socialBtn);
        c.boundaryEmail = boundaryOf(email);
        c.boundaryCta = boundaryOf(cta);
        c.borderSocial = borderOf(socialBtn);
        c.borderEmail = borderOf(email);
        c.borderCta = borderOf(cta);

        /* F4: show-password toggle visibility and hit area. */
        if (showPw) {
          c.showPassword = { ...box(showPw), contrast: textContrast(showPw) };
        }

        /* F6/F8: control heights and input type size. */
        c.emailHeight = box(email);
        c.emailFontPx = email ? Math.round(parseFloat(getComputedStyle(email).fontSize) * 100) / 100 : null;

        /* F7: footer link contrast. */
        c.link = { ...textContrast(link), color: link ? getComputedStyle(link).color : null, height: box(link) };

        /* F10: heading type step. */
        c.titleFontPx = title ? Math.round(parseFloat(getComputedStyle(title).fontSize) * 100) / 100 : null;

        /* F9: usable card content width at the phone size. */
        const cardBox = box(card);
        c.card = cardBox;
        if (card) {
          const inner = card.querySelector('form') || card;
          c.cardContent = box(inner);
          const cardCs = getComputedStyle(card);
          /* Report the REAL padding rather than inferring it from a width diff.
           * An earlier revision of this probe inferred the gutter and got the fix
           * backwards: `padding` was ADDED to Clerk's own 39px instead of
           * replacing it, taking card content from 280px down to 244px. */
          c.cardPad = {
            left: cardCs.paddingLeft,
            right: cardCs.paddingRight,
            top: cardCs.paddingTop,
            bottom: cardCs.paddingBottom,
          };
          c.cardPadX = card ? Math.round((cardBox.w - (c.cardContent ? c.cardContent.w : cardBox.w)) / 2) : null;
          /* The margin between the card and the SCREEN EDGE, which is what the
           * audit's "wastes ~86px of card padding" was actually about. An earlier
           * revision reported `cardPadX` here, but that is the card's INTERNAL
           * padding, not its outer margin -- two different numbers, and conflating
           * them sent a fix after the wrong one. */
          c.cardOuterGutter = cardBox ? Math.round(((window.innerWidth || 390) - cardBox.w) / 2) : null;
        }
        c.docScrollW = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);

        /* Informational only: does the one remaining className string in
         * clerkAppearance actually resolve? If not, the docblock's claim that
         * classNames on Clerk elements are inert is confirmed. */
        if (rootBox) {
          const cs = getComputedStyle(rootBox);
          c.rootBoxResolved = { width: cs.width, display: cs.display, justifyContent: cs.justifyContent };
        }

        /* Presence check. An empty widget means Clerk never mounted, which is
         * a FAIL-CLOSED failure, not a skip. */
        c.widgetPresent = Boolean(card);

        rec.expectations = { minCardContentW, minTap, minTextContrast, minFontPx, width: viewport.width };
        out.runs.push(rec);
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Assertions
 * ------------------------------------------------------------------ */

function evaluateRun(rec, tokenRefs) {
  const results = [];
  /* ok === null is a WARN: printed every run, never fails the gate. See the F3
   * note on the CTA. A warn that is counted as a pass is a hidden failure, so
   * warns are surfaced in every single run instead. */
  const add = (id, label, measured, expected, ok) => results.push({ id, label, measured, expected, ok });

  if (!rec.checks.widgetPresent) {
    add('F0', "Clerk widget rendered", 'NO', 'yes', false);
    return results;
  }
  add('F0', 'Clerk widget rendered', 'yes', 'yes', true);

  const c = rec.checks;
  const mobile = rec.width < 600;

  /* F1 primary CTA paints */
  if (c.ctaBackground) {
    add('F1', 'CTA background paints', c.ctaBackground.value, 'alpha > 0.5', (c.ctaBackground.alpha || 0) > 0.5);
  }

  /* F2 social label >= 4.5:1 */
  if (c.socialLabel) {
    add('F2', 'Social label contrast', `${c.socialLabel.ratio}:1`, '>= 4.5:1', c.socialLabel.ratio >= 4.5);
  }

  /* F3 the control has a visible boundary AND, for OUTLINED controls, that the
   * boundary reads against the surface behind it (WCAG 1.4.11 needs 3:1).
   *
   * The CTA is deliberately excluded from the 1.4.11 assertion and reported as a
   * WARN instead. Measured: Clerk draws the CTA's inset ring in the button's OWN
   * fill (rgb(255,153,0) light / rgb(255,157,10) dark), so the measured ratio is
   * really "brand orange fill vs the light card" = 2.14:1, not "grey border vs
   * card". That is a genuine 1.4.11 failure, but fixing it means changing the
   * light-theme `--primary` FILL -- a visual design decision, not a defect fix,
   * and it is outside the scope this gate was commissioned under. It is printed
   * every run so it cannot be forgotten. Outlined controls (input, social button)
   * ARE asserted, because for those the boundary is the affordance and the token
   * `--border-control` is already correct. Filled controls are asserted too — see the
   * note on the fill-vs-card line below for why that changed. */
  for (const [k, lbl, isOutlined] of [
    ['boundarySocial', 'Social button', true],
    ['boundaryEmail', 'Email input', true],
    ['boundaryCta', 'CTA', false],
  ]) {
    if (c[k]) {
      add('F3', `${lbl} boundary`, c[k].via, 'border or inset-shadow >= 1px', c[k].ok);
      if (c[k].vs && isOutlined) add('F3', `${lbl} boundary 1.4.11`, `${c[k].vs.ratio}:1`, '>= 3:1', c[k].vs.ratio >= 3);
      /* Filled controls were WARN-only because clearing 3:1 needed a light-theme
       * `--primary` change nobody had made yet, and a guard that blocks on an
       * undecided question is a guard you cannot satisfy. That decision is now made
       * (tokens.json: light `--primary` 30 95% 35%, `--primary-foreground` white —
       * fill-vs-card and label-on-fill are the same 4.96:1), so this asserts like every
       * other 1.4.11 check. It reported WARN at 8.25:1 as readily as at 2.14:1, which
       * trained everyone to read past it. */
      if (c[k].vs && !isOutlined) add('F3', `${lbl} fill vs card 1.4.11`, `${c[k].vs.ratio}:1`, '>= 3:1', c[k].vs.ratio >= 3);
    }
  }

  /* F4 show-password toggle */
  if (c.showPassword) {
    const m = c.showPassword;
    add('F4', 'Show-password contrast', m.contrast ? `${m.contrast.ratio}:1` : 'n/a', '>= 4.5:1', !!m.contrast && m.contrast.ratio >= 4.5);
    add('F4', 'Show-password hit area', `${m.w}x${m.h}`, '>= 44x44', m.w >= 44 && m.h >= 44);
  }

  /* F5 brand wiring: CTA bg and link colour track --primary, not --accent */
  if (c.ctaBackground && tokenRefs.primary) {
    add('F5', 'CTA uses brand --primary', c.ctaBackground.rgb, tokenRefs.primary, c.ctaBackground.rgb === tokenRefs.primary);
  }

  /* F6 tap targets */
  for (const [k, lbl] of [['socialHeight', 'Social button'], ['emailHeight', 'Email input'], ['ctaHeight', 'CTA']]) {
    if (c[k]) add('F6', `${lbl} height`, `${c[k].h}px`, '>= 44px', c[k].h >= 44);
  }

  /* F7 footer link */
  if (c.link && c.link.ratio !== undefined) {
    add('F7', 'Footer link contrast', `${c.link.ratio}:1`, '>= 4.5:1', c.link.ratio >= 4.5);
  }

  /* F8 input type size (iOS zoom floor) */
  if (c.emailFontPx) {
    add('F8', 'Input font size', `${c.emailFontPx}px`, '>= 16px', c.emailFontPx >= 16);
  }

  /* F9 phone: the audit's complaint (finding #9) was not "content too narrow",
   * it was "wastes ~86px of card padding" -- i.e. GUTTER, not width. An earlier
   * revision of this probe asserted a raw content width against a 320px target
   * that no spec or design rule ever stated, which is over-fitting to a number I
   * invented. This asserts the actual defect: gutter per side.
   *
   * Measured: the card is CONTENT-SIZED, so shrinking `cardBox.padding` shrinks
   * the card rather than widening its content -- content stayed at 305/317px
   * across two different padding values. The gutter is therefore the only lever
   * that moves, and it is what got fixed: 43px a side before, now measured. */
  if (mobile && c.card && c.cardOuterGutter !== null) {
    /* The audit's complaint (finding #9) was "wastes ~86px of card padding" --
     * the wasted space between the screen edge and the card. Assert the outer
     * margin, and separately that the card's own padding is not cramped. Both
     * are measured properties; neither is an invented target. */
    add('F9', 'Card margin from screen edge', `${c.cardOuterGutter}px`, '12px..32px', c.cardOuterGutter >= 12 && c.cardOuterGutter <= 32);
    add('F9', 'Card internal padding', `${c.cardPadX}px`, '>= 12px', c.cardPadX >= 12);
    /* The thing that actually breaks a mobile page. A card that overflows its
     * container is a layout bug; a card with generous padding is a taste call.
     * This one is a regression guard: a width wrapper applied to this page forced
     * document scrollWidth to 456px on a 390px viewport. */
    add('F9', 'Card fits 390px viewport', `${c.card.w}px`, '<= 390px', c.card.w <= 390);
    add('F9', 'No horizontal scroll', `${c.docScrollW}px`, '<= 390px', c.docScrollW <= 390);
  }

  /* F10 heading carries a real type step */
  if (c.titleFontPx) {
    add('F10', 'Heading font size', `${c.titleFontPx}px`, '>= 20px', c.titleFontPx >= 20);
  }

  return results;
}

async function loadWidget(page, url, attempts, timeoutMs) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) {
      await page.waitForTimeout(3000 * attempt);
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
    await page.waitForSelector('.cl-cardBox', { timeout: timeoutMs }).catch(() => {});
    await page.waitForTimeout(1200);
    if (await page.evaluate(() => !!document.querySelector('.cl-cardBox'))) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

(async () => {
  const server = await startPreview();
  const browser = await chromium.launch();
  /* ONE browser context for every run, not a fresh one per page.
   *
   * `browser.newPage()` is a Playwright convenience that creates a NEW
   * BrowserContext on every call, and a new context starts with an empty HTTP
   * cache. The loop below opens 2 routes x 2 viewports x 2 themes = 8 pages, plus
   * one warm-up, so that was 9 COLD fetches of Clerk's ~359 kB browser bundle
   * from *.clerk.accounts.dev in a row -- against a Clerk dev instance that
   * carries strict usage limits. Measured: `browser.newPage()` x3 returns 3
   * distinct contexts. Any one of those loads failing to paint inside the
   * retry budget failed the whole gate, which is why this gate was flaky.
   *
   * Sharing the context makes the first load cold and serves the other eight
   * from cache. Nothing about the measurements changes: each page still gets its
   * own `addInitScript` (which re-sets the theme on that page's own load, so
   * there is no localStorage bleed across runs) and its own viewport. Only the
   * network cache is shared, which is the point. */
  const context = await browser.newContext();
  let failures = 0;
  let measurements = 0;
  let warnings = 0;

  try {
    console.log('cadence -- auth surface probe');
    console.log(`target: ${BASE}   mode: ${REPORT_ONLY ? 'REPORT (always exits 0)' : 'ASSERT'}`);
    console.log('');

    /* WARM-UP, deliberately separate from the measured runs.
     *
     * Measured: without it, the first FOUR loads returned no widget at all while
     * the next four were fine -- cold-start on Clerk's script fetch, not a defect
     * and not rate limiting. That is a different problem from the rate limit
     * below and needs a different fix.
     *
     * Keeping the warm-up OUT of the measured runs is what makes the fail-closed
     * retry budget affordable: the per-page worst case drops from ~90s to ~46s,
     * and this gate runs inside a CI job with `timeout-minutes: 15`. A gate that
     * can exhaust the job timeout instead of reporting a clean failure is a worse
     * failure mode than the defect it is looking for. */
    {
      const warm = await context.newPage();
      await warm.setViewportSize({ width: 1440, height: 900 });
      await loadWidget(warm, BASE + ROUTES[0], 1, 45000).catch(() => {});
      await warm.close();
    }

    for (const route of ROUTES) {
      for (const viewport of VIEWPORTS) {
        for (const theme of THEMES) {
          const page = await context.newPage();
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await page.addInitScript((t) => {
            try {
              if (t === 'light') window.localStorage.setItem('cadence.theme', 'light');
              else window.localStorage.removeItem('cadence.theme');
            } catch (e) {
              /* private mode */
            }
          }, theme);

          /* FAIL-CLOSED, with a bounded retry budget.
           * Clerk dev instances carry strict usage limits (Clerk emits a console
           * advisory saying so). That is an external dependency, not a defect,
           * and a gate that fails on it is a gate people learn to ignore.
           *
           * Two attempts x 20s, plus the warm-up above, bounds the worst case per
           * page at ~46s. Still fail-closed: the page is declared failing only
           * after real attempts have failed to render, and it is never silently
           * skipped. */
          await loadWidget(page, BASE + route, 2, 20000);

          const data = await page.evaluate(collectInPage, {
            sel: null,
            routes: [route],
            viewports: [{ name: viewport.name, width: viewport.width }],
            themes: [theme],
            minCardContentW: MIN_CARD_CONTENT_W,
            minTap: MIN_TAP,
            minTextContrast: MIN_TEXT_CONTRAST,
            minFontPx: MIN_FONT_PX,
          });

          const rec = data.runs[0];
          const tokenRefs = data.tokenRefs;
          const results = evaluateRun(rec, tokenRefs);

          console.log(`${route}  ${viewport.name} ${viewport.width}x${viewport.height}  theme=${theme}`);
          if (!rec.checks.widgetPresent) {
            console.log('  F0  Clerk widget rendered        NO                  yes                 FAIL');
            failures++;
            measurements++;
            console.log('');
            await page.close();
            continue;
          }

          console.log('  id   check                       measured           expected           verdict');
          console.log('  ' + '-'.repeat(74));
          for (const r of results) {
            measurements++;
            const warn = r.ok === null;
            if (!warn && !r.ok) failures++;
            if (warn) warnings++;
            const verdict = warn ? 'WARN' : r.ok ? 'PASS' : 'FAIL';
            console.log(
              `  ${r.id.padEnd(4)} ${r.label.padEnd(27)} ${String(r.measured).padEnd(19)} ${String(r.expected).padEnd(30)} ${verdict}`,
            );
          }
          if (REPORT_ONLY) {
            const c = rec.checks;
            console.log('  --   card=' + JSON.stringify(c.card) + ' content=' + JSON.stringify(c.cardContent) + ' padX=' + c.cardPadX);
            console.log('  --   cardBox computed padding=' + JSON.stringify(c.cardPad));
            console.log('  --   boundary: social=' + JSON.stringify(c.boundarySocial) + ' cta=' + JSON.stringify(c.boundaryCta));
            console.log('  --   rootBox=' + JSON.stringify(c.rootBoxResolved));
          }
          console.log('');
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }

  console.log('-'.repeat(80));
  if (REPORT_ONLY) {
    console.log(`REPORT COMPLETE -- ${measurements} measurements taken, ${failures} currently failing.`);
    console.log('Exit 0 by design in report mode. Findings above are the work list.');
    process.exit(0);
  }
  if (failures > 0) {
    console.log(`RESULT: FAIL (${failures} of ${measurements} checks)`);
    console.log('  Fix the auth surface. This gate is fail-closed on purpose: a skipped');
    console.log('  measurement is an unmeasured page, not a passing one.');
    process.exit(1);
  }
  console.log(`RESULT: PASS (${measurements} checks, ${warnings} warns)`);
  if (warnings > 0) {
    console.log(`  ${warnings} WARN lines above are real and unfixed. They are not blocking,`);
    console.log('  but they are not passing either. Do not read this as a clean sheet.');
  }
  process.exit(0);
})().catch((err) => {
  console.error('verify-auth-surface: ' + (err && err.stack ? err.stack : String(err)));
  process.exit(1);
});