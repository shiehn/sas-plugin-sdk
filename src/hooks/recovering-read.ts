/**
 * createRecoveringRead — a self-healing read of one piece of host state (the
 * panel bus, its sidechain, its motion), used by `usePanelBus`. Internal: not
 * exported from the package entry.
 *
 * Why (S-019, 2026-09-26): on a slow project load, a panel's FIRST
 * `getPanelBusState` ran against the pre-project startup engine, the project
 * switch reset the plugin host mid-call, and the read REJECTED ("No project is
 * bound"). The hook swallowed the error and kept `bus = null`. The strip
 * renders only when `bus` is set, and nothing re-read until a scene change,
 * so every panel looked as if it had lost its bus FX. Nothing was lost on
 * disk.
 *
 * Recovery, in order of preference:
 *  1. `signal()`: the host's engine-ready event (`host.onEngineReady`, fired on
 *     the engine's `projectLoaded`). It starts a fresh episode: one re-read
 *     once the burst settles, or right after the read that is in flight.
 *  2. A bounded backoff after a failed read (1 s, 2 s, 4 s, 8 s, 15 s = 30 s),
 *     then quiet until the next signal or a new reader (scene change).
 *
 * Invariants:
 *  - Recovery reads never overlap: a retry that comes due while the latest
 *    read is still pending is dropped (that read re-arms the backoff if it
 *    fails), and a signal that lands mid-read queues ONE re-read after it.
 *    Explicit `read()` calls (initial load, post-mutation) run immediately.
 *  - The latest-started read wins; a superseded read's result is discarded.
 *  - A failed or empty (null/undefined) read keeps the previous value.
 *  - `dispose()` (unmount, scene change) cancels every timer and discards
 *    reads still in flight.
 *  - `warn` fires once per failure run; a successful read re-arms it.
 */

/** Delay before each retry of a failed read: 30 s in total, then quiet. */
export const RECOVERING_READ_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000, 8000, 15000];

/**
 * Engine-ready arrives in bursts (the engine's own `projectLoaded`, then the
 * host's synthetic re-emits after the full reload and after re-adoption), so
 * a signal waits this long for the burst to settle before it re-reads.
 */
export const RECOVERING_READ_SETTLE_MS = 500;

export interface RecoveringReadOptions<T> {
  /** Performs one read. Rejecting, or resolving null/undefined, is a failure. */
  read: () => Promise<T | null | undefined>;
  /** Receives every successful read that is still the latest one. */
  onValue: (value: T) => void;
  /** Called once per failure run (re-armed by a success). */
  onFailure?: (error: unknown) => void;
  /** Override the backoff (tests). Defaults to RECOVERING_READ_RETRY_DELAYS_MS. */
  retryDelaysMs?: readonly number[];
  /** Override the signal settle window (tests). Defaults to RECOVERING_READ_SETTLE_MS. */
  settleMs?: number;
}

export interface RecoveringRead {
  /** Read now. Resolves once this read has settled (it never rejects). */
  read(): Promise<void>;
  /** A lifecycle signal (engine ready): re-read after the settle window, with a fresh retry budget. */
  signal(): void;
  /** Stop for good: cancels pending timers and discards reads in flight. */
  dispose(): void;
}

export function createRecoveringRead<T>(options: RecoveringReadOptions<T>): RecoveringRead {
  const delays = options.retryDelaysMs ?? RECOVERING_READ_RETRY_DELAYS_MS;
  const settleMs = options.settleMs ?? RECOVERING_READ_SETTLE_MS;

  let disposed = false;
  let seq = 0; // id of the latest-started read
  let latestPending = false; // the latest-started read has not settled yet
  let rereadQueued = false; // a signal came due while the latest read was pending
  let retriesUsed = 0;
  let failureReported = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;

  const clearRetry = (): void => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const scheduleRetry = (): void => {
    if (disposed || retryTimer !== null || retriesUsed >= delays.length) return;
    const delay = delays[retriesUsed];
    retriesUsed += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      // Never overlap: the pending read re-arms the backoff if it fails.
      if (disposed || latestPending) return;
      void run();
    }, delay);
  };

  // A fresh episode: full retry budget, one read now or right after the
  // read in flight.
  const startEpisode = (): void => {
    clearRetry();
    retriesUsed = 0;
    if (latestPending) {
      rereadQueued = true;
    } else {
      void run();
    }
  };

  async function run(): Promise<void> {
    if (disposed) return;
    const mine = ++seq;
    latestPending = true;
    rereadQueued = false; // this read starts after any signal already queued
    let value: T | null | undefined;
    let failed = false;
    let error: unknown;
    try {
      value = await options.read();
      if (value === null || value === undefined) {
        failed = true;
        error = new Error('host returned no state');
      }
    } catch (err: unknown) {
      failed = true;
      error = err;
    }
    // Superseded by a newer read, or torn down: this result is stale.
    if (disposed || mine !== seq) return;
    latestPending = false;

    if (!failed) {
      retriesUsed = 0;
      failureReported = false;
      clearRetry();
      options.onValue(value as T);
    } else if (!failureReported) {
      failureReported = true;
      try {
        options.onFailure?.(error);
      } catch {
        // A logging hook must never break the read loop.
      }
    }

    if (rereadQueued) {
      startEpisode();
      return;
    }
    if (failed) scheduleRetry();
  }

  return {
    read: (): Promise<void> => run(),
    signal: (): void => {
      if (disposed) return;
      if (settleTimer !== null) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        settleTimer = null;
        if (!disposed) startEpisode();
      }, settleMs);
    },
    dispose: (): void => {
      disposed = true;
      rereadQueued = false;
      clearRetry();
      if (settleTimer !== null) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
    },
  };
}
