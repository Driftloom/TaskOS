import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getTelegramPairingToken } from '@workspace/api-client-react';
import { MessagingIntegrationsView } from './MessagingIntegrationsView';

vi.mock('@/lib/notifications', () => ({
  useNotificationPermission: () => ({
    permission: 'granted',
    isGranted: true,
    isDenied: false,
    requestPermission: vi.fn().mockResolvedValue('granted'),
    sendTestNotification: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('@workspace/api-client-react', () => ({
  useGetIntegrationsStatus: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useConnectTelegram: () => ({ mutate: vi.fn(), isPending: false }),
  useSendTelegramTestMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useTestHealthcheckPing: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveHealthcheckSettings: () => ({ mutate: vi.fn(), isPending: false }),
  getTelegramPairingToken: vi.fn(),
  getTelegramPairingStatus: vi.fn().mockResolvedValue({ status: 'pending' }),
  useGetVapidPublicKey: () => ({ data: { publicKey: 'BPublicKey' } }),
  useSubscribePushNotifications: () => ({ mutate: vi.fn(), isPending: false }),
  useUnsubscribePushNotifications: () => ({ mutate: vi.fn(), isPending: false }),
  useSendTestPushNotification: () => ({ mutate: vi.fn(), isPending: false }),
}));

const PAIRING_TOKEN = {
    token: 'pairing-token-123',
    deepLink: 'tg://resolve?domain=cadence_bot&start=pairing-token-123',
    qrUrl: 'https://example.com/qr.png',
    botUsername: 'cadence_bot',
    expiresAt: '2026-10-21T00:00:00Z',
  };

/** jsdom lays nothing out, so getClientRects reports empty rects and nothing
   is "reachable" per useModalFocus. Report a non-empty rect so the focus trap
   can move focus into the overlay the way a real browser would. */
const RECT_SHIM = { length: 1 } as unknown as DOMRectList;
let realGetClientRects: typeof Element.prototype.getClientRects;
beforeEach(() => {
  // `restoreMocks: true` resets mock implementations before each test, so
  // re-apply the pairing-token resolution here.
  vi.mocked(getTelegramPairingToken).mockResolvedValue(PAIRING_TOKEN);
  realGetClientRects = Element.prototype.getClientRects;
  Element.prototype.getClientRects = function getClientRects() {
    return RECT_SHIM;
  };
});
afterEach(() => {
  Element.prototype.getClientRects = realGetClientRects;
});

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MessagingIntegrationsView />
    </QueryClientProvider>,
  );
}

describe('MessagingIntegrationsView — credentials and QR pairing modal', () => {
  it('associates the credential labels with their inputs', () => {
    renderView();

    // The labels carry trailing badges (*REQUIRED / RECOMMENDED), so match by substring.
    expect(screen.getByLabelText(/Telegram Bot Token/)).toHaveAttribute(
      'id',
      'messaging-bot-token',
    );
    expect(screen.getByLabelText(/Allowed Telegram User ID/)).toHaveAttribute(
      'id',
      'messaging-telegram-chat-id',
    );
  });

  it('declares the QR pairing dialog and keeps focus inside it', () => {
    renderView();
    fireEvent.click(screen.getByTestId('button-open-telegram-pairing'));

    const dialog = screen.getByRole('dialog', { name: 'Connect Telegram' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'messaging-qr-modal-heading');
    expect(document.getElementById('messaging-qr-modal-heading')).toBeInTheDocument();

    const first = screen.getByRole('button', { name: 'Close Telegram pairing modal' });

    // Place focus inside the overlay (as the hook does on open in a real browser).
    first.focus();
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Tab in either direction never moves focus out of the overlay.
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
