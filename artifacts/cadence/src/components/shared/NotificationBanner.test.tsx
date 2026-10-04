import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationBanner } from './NotificationBanner';

describe('NotificationBanner component', () => {
  const originalNotification = globalThis.Notification;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.Notification = originalNotification;
  });

  it('renders nothing when permission is granted', () => {
    globalThis.Notification = {
      permission: 'granted',
    } as unknown as typeof Notification;

    const { container } = render(<NotificationBanner context="focus" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders focus alert banner when permission is default', () => {
    globalThis.Notification = {
      permission: 'default',
      requestPermission: vi.fn(),
    } as unknown as typeof Notification;

    render(<NotificationBanner context="focus" />);
    expect(screen.getByText('Focus Timer Alerts are Muted')).toBeInTheDocument();
    expect(screen.getByText('Enable Alerts')).toBeInTheDocument();
  });

  it('renders blocked warning when permission is denied', () => {
    globalThis.Notification = {
      permission: 'denied',
    } as unknown as typeof Notification;

    render(<NotificationBanner context="focus" />);
    expect(
      screen.getByText('Notifications Blocked in Browser Settings'),
    ).toBeInTheDocument();
  });

  it('hides banner when user clicks dismiss', () => {
    globalThis.Notification = {
      permission: 'default',
    } as unknown as typeof Notification;

    render(<NotificationBanner context="focus" />);
    const dismissButton = screen.getByLabelText('Dismiss notification reminder');
    fireEvent.click(dismissButton);

    expect(screen.queryByText('Focus Timer Alerts are Muted')).not.toBeInTheDocument();
  });
});
