import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock BroadcastChannel Implementation
// ---------------------------------------------------------------------------

class MockBroadcastChannel {
  readonly name: string;
  static channels: Map<string, Set<MockBroadcastChannel>> = new Map();
  listeners: Set<(e: MessageEvent) => void> = new Set();

  constructor(name: string) {
    this.name = name;
    if (!MockBroadcastChannel.channels.has(name)) {
      MockBroadcastChannel.channels.set(name, new Set());
    }
    MockBroadcastChannel.channels.get(name)!.add(this);
  }

  postMessage(data: any): void {
    const peers = MockBroadcastChannel.channels.get(this.name);
    if (!peers) return;
    for (const peer of peers) {
      if (peer !== this) {
        const event = new MessageEvent('message', { data });
        peer.listeners.forEach((listener) => listener(event));
      }
    }
  }

  addEventListener(type: string, listener: (e: MessageEvent) => void): void {
    if (type === 'message') {
      this.listeners.add(listener);
    }
  }

  removeEventListener(type: string, listener: (e: MessageEvent) => void): void {
    if (type === 'message') {
      this.listeners.delete(listener);
    }
  }

  close(): void {
    MockBroadcastChannel.channels.get(this.name)?.delete(this);
    this.listeners.clear();
  }

  static reset(): void {
    MockBroadcastChannel.channels.clear();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('multi-instance-sync', () => {
  let originalBroadcastChannel: any;

  beforeEach(() => {
    originalBroadcastChannel = (globalThis as any).BroadcastChannel;
    (globalThis as any).BroadcastChannel = MockBroadcastChannel;
    MockBroadcastChannel.reset();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
    MockBroadcastChannel.reset();
    vi.resetModules();
  });

  // TC-SYN-01
  it('broadcastSync broadcasts an AUTH_LOGOUT message to peer instances', async () => {
    const { broadcastSync } = await import('./multi-instance-sync');

    // Create a simulated peer tab listening on the same channel
    const peerChannel = new MockBroadcastChannel('cadence_sync_channel');
    const received: any[] = [];
    peerChannel.addEventListener('message', (e) => {
      received.push(e.data);
    });

    broadcastSync({ type: 'AUTH_LOGOUT' });

    expect(received).toEqual([{ type: 'AUTH_LOGOUT' }]);
    peerChannel.close();
  });

  // TC-SYN-02
  it('subscribeToSync receives messages sent by peer tabs', async () => {
    const { subscribeToSync } = await import('./multi-instance-sync');

    const received: any[] = [];
    const unsubscribe = subscribeToSync((msg) => {
      received.push(msg);
    });

    // Simulated peer tab emits a cache invalidation event
    const peerChannel = new MockBroadcastChannel('cadence_sync_channel');
    peerChannel.postMessage({ type: 'CACHE_INVALIDATE', key: 'tasks' });

    expect(received).toEqual([{ type: 'CACHE_INVALIDATE', key: 'tasks' }]);
    unsubscribe();
    peerChannel.close();
  });

  // TC-SYN-03
  it('unsubscribe function properly removes the message listener', async () => {
    const { subscribeToSync } = await import('./multi-instance-sync');

    const received: any[] = [];
    const unsubscribe = subscribeToSync((msg) => {
      received.push(msg);
    });

    const peerChannel = new MockBroadcastChannel('cadence_sync_channel');
    peerChannel.postMessage({ type: 'TIMER_RING', roundId: 'r1' });
    expect(received).toHaveLength(1);

    // Unsubscribe and post again
    unsubscribe();
    peerChannel.postMessage({ type: 'TIMER_RING', roundId: 'r2' });
    expect(received).toHaveLength(1);

    peerChannel.close();
  });

  // TC-SYN-04
  it('handles environment where BroadcastChannel is unavailable without throwing', async () => {
    delete (globalThis as any).BroadcastChannel;
    vi.resetModules();

    const { broadcastSync, subscribeToSync } = await import('./multi-instance-sync');

    expect(() => broadcastSync({ type: 'AUTH_LOGOUT' })).not.toThrow();

    const unsubscribe = subscribeToSync(() => {});
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });

  // TC-SYN-05 & TC-SYN-06: Draft persistence
  it('preserves and loads input drafts in sessionStorage', async () => {
    const { saveInputDraft, loadInputDraft, clearInputDraft } = await import('./multi-instance-sync');

    saveInputDraft('task_quick_capture', 'Buy groceries tomorrow at 5pm');
    expect(loadInputDraft('task_quick_capture')).toBe('Buy groceries tomorrow at 5pm');

    // Empty content removes the draft
    saveInputDraft('task_quick_capture', '   ');
    expect(loadInputDraft('task_quick_capture')).toBe('');

    // Re-save and clear explicitly
    saveInputDraft('another_form', 'Draft content');
    expect(loadInputDraft('another_form')).toBe('Draft content');
    clearInputDraft('another_form');
    expect(loadInputDraft('another_form')).toBe('');
  });

  // TC-SYN-07
  it('reports audio master status with default single-tab fallback', async () => {
    const { isAudioMaster } = await import('./multi-instance-sync');
    // In jsdom without navigator.locks, falls back safely
    expect(typeof isAudioMaster()).toBe('boolean');
  });
});
