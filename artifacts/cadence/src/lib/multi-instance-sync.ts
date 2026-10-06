/**
 * Multi-Instance & Session Synchronization
 *
 * Coordinates state across multiple browser tabs, installed desktop PWAs,
 * and Android TWA instances running concurrently on the same machine/device.
 *
 * 1. Auth & Data Sync: BroadcastChannel('cadence_sync') broadcasts logout and cache invalidation.
 * 2. Focus Timer Master Election: Uses Web Locks API (navigator.locks) so only ONE
 *    master instance plays the completion chime and notification sound.
 * 3. Draft Preservation: Safe sessionStorage caching for unsaved inputs.
 */

const SYNC_CHANNEL_NAME = 'cadence_sync_channel';

export type SyncMessage =
  | { type: 'AUTH_LOGOUT' }
  | { type: 'CACHE_INVALIDATE'; key?: string }
  | { type: 'TIMER_RING'; roundId?: string };

let channel: BroadcastChannel | null = null;

function getSyncChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
    return null;
  }
  if (!channel) {
    try {
      channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
    } catch {
      channel = null;
    }
  }
  return channel;
}

/**
 * Broadcast an event to all other open tabs/windows of Cadence
 */
export function broadcastSync(message: SyncMessage): void {
  const ch = getSyncChannel();
  if (ch) {
    try {
      ch.postMessage(message);
    } catch (e) {
      console.warn('Failed to broadcast sync message:', e);
    }
  }
}

/**
 * Listen for sync events from peer instances
 */
export function subscribeToSync(handler: (message: SyncMessage) => void): () => void {
  const ch = getSyncChannel();
  if (!ch) return () => {};

  const onMessage = (e: MessageEvent<SyncMessage>) => {
    if (e.data && e.data.type) {
      handler(e.data);
    }
  };

  ch.addEventListener('message', onMessage);
  return () => {
    ch.removeEventListener('message', onMessage);
  };
}

/**
 * Master Election for Audio / Notification exclusivity.
 * Uses Web Locks API to ensure only ONE active tab acts as the master
 * audio emitter for completed focus sessions.
 */
let isCurrentlyMaster = false;
let releaseMasterLock: (() => void) | null = null;

export function acquireTimerMasterLock(): void {
  if (typeof window === 'undefined') return;

  if ('locks' in navigator && navigator.locks) {
    navigator.locks
      .request('cadence_audio_master_lock', { ifAvailable: true }, async (lock) => {
        if (!lock) {
          // Another tab is already the master
          isCurrentlyMaster = false;
          return;
        }

        // We acquired the master lock!
        isCurrentlyMaster = true;

        await new Promise<void>((resolve) => {
          releaseMasterLock = resolve;
          window.addEventListener('beforeunload', () => resolve(), { once: true });
        });

        isCurrentlyMaster = false;
      })
      .catch(() => {
        // Fallback: single tab mode
        isCurrentlyMaster = true;
      });
  } else {
    // Fallback when Web Locks API is unavailable
    isCurrentlyMaster = true;
  }
}

export function isAudioMaster(): boolean {
  // If only 1 instance or master elected, return true
  return isCurrentlyMaster;
}

/**
 * Draft Persistence for Unsaved Inputs
 */
const DRAFT_PREFIX = 'cadence_draft_';

export function saveInputDraft(formId: string, content: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (!content.trim()) {
      window.sessionStorage.removeItem(DRAFT_PREFIX + formId);
    } else {
      window.sessionStorage.setItem(DRAFT_PREFIX + formId, content);
    }
  } catch {
    // ignore
  }
}

export function loadInputDraft(formId: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(DRAFT_PREFIX + formId) || '';
  } catch {
    return '';
  }
}

export function clearInputDraft(formId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(DRAFT_PREFIX + formId);
  } catch {
    // ignore
  }
}
