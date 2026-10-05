import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/sonner';
import { AppShell } from '@/components/chrome/AppShell';
import { ThemeProvider } from '@/components/chrome/ThemeProvider';
import { PwaUpdateNotifier } from '@/components/chrome/PwaUpdateNotifier';
import { TodayPage } from '@/pages/today/TodayPage';
import { FocusPage } from '@/pages/focus/FocusPage';
import NotFound from '@/pages/not-found';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { SpeedInsights } from '@vercel/speed-insights/react';

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      gcTime: 1000 * 60 * 60 * 24,
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

function stripBase(path: string) {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: 'hsl(var(--accent))', // Apple System Blue
    colorForeground: 'hsl(var(--foreground))',
    colorMutedForeground: 'hsl(var(--muted-foreground))',
    colorDanger: 'hsl(var(--destructive))',
    colorBackground: 'hsl(var(--card))',
    colorInput: 'hsl(var(--muted))',
    colorInputForeground: 'hsl(var(--foreground))',
    colorNeutral: 'hsl(var(--muted))',
    fontFamily: 'var(--global-font-sans)',
    borderRadius: '0.875rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-card rounded-2xl w-[440px] max-w-full overflow-hidden border border-border-control shadow-2xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-foreground font-extrabold tracking-tight',
    headerSubtitle: 'text-muted-foreground',
    socialButtonsBlockButtonText: 'text-foreground',
    formFieldLabel: 'text-foreground',
    footerActionLink: 'text-accent',
    footerActionText: 'text-muted-foreground',
    dividerText: 'text-muted-foreground',
    formButtonPrimary: 'bg-accent text-foreground font-bold hover:brightness-110 shadow-md',
    formFieldInput: 'bg-muted text-foreground border-border-control focus:border-accent',
    socialButtonsBlockButton: 'bg-muted border-border-control hover:bg-muted',
    dividerLine: 'bg-card/[0.1]',
    alert: 'bg-destructive/15 border-destructive/30',
    alertText: 'text-foreground',
  },
};

function LoadingScreen() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background text-foreground">
      <div className="text-center animate-enter">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_30px_rgba(255,159,10,0.3)]">
          <span className="font-mono text-base font-bold">C</span>
        </div>
        <p className="mt-4 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Loading your cadence
        </p>
      </div>
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/today" />
      </Show>
      <Show when="signed-out">
        {/* LandingPage is a lazy chunk like the other routes. */}
        <Suspense fallback={null}>
          <LandingPage />
        </Suspense>
      </Show>
    </>
  );
}

function SignInPage() {
  return (
    <main id="main-content" role="main" className="grid min-h-[100dvh] place-items-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
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

function SpeedInsightsTracker() {
  const [location] = useLocation();
  return <SpeedInsights route={location} />;
}

function Router() {
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: 'Welcome back',
            subtitle: 'Sign in to return to your cadence',
          },
        },
        signUp: {
          start: {
            title: 'Create your cadence',
            subtitle: 'A clearer day starts here',
          },
        },
      }}
      routerPush={(to) => {
        window.history.pushState({}, '', stripBase(to));
        window.dispatchEvent(new PopStateEvent('popstate'));
      }}
      routerReplace={(to) => {
        window.history.replaceState({}, '', stripBase(to));
        window.dispatchEvent(new PopStateEvent('popstate'));
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ClerkQueryClientCacheInvalidator />
          <ClerkAuthBridge />
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/download">
              <Suspense fallback={null}>
                <DownloadPage />
              </Suspense>
            </Route>
            <Route component={ProtectedRouter} />
          </Switch>
          <Toaster position="bottom-right" richColors />
          <PwaUpdateNotifier />
          <SpeedInsightsTracker />
        </ThemeProvider>
      </QueryClientProvider>
    </ClerkProvider>
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