import { useSyncExternalStore } from 'react';
import { getDevMockActive, subscribeDevMockActive } from './dev-mock';

/**
 * useDevMockActive — true while the dev mock is serving sample data.
 *
 * The dev mock answers API requests with hand-written fixtures when the local
 * backend has no session for the developer. Those fixtures are NOT the user's
 * account, so the shell labels them: this hook is how `AppShell` learns that
 * the data on screen is sample data.
 *
 * `useSyncExternalStore` over a tiny emitter is enough: the flag flips once,
 * from `false` to `true`, and never flips back (the mock is installed for the
 * lifetime of the page).
 */
export function useDevMockActive(): boolean {
  return useSyncExternalStore(subscribeDevMockActive, getDevMockActive, () => false);
}
