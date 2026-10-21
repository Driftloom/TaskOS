import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsPage } from './SettingsPage';

/**
 * Every setting on this page is a FACT the server reports. The mocks below
 * hand the page a server that could not be reached for the two queries the
 * test cares about (automation flags, focus settings), so the page has to say
 * "unknown" instead of inventing a value.
 */
const server = vi.hoisted(() => ({
  flagsFailed: true,
  focusFailed: true,
  notifFailed: false,
}));

vi.mock('@workspace/api-client-react', () => ({
  useGetFocusSettings: () => ({
    data: server.focusFailed ? undefined : { dailyTarget: 6 },
    isLoading: false,
    isError: server.focusFailed,
    refetch: vi.fn(),
  }),
  useUpdateFocusSettings: () => ({ mutate: vi.fn(), isPending: false }),
  useGetNotificationSettings: () => ({
    data: server.notifFailed
      ? undefined
      : {
          timezone: 'Asia/Kolkata',
          flexible24h: true,
          workStart: 9,
          workEnd: 18,
          quietStart: 0,
          quietEnd: 7,
          telegramChatId: null,
          remindersEnabled: true,
        },
    isLoading: false,
    isError: server.notifFailed,
    refetch: vi.fn(),
  }),
  useUpdateNotificationSettings: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useListTasks: () => ({ data: [], isLoading: false }),
  getGetFocusSettingsQueryKey: () => ['focus-settings'],
  getGetNotificationSettingsQueryKey: () => ['notification-settings'],
}));

vi.mock('@/components/chrome/AutomationPausedBanner', () => ({
  useAutomationToggle: () => ({
    flags: {
      data: undefined,
      isLoading: false,
      isError: server.flagsFailed,
      refetch: vi.fn(),
    },
    setFlag: vi.fn(),
    resume: vi.fn(),
  }),
  AutomationPausedBanner: () => null,
}));

vi.mock('./MessagingIntegrationsView', () => ({
  MessagingIntegrationsView: () => <div data-testid="messaging-integrations-mock" />,
}));

vi.mock('./AgentSettingsView', () => ({
  AgentSettingsView: () => <div data-testid="agent-settings-mock" />,
}));

function renderSettingsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsPage />
    </QueryClientProvider>,
  );
}

describe('SettingsPage — unknown settings state', () => {
  it('never renders the kill switches as on when the flags query failed', () => {
    renderSettingsPage();

    expect(screen.queryByTestId('button-toggle-reminders-flag')).not.toBeInTheDocument();
    expect(screen.queryByTestId('button-toggle-reschedule-flag')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /Reminders Dispatcher/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('status-error')).toBeInTheDocument();
  });

  it('never renders a default focus target when the focus query failed', () => {
    renderSettingsPage();

    const row = screen.getByTestId('settings-row-focus-target');
    expect(row).not.toHaveTextContent('4');
    expect(row).toHaveTextContent('—');
  });

  it('omits the workday from the exported backup when the settings query failed', () => {
    server.notifFailed = true;
    let exported = '';
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function capture(this: HTMLAnchorElement) {
        exported = decodeURIComponent(this.getAttribute('href') ?? '');
      });

    renderSettingsPage();
    screen.getByTestId('button-export-json').click();

    expect(exported).toContain('"exportedAt"');
    expect(exported).not.toContain('"workStart"');
    expect(exported).not.toContain('"workEnd"');
    clickSpy.mockRestore();
    server.notifFailed = false;
  });
});
