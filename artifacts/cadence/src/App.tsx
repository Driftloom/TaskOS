import { Suspense, lazy, useEffect, useRef, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppShell } from '@/components/chrome/AppShell';
import { ThemeProvider, useTheme } from '@/components/chrome/ThemeProvider';
import { DensityProvider } from '@/components/chrome/DensityProvider';
import { LandingPage } from '@/pages/landing/LandingPage';
import NotFound from '@/pages/not-found';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { acquireTimerMasterLock, subscribeToSync } from '@/lib/multi-instance-sync';
import { Moon, Sun } from 'lucide-react';

/* Route-level code splitting.
 *
 * These were nine static imports, so every page's component tree shipped in the
 * entry chunk whether or not the user ever visited it. Measured: 739.79 kB raw /
 * 197.85 kB gzip for a single chunk, against the repo's own stated 120 kB budget
 * in docs/13 P26.2. The marker scan showed the weight is app code (clerk x392,
 * sonner x126, cmdk x22), not a stray library, so the fix is to not bundle the
 * routes.
 *
 * `LandingPage` stays eager on purpose: Landing is the public front door and the
 * unauthenticated first paint. NotFound is also eager as the universal route fallback.
 * All authenticated routes (`TodayPage`, `FocusPage`, `InboxPage`, etc.) are lazy-loaded
 * behind `<ProtectedRouter>`'s Suspense boundary, keeping the public entry bundle minimal.
 *
 * The fallback is `null` rather than a spinner on purpose. A route chunk arrives
 * in well under the time a spinner would be on screen for, and P10 forbids
 * looping motion; a flash of chrome is calmer than a flash of spinner. Every
 * chunk boundary is exercised by the e2e suite, which asserts each of these
 * routes renders and throws no console error. */
const Toaster = lazy(() => import('@/components/ui/sonner').then((m) => ({ default: m.Toaster })));
const PwaUpdateNotifier = lazy(() =>
  import('@/components/chrome/PwaUpdateNotifier').then((m) => ({ default: m.PwaUpdateNotifier })),
);
const DashboardPage = lazy(() =>
  import('@/pages/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const TodayPage = lazy(() => import('@/pages/today/TodayPage').then((m) => ({ default: m.TodayPage })));
const FocusPage = lazy(() => import('@/pages/focus/FocusPage').then((m) => ({ default: m.FocusPage })));
const InboxPage = lazy(() => import('@/pages/inbox/InboxPage').then((m) => ({ default: m.InboxPage })));
const CalendarPage = lazy(() =>
  import('@/pages/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })),
);
const ReviewPage = lazy(() => import('@/pages/review/ReviewPage').then((m) => ({ default: m.ReviewPage })));
const SettingsPage = lazy(() =>
  import('@/pages/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const MemoryPage = lazy(() => import('@/pages/memory/MemoryPage').then((m) => ({ default: m.MemoryPage })));
const AgentPage = lazy(() => import('@/pages/agent/AgentPage').then((m) => ({ default: m.AgentPage })));
const ProjectsPage = lazy(() =>
  import('@/pages/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage })),
);
const GoalsPage = lazy(() =>
  import('@/pages/goals/GoalsPage').then((m) => ({ default: m.GoalsPage })),
);
const OnboardingPage = lazy(() =>
  import('@/pages/onboarding/OnboardingPage').then((m) => ({ default: m.OnboardingPage })),
);
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const DownloadPage = lazy(() =>
  import('@/pages/download/DownloadPage').then((m) => ({ default: m.DownloadPage })),
);
const ActivityPage = lazy(() =>
  import('@/pages/activity/ActivityPage').then((m) => ({ default: m.ActivityPage })),
);
// Gated to dev/test at BUILD time, not just at runtime. `import.meta.env.DEV` is
// substituted with a literal during the production build, so Rollup sees a
// statically-false branch and drops the dynamic import -- the catalog chunk is
// not emitted at all, rather than shipped and merely unreachable. Gating only the
// route (isDesignCatalogEnabled) would still leave the code in the bundle.
const DesignCatalogPage = import.meta.env.DEV
  ? lazy(() => import('@/pages/design/DesignCatalogPage'))
  : null;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 120000,
      gcTime: 86400000,
      retry: 2,
    },
  },
});

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in the environment.');
}

const stripBase = (p: string) => (basePath && p.startsWith(basePath) ? p.slice(basePath.length) || '/' : p);

const fg = 'hsl(var(--foreground))';
const mut = 'hsl(var(--muted))';
const brandCta = 'hsl(var(--primary))';
/**
 * A saturated fill is not a text colour. `--primary` is the orange FILL: in light
 * theme it measures 2.14:1 on `--card`, which fails WCAG 1.4.3 outright. Measured
 * on the sign-in footer link by scripts/verify-auth-surface.cjs, which is the only
 * gate in the repo that reads rendered pixels rather than tokens. `--primary-text`
 * is the darker member of the same hue (#A64B00 light / #FF9F0A dark) and is what
 * text is allowed to use. It is a hex, so it is referenced bare, never via hsl().
 */
const brandText = 'var(--primary-text)';
const tap = 'var(--global-size-tap-target)';

/**
 * WHY STYLE OBJECTS, NOT className STRINGS
 *
 * Clerk injects its component stylesheet at runtime, after this app's bundle, and
 * it is UNLAYERED — so where Clerk declares a property on an element, it beats a
 * Tailwind utility of the same property regardless of source order. A className
 * that loses that way fails silently: the class still emits, so `build:web`,
 * `lint:tokens` and `verify:no-dead-classes` all pass while the element renders
 * with Clerk's default. Measured on /sign-up (AUDIT-2026-10-10.md): `bg-accent`
 * left the primary CTA at `rgba(0,0,0,0)` — no button at all — and
 * `text-foreground` left the Google label at 1.22:1.
 *
 * The rule is therefore: colour, border and control sizing go in a Clerk style
 * OBJECT, which Clerk compiles into its own stylesheet and which therefore applies.
 *
 * Style objects are not magic either, and this file records how they fail. A
 * `border: '1px solid ...'` shorthand does not produce a visible border here.
 * Neither does longhand `borderWidth`/`borderStyle`/`borderColor`, and neither
 * does restating that longhand under `&[data-variant]` to out-rank Clerk's own
 * `[data-variant="solid"] { border-width: 0 }`. Measured: every control stayed at
 * `border-top-width: 0px` under all three, while the border COLOUR resolved
 * correctly the whole time -- which is exactly why `verify-no-dead-classes`
 * passes it. The mechanism that works is an inset box-shadow, and it is also what
 * Clerk itself emits for these elements. `alert` uses the same technique.
 *
 * Note the second failure mode here: a `className` is NOT always inert. The
 * earlier version of this comment claimed it was, and that was never measured.
 * `.cl-rootBox` carries `w-full flex justify-center` and resolves correctly, and
 * the app's own `.w-full` resolves to 1440px at a 1440px viewport. A className
 * loses only where Clerk declares the same property. `rootBox` below is layout,
 * which Clerk does not set.
 */
const controlBorder = {
  boxShadow: 'inset 0 0 0 1px var(--border-control)',
};

const control = {
  ...controlBorder,
  borderRadius: 'var(--radius-control)',
  minHeight: tap,
  fontSize: '1rem',
};

const clerkAppearance = {
  theme: shadcn,
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${location.origin}${basePath}/logo.svg`,
  },
  variables: {
    // `--primary` is the brand's Accent — Energy (#FF9F0A). `--accent` is shadcn's
    // subtle-surface slot and resolves to blue here, which is what made this page
    // read blue while its own focus rings stayed orange.
    colorPrimary: brandCta,
    colorPrimaryForeground: 'hsl(var(--primary-foreground))',
    colorForeground: fg,
    colorMutedForeground: 'hsl(var(--muted-foreground))',
    colorDanger: 'hsl(var(--destructive))',
    colorBackground: 'hsl(var(--card))',
    colorInput: mut,
    colorInputForeground: fg,
    // Clerk derives the social-button label from colorNeutral. Pointing this at
    // `--muted` is what rendered "Continue with Google" at 1.22:1.
    colorNeutral: fg,
    fontFamily: 'var(--global-font-sans)',
    borderRadius: '0.75rem',
  },
  elements: {
    // LOAD-BEARING, and the fix for the dead width constraint. Clerk's own `.cl-rootBox`
    // caps itself at ~380px and pads it, so it measured 347px at EVERY viewport from
    // 390px to 1920px — the card had no fluid behaviour at all. `cardBox.maxWidth`
    // (below) was therefore dead: a child cannot be wider than the box containing it.
    // `--component-dimension-auth-card-w` has to be read here, on the outermost element.
    // The `<main>` wrapper already supplies `px-4`, so this stays fluid on a phone
    // (390 - 32 = 358) and settles at the token on desktop.
    rootBox: {
      width: '100%',
      maxWidth: 'var(--component-dimension-auth-card-w, 440px)',
      display: 'flex',
      justifyContent: 'center',
      boxSizing: 'border-box',
    },
    cardBox: {
      width: '100%',
      maxWidth: 'var(--component-dimension-auth-card-w, 440px)',
      /* Clerk renders this box content-box, so `width: 100%` plus padding made the
         card 16px WIDER than its grid area -- 376px inside a 358px area, leaving a
         7px gutter against the phone screen edge. border-box keeps the declared
         width authoritative. */
      boxSizing: 'border-box',
      backgroundColor: 'hsl(var(--card))',
      ...controlBorder,
      // Stated explicitly rather than inherited from Clerk's own 24px default, so the
      // card's curvature stays a token this repo owns.
      borderRadius: 'var(--radius-lg)',
      // Clerk's own card padding measured 39px per side, which left 244px of
      // content inside a 358px card on a 390px phone. Zeroing `.cl-card` (below)
      // and setting this to 1rem yields 305px of content with a 28px screen margin
      // and 15px of internal padding. Sized by measurement, not by guessing -- an
      // earlier attempt tuned this against an inferred gutter and overshot in the
      // wrong direction. See scripts/verify-auth-surface.cjs (audit finding #9).
      padding: '1rem',
    },
    // Neutralise Clerk's inner card chrome. The previous `!shadow-none !border-0
    // !bg-transparent !rounded-none` never applied to anything: Tailwind v4 moved the
    // important modifier to a suffix, so the v3 prefix form emitted zero CSS.
    //
    // `padding: 0` is load-bearing and was measured, not assumed. `.cl-card` carries
    // its own 39px per side on top of cardBox's, so with both left in place a 390px
    // phone produced a 358px card holding 244px of content -- 57px a side of pure
    // gutter. Zeroing this plus cardBox's 18px yields 322px. See
    // scripts/verify-auth-surface.cjs (audit finding #9).
    card: { backgroundColor: 'transparent', border: 'none', boxShadow: 'none', borderRadius: '0', padding: 0, gap: '24px' },

    /* ---------------------------------------------------------------------------
     * VERTICAL RHYTHM
     *
     * Clerk ships four unrelated gaps — 32px (card, form), 24px (main, field rows)
     * and 8px (label to input) — which reads as "one value repeated" because nothing
     * is tighter *because* it is grouped. This replaces them with two beats plus one
     * accent, so proximity carries meaning:
     *
     *   10px  within a field group      label -> input. Tightest interval on the page.
     *    8px  title -> subtitle          a heading and its own supporting line.
     *   20px  between peers              field->field, social->divider->form.
     *   24px  before the primary action  and between the three major regions.
     *
     * Measured before: 4 / 8 / 24 / 24 / 24 / 32 / 32 on /sign-up.
     * ------------------------------------------------------------------------- */
    header: { gap: '16px' },
    main: { gap: '20px' },
    form: { gap: '24px' },
    /* "Already have an account? Sign in" is one sentence, and it should read as one
     * sentence. Clerk stacks the prompt and the link in a column with a 4px gap, which
     * splits the sentence across two lines and makes the link look like its own item.
     * Row direction puts them back together; `flexWrap` keeps a long translation from
     * overflowing the card rather than clipping it. */
    footerAction: {
      padding: '16px 0 20px',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'wrap',
      columnGap: '0.375rem',
      rowGap: '0.25rem',
    },
    footer: { backgroundColor: 'transparent', border: 'none', boxShadow: 'none' },
    headerTitle: {
      color: fg,
      // Clerk's base left this at 17px with no step from the P7 scale, so the
      // page's only <h1> did not carry the type hierarchy (audit finding #10).
      // Measured by scripts/verify-auth-surface.cjs.
      fontSize: 'var(--text-title2)',
      lineHeight: 'var(--text-title2--line-height)',
      letterSpacing: 'var(--text-title2--letter-spacing)',
      fontWeight: 'var(--text-title2--font-weight)',
      // The title/subtitle pair sits in an unclassed wrapper holding a 4px flex gap,
      // and that wrapper has no Clerk element key, so the extra 4px is bought with a
      // margin: 4px gap + 4px margin = the 8px a heading and its supporting line want.
      marginBottom: '4px',
    },
    headerSubtitle: { color: 'hsl(var(--muted-foreground))' },
    socialButtonsBlockButton: {
      ...control,
      backgroundColor: mut,
      color: fg,
      fontWeight: '500',
      '&[data-variant]': controlBorder,
    },
    socialButtonsBlockButtonText: { color: fg },
    formFieldLabel: {
      color: fg,
      fontSize: '0.875rem',
      // Same trick as the title: the 8px label->input gap lives on an unclassed
      // wrapper, so +2px of margin lands the pair on the 10px beat.
      marginBottom: '2px',
    },
    // 1rem, not 13px: iOS Safari zooms the viewport on focus below 16px.
    formFieldInput: {
      ...control,
      backgroundColor: mut,
      color: fg,
      '&[data-variant]': controlBorder,
    },
    formFieldInputShowPasswordButton: { color: fg, minWidth: tap, minHeight: tap },

    /* ---------------------------------------------------------------------------
     * OTP / email-code boxes — the `factor-one` step of the sign-in flow.
     *
     * Same defect as the email/password inputs (audit finding #1), in a control the
     * earlier fix never named: Clerk's base theme draws inputs with no boundary, so an
     * OTP box that is not overridden here renders with nothing to identify it.
     *
     * UNVERIFIED BY MEASUREMENT, deliberately. Every other change in this block was
     * measured against a rendered page before and after. This one could not be:
     * `/sign-in/factor-one` is unreachable without a live email round-trip — Clerk
     * redirects it to `/sign-in` on a cold load, confirmed. Two consequences:
     *
     *   1. It is unknown whether these inputs carry a `data-variant` attribute. The
     *      email/password inputs did, which is exactly why a top-level declaration was
     *      silently discarded there and `&[data-variant]` was needed. So the boundary is
     *      declared through BOTH forms: whichever the cascade honours applies, the other
     *      is inert. That is deliberate, not cargo-cult, and it is the one place in this
     *      file that should collapse to a single line once factor-one is reachable.
     *   2. The caret in the supplied screenshot renders to the LEFT of the first box,
     *      outside the group, which no override here can explain. That needs a rendered
     *      measurement before anyone changes the DOM.
     *
     * Also unverified here: contrast of the digit glyphs, and whether the container or
     * the input is the visible edge — so both are styled identically.
     * ------------------------------------------------------------------------- */
    /* Clerk renders this step as ONE <input> holding `value: m.join("")`, with the six
     * boxes drawn as an overlay row inside it — NOT six inputs. Verified in the shipped
     * @clerk/ui@1.40.0 bundle (`ui-common_ui`), not inferred:
     *
     *   otpCodeFieldInputContainer  (position:relative)
     *     |- <input maxLength inputMode=numeric value={all digits} />   <- the real caret
     *     `- otpCodeFieldInputs   (role="group", gap:2)
     *          `- otpCodeFieldInput x6   <- visual boxes, plain elements
     *
     * Consequences, both of which a plausible-looking fix gets wrong:
     *   - `caretColor` / `&:focus` on `otpCodeFieldInput` do NOTHING. That element is a
     *     visual box, not the input, so it has no caret and never receives focus. The
     *     real input carries NO element descriptor, so it cannot be reached through this
     *     API at all — it is styled in index.css instead, where a descendant selector
     *     outranks Clerk's unlayered sheet on specificity.
     *   - Individual boxes cannot be focused or clicked. There is one input. The caret
     *     position IS the only "which box am I in" cue.
     *
     * `otpCodeFieldInputContainer` is deliberately NOT styled here. It was, twice, and
     * both were reverted:
     *   1. a `&:focus-within` ring, which survived only in the 2px gaps between the
     *      boxes and rendered as orange slivers between every one of them;
     *   2. a `controlBorder` ring, which drew a rectangle around the entire group —
     *      a second, larger outline sitting behind six smaller ones.
     * The container wraps all six boxes, so any ring on it frames the group rather than
     * the field the user is in, and the boxes sit on top of it. Per-box boundaries live
     * on `otpCodeFieldInput`, which is the element that actually draws one. */
    otpCodeFieldInput: {
      ...control,
      backgroundColor: mut,
      color: fg,
      textAlign: 'center',
      ...controlBorder,
      '&[data-variant]': controlBorder,
    },
    otpCodeFieldErrorText: { color: 'hsl(var(--destructive))' },
    otpCodeFieldSuccessText: { color: 'hsl(var(--primary-text))' },
    formButtonPrimary: {
      ...control,
      backgroundColor: brandCta,
      color: 'hsl(var(--primary-foreground))',
      fontWeight: '700',
      // Clerk draws the CTA's inset ring in the button's OWN fill, not in
      // `--border-control`, so this restates the token on the same hook Clerk
      // already uses for the social button and the inputs.
      '&[data-variant]': controlBorder,
    },
    footerActionLink: {
      // brandText, not brandCta: --primary is the orange FILL and measures 2.14:1
      // on the light card, failing WCAG 1.4.3. The footer link is text, so it
      // takes the text-safe member of the same hue.
      color: brandText,
      fontSize: '1rem',
      minHeight: tap,
      display: 'inline-flex',
      alignItems: 'center',
    },
    footerActionText: { color: 'hsl(var(--muted-foreground))', fontSize: '1rem' },
    dividerText: { color: 'hsl(var(--muted-foreground))' },
    dividerLine: { backgroundColor: 'var(--border-control)' },
    alert: { backgroundColor: 'hsl(var(--destructive) / 0.15)', boxShadow: 'inset 0 0 0 1px hsl(var(--destructive) / 0.3)' },
    alertText: { color: fg },
  },
};

function LoadingScreen() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background text-foreground">
      <div className="text-center animate-enter">
        <div className="mx-auto grid size-12 place-items-center rounded-lg bg-primary text-primary-foreground shadow-lg">
          <span className="font-mono text-callout font-bold">C</span>
        </div>
        <p className="mt-4 font-mono text-caption uppercase tracking-[0.25em] text-muted-foreground">
          Loading your cadence
        </p>
      </div>
    </div>
  );
}

const isDevTestAuth = () => Boolean(import.meta.env.DEV && typeof window !== 'undefined' && (location.search.includes('test_auth=true') || localStorage.getItem('cadence_test_auth') === 'true'));

function HomeRedirect() {
  if (isDevTestAuth()) return <Redirect to="/today" />;

  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <LoadingScreen />;
  }

  if (isSignedIn) {
    const lastPath = typeof window !== 'undefined' ? window.localStorage.getItem('cadence_last_path') : null;
    const target =
      lastPath && lastPath !== '/' && !lastPath.startsWith('/sign') && !lastPath.startsWith('/download')
        ? lastPath
        : '/today';
    return <Redirect to={target} />;
  }

  return <LandingPage />;
}

/**
 * Theme control for the unauthenticated routes.
 *
 * `AppShell` carries the in-app toggle, but it is not in the auth tree — `/sign-in` and
 * `/sign-up` render a bare `<main>`. So a visitor who arrived in light mode (persisted
 * in `cadence.theme`, or the OS default) had no way back to dark: they had to sign in
 * first, and on the first-run funnel that is the whole page. This closes that gap.
 *
 * Deliberately last in the DOM, not first: tab order follows source order, and the first
 * stop on a sign-up form should be the form, not a theme switch.
 */
function AuthThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const toLight = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      data-testid="auth-theme-toggle"
      className="fixed top-4 right-4 z-10 grid size-11 place-items-center rounded-control border border-border-control bg-card text-muted-foreground transition-colors hover:text-foreground"
      aria-label={toLight ? 'Switch to light appearance' : 'Switch to dark appearance'}
      title={toLight ? 'Light appearance' : 'Dark appearance'}
    >
      {toLight ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}

const cardBoxStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 'var(--component-dimension-auth-card-w, 440px)',
  boxSizing: 'border-box',
  backgroundColor: 'hsl(var(--card))',
  ...controlBorder,
  borderRadius: 'var(--radius-lg)',
  padding: '1rem',
};

function AuthFallbackCard({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const isSignIn = mode === 'sign-in';
  return (
    <div
      data-testid="auth-fallback-card"
      aria-busy="true"
      aria-label={isSignIn ? 'Loading sign in form' : 'Loading registration form'}
      style={cardBoxStyle}
    >
      <div className="mx-auto mb-3 grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <span className="font-mono text-callout font-bold">C</span>
      </div>
      <h1 className="text-center font-bold text-title2 text-foreground">
        {isSignIn ? 'Sign in to Cadence' : 'Create your Cadence account'}
      </h1>
      <p className="mt-1 text-center text-callout text-muted-foreground">
        {isSignIn
          ? 'Welcome back! Please sign in to continue to your workspace.'
          : 'Welcome! Please fill in your details to get started.'}
      </p>

      <div className="mt-6 flex tap-target-h w-full items-center justify-center gap-3 rounded-control border border-border-control bg-muted px-4 text-callout font-medium text-foreground">
        <span className="inline-block size-4 rounded-full border border-border-control bg-background/60" />
        <span>Continue with Google</span>
      </div>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-border-control" />
        <span className="text-caption text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border-control" />
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <span className="block text-caption font-medium text-foreground">Email address</span>
          <div className="tap-target-h w-full rounded-control border border-border-control bg-background" />
        </div>
        <div className="space-y-2">
          <span className="block text-caption font-medium text-foreground">Password</span>
          <div className="tap-target-h w-full rounded-control border border-border-control bg-background" />
        </div>
      </div>

      <div className="mt-6 flex tap-target-h w-full items-center justify-center rounded-control bg-primary text-callout font-medium text-primary-foreground">
        Continue
      </div>

      <div className="mt-6 text-center text-callout text-muted-foreground">
        <span>{isSignIn ? 'Don’t have an account? ' : 'Already have an account? '}</span>
        <span className="text-primary-text font-medium">{isSignIn ? 'Sign up' : 'Sign in'}</span>
      </div>
    </div>
  );
}

function SignInPage() {
  return (
    <main id="main-content" role="main" className="grid min-h-[100dvh] place-items-center bg-background px-4">
      {/* No width wrapper here. `auth-card-w max-w-full` was applied around this
          element and `max-w-full` did NOT cap it inside a `place-items-center`
          grid: the div measured 440px wide on a 390px viewport and forced
          document scrollWidth to 456px, so the phone page scrolled sideways.
          `clerkAppearance.elements.cardBox` already owns the constraint
          (`width: 100%; max-width: var(--component-dimension-auth-card-w, 440px)`),
          which is the single place the token should be read. */}
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        fallbackRedirectUrl="/today"
        forceRedirectUrl="/today"
        fallback={<AuthFallbackCard mode="sign-in" />}
      />
      <AuthThemeToggle />
    </main>
  );
}

function SignUpPage() {
  return (
    <main id="main-content" role="main" className="grid min-h-[100dvh] place-items-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        fallbackRedirectUrl="/today"
        forceRedirectUrl="/today"
        fallback={<AuthFallbackCard mode="sign-up" />}
      />
      <AuthThemeToggle />
    </main>
  );
}

function ProtectedRouter() {
  const { isLoaded, isSignedIn } = useAuth();
  const [location] = useLocation();

  const isTestMode = import.meta.env.DEV && (
    typeof window !== 'undefined' && (
      window.location.search.includes('test_auth=true') ||
      window.localStorage.getItem('cadence_test_auth') === 'true'
    )
  );

  useEffect(() => {
    if (import.meta.env.DEV && typeof window !== 'undefined' && window.location.search.includes('test_auth=true')) {
      window.localStorage.setItem('cadence_test_auth', 'true');
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && location && location !== '/' && !location.startsWith('/sign')) {
      try {
        window.localStorage.setItem('cadence_last_path', location);
      } catch {
        // ignore storage errors
      }
    }
  }, [location]);

  if (!isLoaded && !isTestMode) return <LoadingScreen />;
  if (!isSignedIn && !isTestMode) return <Redirect to="/" />;

  return (
    <ErrorBoundary resetKey={location}>
      <AppShell>
        <Suspense fallback={null}>
          <Switch>
            <Route path="/dashboard" component={DashboardPage} />
            <Route path="/today" component={TodayPage} />
            <Route path="/inbox" component={InboxPage} />
            <Route path="/focus" component={FocusPage} />
            <Route path="/calendar" component={CalendarPage} />
            <Route path="/projects" component={ProjectsPage} />
            <Route path="/goals" component={GoalsPage} />
            <Route path="/agent" component={AgentPage} />
            <Route path="/review" component={ReviewPage} />
            <Route path="/memory" component={MemoryPage} />
            <Route path="/onboarding" component={OnboardingPage} />
            <Route path="/profile" component={ProfilePage} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/activity" component={ActivityPage} />
            <Route path="/history" component={ActivityPage} />
            <Route path="/download" component={DownloadPage} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </AppShell>
    </ErrorBoundary>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { userId, isLoaded } = useAuth();
  const previousUserId = useRef<string | null | undefined>(undefined);
  const currentQueryClient = useQueryClient();

  useEffect(() => {
    if (!isLoaded) return;

    if (
      previousUserId.current !== undefined &&
      previousUserId.current !== null &&
      previousUserId.current !== userId
    ) {
      currentQueryClient.clear();
    }
    previousUserId.current = userId;
  }, [currentQueryClient, isLoaded, userId]);

  return null;
}

function ClerkAuthBridge() {
  const { getToken, isSignedIn } = useAuth();

  const registerGetter = () => {
    setAuthTokenGetter(async () => {
      try {
        const token = await getToken();
        if (token) return token;
      } catch {
        // Fall back to global Clerk instance if useAuth.getToken errored
      }
      if (typeof window !== 'undefined') {
        const clerk = (window as unknown as { Clerk?: { session?: { getToken?: () => Promise<string | null> } } })?.Clerk;
        try {
          return (await clerk?.session?.getToken?.()) ?? null;
        } catch {
          return null;
        }
      }
      return null;
    });
  };

  if (isSignedIn) {
    registerGetter();
  }

  useEffect(() => {
    if (isSignedIn) {
      registerGetter();
    } else {
      setAuthTokenGetter(null);
    }
  }, [getToken, isSignedIn]);

  return null;
}

function MultiInstanceCoordinator() {
  const currentQueryClient = useQueryClient();

  useEffect(() => {
    acquireTimerMasterLock();

    const unsubscribe = subscribeToSync((msg) => {
      if (msg.type === 'AUTH_LOGOUT') {
        currentQueryClient.clear();
        window.location.href = '/';
      } else if (msg.type === 'CACHE_INVALIDATE') {
        currentQueryClient.invalidateQueries();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentQueryClient]);

  return null;
}

function SpeedInsightsTracker() {
  const [location] = useLocation();
  return <SpeedInsights route={location} />;
}

const hasActiveSessionOrTestAuth = (): boolean =>
  typeof document !== 'undefined' &&
  (/(?:__session|__client_uat=[1-9])/.test(document.cookie) || isDevTestAuth());

/**
 * `/__design` is the living design-system catalog. It renders internal design
 * surface — every semantic colour swatch, the full type scale, density modes.
 * That is not a security hole (it reads nothing and renders no user data), but
 * shipping it on a public production URL publishes the design system to anyone
 * who guesses the path, and it keeps a debug surface alive in prod.
 *
 * Gated to dev and test builds. `/` and `/download` below stay public on
 * purpose -- they are the marketing and download surfaces, not internals.
 * `import.meta.env.DEV` is statically replaced at build time, so this whole
 * branch is dead code in a production bundle and cannot be reached by toggling
 * anything at runtime.
 */
const isDesignCatalogEnabled = (): boolean => import.meta.env.DEV || isDevTestAuth();

function ClerkAuthenticatedApp({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => {
        window.history.pushState({}, '', stripBase(to));
        window.dispatchEvent(new PopStateEvent('popstate'));
      }}
      routerReplace={(to) => {
        window.history.replaceState({}, '', stripBase(to));
        window.dispatchEvent(new PopStateEvent('popstate'));
      }}
    >
      <ClerkQueryClientCacheInvalidator />
      <ClerkAuthBridge />
      {children}
    </ClerkProvider>
  );
}

function AppRoutes() {
  const [location] = useLocation();

  // In a production build the catalog route does not exist: an unknown path
  // falls through to the authenticated app shell, which is the same handling any
  // other bogus URL gets. Not a 404 page, but not the design system either.
  if (DesignCatalogPage && location === '/__design' && isDesignCatalogEnabled()) {
    return (
      <Suspense fallback={null}>
        <DesignCatalogPage />
      </Suspense>
    );
  }

  if ((location === '/' && !hasActiveSessionOrTestAuth()) || location === '/download') {
    if (location === '/download') {
      return (
        <Suspense fallback={null}>
          <DownloadPage />
        </Suspense>
      );
    }
    return <LandingPage />;
  }

  return (
    <ClerkAuthenticatedApp>
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route component={ProtectedRouter} />
      </Switch>
    </ClerkAuthenticatedApp>
  );
}

function Router() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <DensityProvider>
          <MultiInstanceCoordinator />
          <AppRoutes />
          <Suspense fallback={null}>
            <Toaster position="bottom-right" richColors />
            <PwaUpdateNotifier />
          </Suspense>
          <SpeedInsightsTracker />
        </DensityProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <Router />
    </WouterRouter>
  );
}

export default App;
