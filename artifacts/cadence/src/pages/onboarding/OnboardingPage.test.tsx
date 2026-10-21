import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OnboardingPage } from './OnboardingPage';

/**
 * The wizard may only write what it actually read. These tests drive the
 * real three-step wizard to "Complete Setup" and inspect the payload it
 * PATCHes, because a field written from an unanswered query is a field
 * written from a guess.
 */
const server = vi.hoisted(() => ({
  integrations: 'loading' as 'loading' | 'answered' | 'failed',
  notificationsFailed: false,
  rescheduleFailed: false,
  calls: {
    notifications: [] as { data: Record<string, unknown> }[],
    reschedule: [] as { data: Record<string, unknown> }[],
  },
}));

vi.mock('@workspace/api-client-react', () => ({
  useGetNotificationSettings: () => ({
    data: server.notificationsFailed
      ? undefined
      : {
          telegramChatId: null,
          quietStart: 0,
          quietEnd: 7,
          timezone: 'Asia/Kolkata',
          remindersEnabled: true,
          flexible24h: true,
          workStart: 9,
          workEnd: 18,
        },
    isLoading: false,
    isError: server.notificationsFailed,
  }),
  useGetRescheduleSettings: () => ({
    data: server.rescheduleFailed
      ? undefined
      : {
          defaultMode: 'auto',
          maxMoves: 5,
          createdAt: '2026-10-20T00:00:00.000Z',
          updatedAt: '2026-10-20T00:00:00.000Z',
        },
    isLoading: false,
    isError: server.rescheduleFailed,
  }),
  useGetIntegrationsStatus: () => ({
    data:
      server.integrations === 'answered'
        ? {
            telegram: { configured: false },
            healthchecks: { configured: true },
            push: { enabled: false, deviceCount: 0 },
          }
        : undefined,
    isLoading: server.integrations === 'loading',
    isError: server.integrations === 'failed',
    refetch: vi.fn(),
  }),
  useUpdateNotificationSettings: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn((args: { data: Record<string, unknown> }) => {
      server.calls.notifications.push(args);
      return Promise.resolve({});
    }),
  }),
  useUpdateRescheduleSettings: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn((args: { data: Record<string, unknown> }) => {
      server.calls.reschedule.push(args);
      return Promise.resolve({});
    }),
  }),
  useSendTelegramTestMessage: () => ({ mutate: vi.fn() }),
}));

vi.mock('wouter', () => ({ useLocation: () => ['/', vi.fn()] }));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('@/lib/sound-fx', () => ({
  soundFX: {
    playClick: vi.fn(),
    playTactileClick: vi.fn(),
    playCelebration: vi.fn(),
    isEnabled: () => false,
  },
}));

vi.mock('@/lib/notifications', () => ({
  useNotificationPermission: () => ({
    isGranted: false,
    isDenied: false,
    isDefault: true,
    requestPermission: vi.fn(),
    sendTestNotification: vi.fn(),
    refreshPermission: vi.fn(),
  }),
}));

async function completeSetup() {
  render(<OnboardingPage />);
  fireEvent.click(screen.getByText('Next Step'));
  fireEvent.click(screen.getByText('Next Step'));
  fireEvent.click(screen.getByRole('button', { name: /Complete Setup/i }));
  await waitFor(() =>
    expect(
      server.calls.notifications.length + server.calls.reschedule.length,
    ).toBeGreaterThan(0),
  );
}

describe('OnboardingPage — what the wizard is allowed to write', () => {
  beforeEach(() => {
    server.integrations = 'loading';
    server.notificationsFailed = false;
    server.rescheduleFailed = false;
    server.calls.notifications = [];
    server.calls.reschedule = [];
  });

  it('never writes remindersEnabled from an integrations query that has not answered', async () => {
    server.integrations = 'loading';

    await completeSetup();

    expect(server.calls.notifications).toHaveLength(1);
    expect(server.calls.notifications[0].data).not.toHaveProperty('remindersEnabled');
  });

  it('writes remindersEnabled once the integrations answer is known', async () => {
    server.integrations = 'answered';

    await completeSetup();

    expect(server.calls.notifications).toHaveLength(1);
    expect(server.calls.notifications[0].data).toHaveProperty('remindersEnabled', true);
  });

  it('writes nothing for a settings group it could not read', async () => {
    server.notificationsFailed = true;

    await completeSetup();

    expect(server.calls.notifications).toHaveLength(0);
    expect(server.calls.reschedule).toHaveLength(1);
    expect(screen.getByTestId('onboarding-prefetch-warning')).toBeInTheDocument();
  });
});
