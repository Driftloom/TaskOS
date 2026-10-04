import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getNotificationPermission,
  isNotificationSupported,
  requestNotificationPermission,
  sendLocalNotification,
  NOTIFICATION_EVENT,
} from './notifications';

describe('notifications utility', () => {
  const originalNotification = globalThis.Notification;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.Notification = originalNotification;
  });

  it('detects when Notification is unsupported', () => {
    // @ts-expect-error delete for testing unsupported environment
    delete globalThis.Notification;
    expect(isNotificationSupported()).toBe(false);
    expect(getNotificationPermission()).toBe('unsupported');
  });

  it('reads permission state when supported', () => {
    globalThis.Notification = {
      permission: 'default',
      requestPermission: vi.fn(),
    } as unknown as typeof Notification;

    expect(isNotificationSupported()).toBe(true);
    expect(getNotificationPermission()).toBe('default');
  });

  it('requests permission and dispatches event', async () => {
    const requestMock = vi.fn().mockResolvedValue('granted');
    globalThis.Notification = {
      permission: 'default',
      requestPermission: requestMock,
    } as unknown as typeof Notification;

    let eventFired = false;
    const listener = () => {
      eventFired = true;
    };
    window.addEventListener(NOTIFICATION_EVENT, listener);

    const result = await requestNotificationPermission();

    expect(requestMock).toHaveBeenCalled();
    expect(result).toBe('granted');
    expect(eventFired).toBe(true);

    window.removeEventListener(NOTIFICATION_EVENT, listener);
  });

  it('does not send local notification if not granted', async () => {
    globalThis.Notification = {
      permission: 'default',
    } as unknown as typeof Notification;

    const result = await sendLocalNotification('Test');
    expect(result).toBe(false);
  });
});
