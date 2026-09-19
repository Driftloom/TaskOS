import { useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from '@/components/chrome/AppShell';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { CommandPalette } from '@/components/chrome/CommandPalette';
import { TaskEditor } from '@/components/task/TaskEditor';

import { TodayPage } from '@/pages/today/TodayPage';
import { InboxPage } from '@/pages/inbox/InboxPage';
import { FocusPage } from '@/pages/focus/FocusPage';
import { CalendarPage } from '@/pages/calendar/CalendarPage';
import { ReviewPage } from '@/pages/review/ReviewPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { LandingPage } from '@/pages/landing/LandingPage';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 10,
      retry: 1,
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
    colorPrimary: '#FF9F0A', // Apple Clock Energy Orange
    colorForeground: '#F5F5F7',
    colorMutedForeground: '#98989D',
    colorDanger: '#FF453A',
    colorBackground: '#1C1C1E',
    colorInput: '#262628',
    colorInputForeground: '#F5F5F7',
    colorNeutral: '#3A3A3C',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, sans-serif',
    borderRadius: '0.875rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#1C1C1E] rounded-3xl w-[440px] max-w-full overflow-hidden border border-white/[0.08] shadow-2xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#F5F5F7] font-extrabold tracking-tight',
    headerSubtitle: 'text-[#98989D]',
    socialButtonsBlockButtonText: 'text-[#F5F5F7]',
    formFieldLabel: 'text-[#F5F5F7]',
    footerActionLink: 'text-[#FF9F0A]',
    footerActionText: 'text-[#98989D]',
    dividerText: 'text-[#98989D]',
    formButtonPrimary: 'bg-[#FF9F0A] text-[#000000] font-bold hover:brightness-110 shadow-md',
    formFieldInput: 'bg-[#262628] text-[#F5F5F7] border-white/[0.1] focus:border-[#FF9F0A]',
    socialButtonsBlockButton: 'bg-[#262628] border-white/[0.1] hover:bg-[#323236]',
    dividerLine: 'bg-white/[0.1]',
    alert: 'bg-[#FF453A]/15 border-[#FF453A]/30',
    alertText: 'text-[#F5F5F7]',
  },
};

function LoadingScreen() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background text-foreground">
      <div className="text-center animate-enter">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_30px_rgba(255,159,10,0.3)]">
          <span className="font-mono text-base font-bold">C</span>
        </div>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
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
        <LandingPage />
      </Show>
    </>
  );
}

function SignInPage() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

function ProtectedRouter() {
  const { isLoaded, isSignedIn } = useAuth();
  const [location, setLocation] = useLocation();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  // Global Keyboard Shortcuts
  useKeyboardShortcuts({
    onQuickCapture: () => setCaptureOpen(true),
    onCommandPalette: () => setCmdOpen(true),
    onNavigate: (path) => setLocation(path),
  });

  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <Redirect to="/" />;

  return (
    <ErrorBoundary resetKey={location}>
      <AppShell>
        <Switch>
          <Route path="/today" component={TodayPage} />
          <Route path="/inbox" component={InboxPage} />
          <Route path="/focus" component={FocusPage} />
          <Route path="/calendar" component={CalendarPage} />
          <Route path="/review" component={ReviewPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </AppShell>

      {/* Global Command Palette */}
      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onSelectNewTask={() => setCaptureOpen(true)}
        onNavigate={(path) => setLocation(path)}
      />

      {/* Global Quick Task Capture */}
      {captureOpen && (
        <TaskEditor
          onClose={() => setCaptureOpen(false)}
          onSaved={() => setCaptureOpen(false)}
        />
      )}
    </ErrorBoundary>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { userId } = useAuth();
  const previousUserId = useRef<string | null | undefined>(undefined);
  const currentQueryClient = useQueryClient();

  useEffect(() => {
    if (
      previousUserId.current !== undefined &&
      previousUserId.current !== userId
    ) {
      currentQueryClient.clear();
    }
    previousUserId.current = userId;
  }, [currentQueryClient, userId]);

  return null;
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
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route component={ProtectedRouter} />
        </Switch>
        <Toaster position="bottom-right" richColors />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <Router />
      </WouterRouter>
    </TooltipProvider>
  );
}

export default App;