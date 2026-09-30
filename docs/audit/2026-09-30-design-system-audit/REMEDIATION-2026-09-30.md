# Remediation Log — 2026-09-30

Follows `DESIGN-SYSTEM-AUDIT.md` in this folder. Two forks were decided by the owner and executed.
**Verification gate for both: `tsc --build --force` (exit 0) + `vite build` (exit 0) + full vitest suite (exit 0, 220 passing).**

---

## Fork (a) — REPAIR the shadcn primitives

**Decision:** repair, not delete.

### Correction to the audit's original claim

The audit initially said "54 of 55 shadcn primitives are broken." **That was overstated and is hereby corrected.** Precise enumeration (`enumerate-missing-tokens.cjs`, `audit-ui-utilities.cjs`) showed the real gap was far smaller. Two classes of false positive were identified and discarded:

| Flagged as missing | Reality |
|---|---|
| 7 × `--radix-*` | Injected at runtime by Radix on the trigger element. Not a defect. |
| `--sidebar-width`, `--sidebar-width-icon`, `--skeleton-width` | Set **inline by the component itself** (`sidebar.tsx:135-136, 192, 632`). Not a defect. |
| `--radius-sm/md/lg/xl`, `--shadow-xs/sm/md/lg`, `--text-*` | **Tailwind v4.3.3 built-in defaults** (verified in `node_modules/.pnpm/tailwindcss@4.3.3/.../theme.css`). Not a defect. |
| `ring-offset-background` | Backed by the existing `--color-background`. Not a defect. |
| `border-b`, `text-center`, `text-sm`, `shadow-md` | Position/size utilities, not colors. Script false positives. |

### Genuine gaps found and fixed — `artifacts/cadence/src/index.css`

| Gap | Consumed at | Fix |
|---|---|---|
| `--button-outline` | `ui/button.tsx:21` | `--button-outline: var(--p-border-prominent)` |
| `--badge-outline` | `ui/badge.tsx:23` | `--badge-outline: var(--p-border-prominent)` |
| `--spacing-4` | `ui/sidebar.tsx:224, 237` | `--spacing-4: 1rem` — **Tailwind v4 emits only a single `--spacing` base and no `--spacing-4`**, so both `calc()`s were resolving against nothing |
| `--sidebar-accent` | `ui/sidebar.tsx:483` (`hsl(var(--sidebar-accent))`) | HSL triple `240 4% 14%` |
| `--sidebar-border` | `ui/sidebar.tsx:483` (`hsl(var(--sidebar-border))`) | HSL triple `240 4% 18%` |
| 6 sidebar color utilities | `ui/sidebar.tsx` — `bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-border`, `border-sidebar-border`, `ring-sidebar-ring`, `hover:bg-sidebar-accent`, `hover:text-sidebar-accent-foreground` | Added `--sidebar` / `-foreground` / `-primary` / `-primary-foreground` / `-accent` / `-accent-foreground` / `-border` / `-ring` to both `:root` (HSL triples) and `@theme inline` (bindings) |
| `.hover-elevate`, `.active-elevate-2` | `ui/button.tsx:8` | New `@utility` blocks. `index.css` previously contained **zero** `@utility` declarations. `hover-elevate` is gated behind `@media (hover: hover)` per §P12. |

Also added, because the repair required them and §P5.2 lists them as required-but-absent categories:
- **Elevation tokens** `--elevate-1/2/3` (§P8.1 `e1`/`e2`/`e3`, dark-tuned: near-zero shadow, depth from surface lightness — §P6.3). Consumed by the two new utilities.

### Result

- `@theme --color-*` keys: **16 → 24**
- Distinct custom properties defined: **51 → 73**
- Genuine unbacked tokens remaining: **0** (the 10 still reported are runtime-provided, per the table above)
- Compiled-CSS spot check: `.hover\:bg-sidebar-accent:hover{background-color:hsl(var(--sidebar-accent))}` — resolves correctly

### Recorded deviation from §P5.1

§P5.1 mandates a `--cad-{category}-{role}` prefix. **The new tokens use unprefixed names** (`--sidebar`, `--elevate-1`, `--spacing-4`) to match the file's existing 51 unprefixed variables.

Reason: shadcn *forces* the unprefixed names for the critical ones (`--sidebar-width`, `--button-outline`, `--badge-outline`, `--spacing-4`) — a prefix is not an option without patching shadcn source that regenerates on every `shadcn add`. Introducing a prefix for only the new tokens would also leave the file internally inconsistent.

**Recommendation:** resolve in audit step 1 (the `tokens.json` → codegen pass) with a single mechanical rename across all 73 variables. Do not attempt it piecemeal.

---

## Fork (b) — Sub-12px text

**Decision:** work on it. The audit had flagged this as possibly a deliberate density choice; classification confirmed it is a **defect**, so it was fixed rather than preserved as a token.

### Evidence it was a defect, not a density choice

§P7 sets `type.caption` at **12px** as the smallest token and marks it "chips, badges (**never for essential info**)". §P8.4 repeats: density "never reduces text below 12px."

Sampling the text these classes actually carry:

```
'NOT CONNECTED'          'NOT IMPLEMENTED'       '*REQUIRED'
'PRIMARY CHANNEL ACTIVE' 'RECOMMENDED'           'pg_cron Dead-Man''s Switch'
'From @BotFather'        'automatically register the webhook'
'Two-way Nudges & Commands'  'Nightly Catch-Up & Summary'
'Desktop & PWA Banner Alerts' 'Secondary Browser Alerts'
'Minutes logged today'   'Target focus blocks'   'Rounds Aim'
'Strict, no freeze'      'Tap'                   'runWithRls'
```

Plus one `text-red-400 text-[11px]` — an **error message at 11px**. These are channel states, setup instructions, infrastructure status, and an error string. Per §P7, none of it may live at caption size, and all of it was below even that.

### Change

`text-[9px]` (13) · `text-[10px]` (104) · `text-[11px]` (54) → **`text-xs`** across **23 files**.

Chose `text-xs` (Tailwind's real 12px utility) over `text-[12px]` because §P5.3 forbids arbitrary values. Verified in compiled CSS: `.text-xs{font-size:var(--text-xs)}` with `--text-xs: .75rem` = exactly 12px, token-driven.

| | before | after |
|---|---|---|
| sub-12px instances | 171 | **0** |
| `text-xs` instances | 286 | 457 |

### Overflow risk checked, not assumed

The 13 × `text-[9px]` included two ring-center labels (`ActivityRings.tsx:81` "day streak", `:143` "done") inside `absolute inset-0` flex containers, where growth could overflow. Verified the §P11.1 48px ring variant is **never rendered** — only `size={144}` (`TodayPage.tsx:417`) and `size={120}` (`ReviewPage.tsx:129`) are in use. At 120–144px, a 12px label beneath a `text-2xl` numeral (~48px total) fits with wide margin. **Safe.**

### Collateral-damage checks

| Check | Result |
|---|---|
| Duplicate `text-xs` within one `className` | 0 |
| BOM / encoding change | none (files begin `69 6D 70 6F` = `impo`) |
| Line-ending churn | none — `git diff --numstat` surgical (3/3, 5/5, 8/8), not whole-file rewrites |
| `index.css` diff shape | +54 / −0 (pure additions) |
| `artifacts/mockup-sandbox` | untouched |

---

## Gates

| Gate | Result |
|---|---|
| `node node_modules/typescript/bin/tsc --build --force` | **exit 0** |
| `pnpm --filter @workspace/cadence run build` (Vite 7.3.6) | **exit 0**, 1878 modules |
| `pnpm run test` (full vitest) | **exit 0** — 208 passed (api-server, 16 files) + 12 passed (db, 1 file), 23 skipped |

## Incidental finding — `AGENTS.md` test count is stale

`AGENTS.md:14` and `AGENTS.md:143` both claim **"183/183 vitest tests pass (across 13 files)."** Actual measured today: **220 passing across 17 files** (208 + 12). The claim understates the suite. Not edited — flagging only, per the rule against fixing things during an audit pass.

## Not verified

No browser, no rendered-DOM inspection, no screenshot, no device test. Specifically **unverified**:
- whether the 12px raise causes clipping or reflow in any fixed-height container
- whether `line-height` changing to `calc(1/.75)` (= 16px, via `--text-xs--line-height`) alters wrapping anywhere
- any visual regression from the new sidebar/elevation tokens (all consumed only by currently-unmounted primitives, so expected to be a no-op, but expected ≠ verified)

These need one visual pass on a real device.
