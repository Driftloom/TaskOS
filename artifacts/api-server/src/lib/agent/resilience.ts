/**
 * Retry, fallback and circuit breaking for outbound LLM calls.
 *
 * ## Retry and fallback are two different things
 *
 * - **Retry** stays on the same provider (the model was rate-limited, the socket
 *   blipped). Capped, jittered, and never for a 4xx.
 * - **Fallback** moves to the next provider when this one is unusable (bad key,
 *   persistent 5xx, breaker open). `engine.ts` previously conflated these into a
 *   single attempt with no retry at all.
 *
 * ## Never retry a 4xx
 *
 * LiteLLM's `RetryPolicy` sets `AuthenticationErrorRetries=0`, and AWS's
 * Builders' Library is explicit: retry only transient failures, never 4xx. A
 * rejected key or a malformed request will be rejected identically on the second
 * attempt — retrying just burns latency and rate-limit headroom.
 *
 * ## The one hard boundary
 *
 * Retry wraps **the HTTP call to the model only**. It must never wrap
 * `executeAgentTool`. Tool execution has side effects — a timeout after
 * `create_task` commits, followed by a retry, creates the task twice. See
 * `engine-tools.test.ts`, which asserts `agent_action_log` row counts rather than
 * success booleans for exactly this reason.
 */

export type FailureKind =
  | "auth"          // 401 / 403 — wrong or revoked key
  | "rate_limit"    // 429
  | "timeout"       // client-side abort
  | "server"        // 5xx
  | "bad_request"   // other 4xx — malformed request, unknown model
  | "network";      // DNS, connection reset, TLS

export interface ProviderHttpError extends Error {
  status?: number;
  retryAfterMs?: number;
}

const RETRYABLE: ReadonlySet<FailureKind> = new Set<FailureKind>([
  "rate_limit",
  "timeout",
  "server",
  "network",
]);

export function isRetryable(kind: FailureKind): boolean {
  return RETRYABLE.has(kind);
}

/** Maps an HTTP status or thrown error onto a {@link FailureKind}. */
export function classifyFailure(err: unknown): FailureKind {
  const status = (err as ProviderHttpError | undefined)?.status;

  if (status !== undefined) {
    if (status === 401 || status === 403) return "auth";
    if (status === 429) return "rate_limit";
    if (status >= 500) return "server";
    if (status >= 400) return "bad_request";
  }

  if (isAbortError(err)) return "timeout";
  // `fetch` rejects with a TypeError for DNS/connection/TLS failures.
  if (err instanceof TypeError) return "network";

  const code = (err as { code?: string } | undefined)?.code;
  if (code && ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "EPIPE"].includes(code)) {
    return "network";
  }

  return "network";
}

function isAbortError(err: unknown): boolean {
  if (err instanceof Error && err.name === "AbortError") return true;
  return (err as { name?: string } | undefined)?.name === "AbortError";
}

/**
 * Parse `Retry-After`, which is either delta-seconds or an HTTP date.
 *
 * Honored on 429s: a provider telling us "wait 20s" and being retried after
 * 400ms of jitter just burns the quota it was protecting.
 */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.min(Math.max(date - now, 0), 60_000);
}

/** Capped exponential backoff with full jitter. */
export function backoffDelay(
  attempt: number,
  baseMs = 300,
  capMs = 8_000,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(baseMs * 2 ** attempt, capMs);
  return Math.floor(random() * ceiling);
}

export interface RetryOptions {
  maxAttempts?: number;
  baseMs?: number;
  capMs?: number;
  signal?: AbortSignal;
  /** Injectable for deterministic tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Aborted"));
      return;
    }
    const id = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(signal?.reason ?? new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface RetryOutcome<T> {
  value?: T;
  error?: unknown;
  kind: FailureKind | null;
  attempts: number;
}

/**
 * Runs `fn` with retries on the same provider.
 *
 * Stops immediately on a non-retryable kind and reports it, so the caller can
 * move to the next provider rather than burning its budget on a doomed request.
 */
export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<RetryOutcome<T>> {
  const {
    maxAttempts = 3,
    baseMs = 300,
    capMs = 8_000,
    signal,
    sleep = defaultSleep,
    random = Math.random,
  } = options;

  let lastError: unknown;
  let lastKind: FailureKind | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const value = await fn(attempt);
      return { value, kind: null, attempts: attempt + 1 };
    } catch (err) {
      lastError = err;
      lastKind = classifyFailure(err);

      if (!isRetryable(lastKind)) {
        return { error: err, kind: lastKind, attempts: attempt + 1 };
      }

      const isLast = attempt === maxAttempts - 1;
      if (isLast) break;

      const explicit = (err as ProviderHttpError | undefined)?.retryAfterMs;
      const delay = explicit ?? backoffDelay(attempt, baseMs, capMs, random);
      await sleep(delay, signal);
    }
  }

  return { error: lastError, kind: lastKind, attempts: maxAttempts };
}

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

export type BreakerState = "closed" | "open" | "half_open";

export interface BreakerOptions {
  /** Consecutive failures needed to trip. */
  failureThreshold?: number;
  /** How long the open state lasts before a probe is allowed. */
  cooldownMs?: number;
  /** Probes allowed in half-open before deciding. */
  halfOpenProbes?: number;
  /** Injected for tests. */
  now?: () => number;
}

export interface BreakerSnapshot {
  state: BreakerState;
  failures: number;
  openedAt: number | null;
  probesInFlight: number;
}

/**
 * Per-provider circuit breaker: Closed → Open → Half-Open.
 *
 * A breaker that does not fail fast keeps piling requests onto a dependency that
 * is already down, which converts one outage into queue growth across the whole
 * process. Keyed per provider so a dead Gemini key does not stop Groq from
 * serving traffic.
 */
export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly halfOpenProbes: number;
  private readonly now: () => number;

  private failures = 0;
  private openedAt: number | null = null;
  private probesInFlight = 0;

  constructor(options: BreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 6;
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.halfOpenProbes = options.halfOpenProbes ?? 2;
    this.now = options.now ?? (() => Date.now());
  }

  snapshot(): BreakerSnapshot {
    return {
      state: this.state(),
      failures: this.failures,
      openedAt: this.openedAt,
      probesInFlight: this.probesInFlight,
    };
  }

  state(): BreakerState {
    if (this.openedAt === null) return "closed";
    return this.now() - this.openedAt >= this.cooldownMs ? "half_open" : "open";
  }

  /** True when a call should be attempted right now. */
  canAttempt(): boolean {
    const state = this.state();
    if (state === "closed") return true;
    if (state === "open") return false;
    return this.probesInFlight < this.halfOpenProbes;
  }

  onSuccess(): void {
    // A healthy probe fully restores the breaker — failures reset so the next
    // outage counts from zero rather than resuming mid-count.
    this.failures = 0;
    this.openedAt = null;
    this.probesInFlight = 0;
  }

  onFailure(): void {
    if (this.state() === "half_open") {
      // A failed probe re-opens immediately: half-open means "test once", not
      // "send real traffic back".
      this.openedAt = this.now();
      this.probesInFlight = 0;
      return;
    }
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.openedAt = this.now();
    }
  }

  beginAttempt(): void {
    if (this.state() === "half_open") this.probesInFlight += 1;
  }
}

/** Breaker registry, one per provider id. */
export class BreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(private readonly options: BreakerOptions = {}) {}

  forProvider(id: string): CircuitBreaker {
    let breaker = this.breakers.get(id);
    if (!breaker) {
      breaker = new CircuitBreaker(this.options);
      this.breakers.set(id, breaker);
    }
    return breaker;
  }

  snapshots(): Record<string, BreakerSnapshot> {
    const out: Record<string, BreakerSnapshot> = {};
    for (const [id, breaker] of this.breakers) out[id] = breaker.snapshot();
    return out;
  }

  reset(): void {
    this.breakers.clear();
  }
}