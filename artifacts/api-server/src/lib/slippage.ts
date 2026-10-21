/**
 * On-time completion rate for the slippage lookback window.
 *
 * Returns `null` when nothing completed in the window. An empty window is an
 * empty sample, not a perfect day: reporting 1.0 there made the API claim a
 * flawless 100% on-time rate that no task ever earned, and every consumer
 * downstream had to guess whether it was reading a real rate.
 *
 * `null` is the only honest value for "no sample yet".
 *
 * Pure by design (no db, no clock, no request scope) so it can be unit
 * tested directly. Covered by `src/routes/analytics.test.ts`.
 */
export function computeOnTimeRate(
  completedOnTime: number,
  completedInWindow: number,
): number | null {
  if (completedInWindow <= 0) return null;
  return Number((completedOnTime / completedInWindow).toFixed(2));
}
