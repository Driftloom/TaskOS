import { Suspense, lazy, useEffect, useRef, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/sonner';
import { AppShell } from '@/components/chrome/AppShell';
import { ThemeProvider } from '@/components/chrome/ThemeProvider';
import { DensityProvider } from '@/components/chrome/DensityProvider';
import { PwaUpdateNotifier } from '@/components/chrome/PwaUpdateNotifier';
import { TodayPage } from '@/pages/today/TodayPage';
import { FocusPage } from '@/pages/focus/FocusPage';
import NotFound from '@/pages/not-found';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { acquireTimerMasterLock, subscribeToSync } from '@/lib/multi-instance-sync';

/* Route-level code splitting.
 *
 * These were nine static imports, so every page's component tree shipped in the
 * entry chunk whether or not the user ever visited it. Measured: 739.79 kB raw /
 * 197.85 kB gzip for a single chunk, against the repo's own stated 120 kB budget
 * in docs/13 P26.2. The marker scan showed the weight is app code (clerk x392,
 * sonner x126, cmdk x22), not a stray library, so the fix is to not bundle the
 * routes.
 *
 * `/today` and `/focus` stay eager on purpose: Today is the default route and the
 * first paint, and Focus is one tap from the Next Up card, so deferring either
 * would spend a network round trip to save bytes nobody asked to save. NotFound
 * is also eager -- it is six lines and it is the fallback for every unmatched
 * path, so splitting it would add a chunk fetch to the case where something has
 * already gone wrong. The other seven split out.
 *
 * The fallback is `null` rather than a spinner on purpose. A route chunk arrives
 * in well under the time a spinner would be on screen for, and P10 forbids
 * looping motion; a flash of chrome is calmer than a flash of spinner. Every
 * chunk boundary is exercised by the e2e suite, which asserts each of these
 * routes renders and throws no console error. */
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
const OnboardingPage = lazy(() =>
  import('@/pages/onboarding/OnboardingPage').then((m) => ({ default: m.OnboardingPage })),
);
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const LandingPage = lazy(() => import('@/pages/landing/LandingPage').then((m) => ({ default: m.LandingPage })));
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

const noBox = '!shadow-none !border-0 !bg-transparent !rounded-none';
const txtFg = 'text-foreground';
const txtMuted = 'text-muted-foreground';
const fg = 'hsl(var(--foreground))';
const mut = 'hsl(var(--muted))';

const clerkAppearance = {
  theme: shadcn,
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: 'hsl(var(--accent))',
    colorForeground: fg,
    colorMutedForeground: 'hsl(var(--muted-foreground))',
    colorDanger: 'hsl(var(--destructive))',
    colorBackground: 'hsl(var(--card))',
    colorInput: mut,
    colorInputForeground: fg,
    colorNeutral: mut,
    fontFamily: 'var(--global-font-sans)',
    borderRadius: '0.875rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-card rounded-lg w-[440px] max-w-full overflow-hidden border border-border-control shadow-2xl',
    card: noBox,
    footer: noBox,
    headerTitle: `${txtFg} font-extrabold tracking-tight`,
    headerSubtitle: txtMuted,
    socialButtonsBlockButtonText: txtFg,
    formFieldLabel: txtFg,
    footerActionLink: 'text-accent',
    footerActionText: txtMuted,
    dividerText: txtMuted,
    formButtonPrimary: `bg-accent ${txtFg} font-bold hover:brightness-110 shadow-md`,
    formFieldInput: `bg-muted ${txtFg} border-border-control focus:border-accent`,
    socialButtonsBlockButton: 'bg-muted border-border-control hover:bg-muted',
    dividerLine: 'bg-card/[0.1]',
    alert: 'bg-destructive/15 border-destructive/30',
    alertText: txtFg,
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

  return (
    <Suspense fallback={null}>
      <LandingPage />
    </Suspense>
  );
}

function SignInPage() {
  return (
    <main id="main-content" role="main" className="grid min-h-[100dvh] place-items-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        fallbackRedirectUrl="/today"
        forceRedirectUrl="/today"
      />
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
      />
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
            <Route path="/today" component={TodayPage} />
            <Route path="/inbox" component={InboxPage} />
            <Route path="/focus" component={FocusPage} />
            <Route path="/calendar" component={CalendarPage} />
            <Route path="/projects" component={ProjectsPage} />
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

  useEffect(() => {
    if (isSignedIn) {
      setAuthTokenGetter(async () => {
        try {
          return await getToken();
        } catch {
          return null;
        }
      });
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
    return (
      <Suspense fallback={null}>
        {location === '/download' ? <DownloadPage /> : <LandingPage />}
      </Suspense>
    );
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
          <Toaster position="bottom-right" richColors />
          <PwaUpdateNotifier />
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