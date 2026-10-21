import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfilePage } from './ProfilePage';

/**
 * The integrations status is the ONLY source of truth for the channel cards.
 * The mocked hook returns it verbatim, so a test can hand the page a server
 * that says "two devices are subscribed", one that says "none are", or one
 * that could not be reached at all.
 */
const integrations = vi.hoisted(() => ({
  status: undefined as
    | {
        telegram: { configured: boolean; botUsername?: string };
        healthchecks: { configured: boolean };
        push?: { enabled: boolean; deviceCount?: number };
      }
    | undefined,
}));

vi.mock('@clerk/react', () => ({
  useUser: () => ({
    user: {
      id: 'user_test',
      fullName: 'Test User',
      primaryEmailAddress: { emailAddress: 'test@example.com' },
    },
  }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock('@workspace/api-client-react', () => ({
  useListTasks: () => ({ data: [] }),
  useGetTaskSummary: () => ({
    data: { total: 0, completed: 0, open: 0, focusMinutes: 0 },
  }),
  useGetMomentum: () => ({ data: { streakDays: 0 } }),
  useListMemoryFacts: () => ({ data: { facts: [] } }),
  useGetIntegrationsStatus: () => ({
    data: integrations.status,
    isLoading: false,
    isError: integrations.status === undefined,
    refetch: vi.fn(),
  }),
  useGetNotificationSettings: () => ({
    data: {
      timezone: 'Asia/Kolkata',
      flexible24h: true,
      workStart: 0,
      workEnd: 23,
      quietStart: 0,
      quietEnd: 0,
      telegramChatId: null,
      remindersEnabled: true,
    },
    isLoading: false,
    isError: false,
  }),
  useUpdateNotificationSettings: () => ({ mutate: vi.fn() }),
  getTelegramPairingToken: vi.fn(),
}));

function renderProfilePage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfilePage />
    </QueryClientProvider>,
  );
}

describe('ProfilePage — connected channels', () => {
  it('never claims web push is unimplemented', () => {
    integrations.status = {
      telegram: { configured: false },
      healthchecks: { configured: false },
      push: { enabled: true, deviceCount: 2 },
    };
    renderProfilePage();

    expect(screen.queryByText(/NOT IMPLEMENTED/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no web-push delivery/i)).not.toBeInTheDocument();
    // The positive half: the page must actually show the real state, so this
    // test cannot pass against a page that rendered nothing at all.
    expect(screen.getByText('Active — 2 device(s) subscribed')).toBeInTheDocument();
  });

  it('reports the real web-push state and the real device count', () => {
    integrations.status = {
      telegram: { configured: false },
      healthchecks: { configured: false },
      push: { enabled: true, deviceCount: 2 },
    };
    renderProfilePage();

    expect(screen.getByText('Active — 2 device(s) subscribed')).toBeInTheDocument();
  });

  it('says "Not subscribed" and points at Settings when no device is registered', () => {
    integrations.status = {
      telegram: { configured: false },
      healthchecks: { configured: false },
      push: { enabled: false, deviceCount: 0 },
    };
    renderProfilePage();

    expect(screen.getByText('Not subscribed')).toBeInTheDocument();
    // The WEB PUSH card's own link. The Telegram card also links to
    // /settings ("Pair in Settings"), so a query by /settings/i matched that
    // one and passed for the wrong reason: the Web Push link's href was
    // never checked. The name below belongs to the Web Push card alone.
    const link = screen.getByRole('link', { name: /manage device alerts/i });
    expect(link).toHaveAttribute('href', '/settings');
  });

  it('shows the unknown state instead of a claim when the status could not be read', () => {
    integrations.status = undefined;
    renderProfilePage();

    expect(screen.queryByText('Not subscribed')).not.toBeInTheDocument();
    expect(screen.queryByText(/Active —/)).not.toBeInTheDocument();
    expect(screen.getByTestId('status-error')).toBeInTheDocument();
  });
});
