const path = require('path');
const t = require(path.join(__dirname, '..', '..', 'tokens', 'tokens.json'));

function parseColor(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (h.length === 3) return [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16));
    if (h.length >= 6) return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return null;
  }
  const m = s.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (m) {
    const h = parseFloat(m[1]) / 360;
    const sat = parseFloat(m[2]) / 100;
    const l = parseFloat(m[3]) / 100;
    if (sat === 0) {
      const g = Math.round(l * 255);
      return [g, g, g];
    }
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const p = 2 * l - q;
    const hue = (t2) => {
      let x = t2;
      if (x < 0) x += 1;
      if (x > 1) x -= 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)].map((c) => Math.round(c * 255));
  }
  return null;
}

function lum(rgb) {
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg, bg) {
  const l1 = lum(parseColor(fg));
  const l2 = lum(parseColor(bg));
  if (l1 === null || l2 === null) return null;
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function walk(o, p, out) {
  for (const [k, v] of Object.entries(o || {})) {
    const np = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object' && !('value' in v)) walk(v, np, out);
    else if (v && 'value' in v) out[np] = v.value;
  }
}

/**
 * Resolve `{a.b.c}` alias references against the global/alias layers, the same
 * way build-tokens.cjs does before writing CSS. Without this, a component token
 * authored as `{color.neutral.995}` is an opaque string to the contrast math and
 * the pair silently goes unresolved -- which is how the whole sidebar fell out of
 * coverage in the first place.
 */
function resolveRef(value, seen = new Set()) {
  if (typeof value !== 'string') return value;
  const m = /^\{([^}]+)\}$/.exec(value.trim());
  if (!m) return value;
  const path = m[1];
  if (seen.has(path)) return value; // cycle: leave it alone rather than recurse
  seen.add(path);
  // References are root-relative: `{color.neutral.995}` means global.color.*,
  // not semantic.color.*. Try global first, then alias, which is the same
  // resolution order build-tokens.cjs uses.
  const roots = ['global', 'alias'];
  for (const r of roots) {
    let node = t[r];
    let ok = true;
    for (const part of path.split('.')) {
      if (node == null || typeof node !== 'object') {
        ok = false;
        break;
      }
      node = node[part];
    }
    if (ok && node && typeof node === 'object' && 'value' in node) {
      return resolveRef(node.value, seen);
    }
  }
  return value;
}

module.exports = { parseColor, lum, ratio, walk, resolveRef, tokens: t };

if (require.main === module) {
  const PAIRS = [
    ['color.foreground', 'color.background', 4.5, 'body text'],
    ['color.foreground', 'color.card', 4.5, 'body text on card'],
    ['color.mutedForeground', 'color.background', 4.5, 'caption'],
    ['color.mutedForeground', 'color.card', 4.5, 'caption on card'],
    ['color.accent', 'color.background', 4.5, 'link'],
    ['color.primaryForeground', 'color.primary', 4.5, 'primary button label'],
    ['color.borderControl', 'color.background', 3, 'border WCAG 1.4.11'],
    ['color.borderControl', 'color.card', 3, 'border on card'],
    ['color.statusDangerText', 'color.background', 4.5, 'urgent'],
    ['color.statusSuccessText', 'color.background', 4.5, 'done'],
    ['color.statusWarningText', 'color.background', 4.5, 'caution'],
    ['color.statusInfoText', 'color.background', 4.5, 'scheduled'],
    ['color.aiText', 'color.background', 4.5, 'memory'],
  ];
  for (const mode of ['light', 'dark', 'high-contrast']) {
    const flat = {};
    walk(t.semantic[mode], '', flat);
    console.log(`\n=== ${mode} ===`);
    let fails = 0;
    for (const [fgK, bgK, min, label] of PAIRS) {
      const fg = flat[fgK];
      const bg = flat[bgK];
      if (!fg || !bg) {
        console.log(`  ?? ${label.padEnd(22)} ${fgK} or ${bgK} missing`);
        continue;
      }
      const r = ratio(fg, bg);
      if (r === null) {
        console.log(`  ?? ${label.padEnd(22)} unparseable`);
        continue;
      }
      const ok = r >= min;
      if (!ok) fails++;
      console.log(
        `  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(22)} ${r.toFixed(2).padStart(6)}:1  (min ${min})   ${fgK} on ${bgK}`,
      );
    }
    console.log(`  --> ${fails} failing pair(s)`);
  }
}
