/**
 * createRecoveringRead — the self-healing read behind usePanelBus (S-019).
 *
 * Regression pin for "many of the plugins do not have the scene level BUS/FX
 * visible" after a project reload: the first getPanelBusState rejected while
 * the project was still loading (the host was reset mid-call), the hook
 * swallowed it and kept bus = null, and nothing re-read until a scene change.
 * The hook creates one reader per (host, scene) and disposes it on scene
 * change and unmount, so dispose() below IS the hook's cleanup path.
 */
import {
  createRecoveringRead,
  RECOVERING_READ_RETRY_DELAYS_MS,
  RECOVERING_READ_SETTLE_MS,
  type RecoveringRead,
} from '../recovering-read';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface BusLike {
  volume: number;
}

/**
 * A scripted host read. Each call takes the next outcome: a value, an Error
 * (rejects), null (empty result), or a Deferred the test settles by hand.
 * Tracks concurrency so tests can assert reads never overlap.
 */
function scriptedRead(outcomes: Array<BusLike | Error | null | Deferred<BusLike | null>>, fallback?: BusLike | Error) {
  let inFlight = 0;
  let maxInFlight = 0;
  const read = jest.fn(async (): Promise<BusLike | null> => {
    const next = outcomes.length > 0 ? outcomes.shift() : fallback;
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      if (next === undefined) throw new Error('script exhausted');
      if (next instanceof Error) throw next;
      if (next !== null && 'promise' in next) return await next.promise;
      return next;
    } finally {
      inFlight -= 1;
    }
  });
  return { read, maxInFlight: (): number => maxInFlight };
}

const TOTAL_BUDGET_MS = RECOVERING_READ_RETRY_DELAYS_MS.reduce((sum, d) => sum + d, 0);

describe('createRecoveringRead', () => {
  let reader: RecoveringRead | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    reader?.dispose();
    reader = null;
    jest.useRealTimers();
  });

  it('uses a bounded backoff of 1, 2, 4, 8 and 15 seconds (30 s in total)', () => {
    expect(RECOVERING_READ_RETRY_DELAYS_MS).toEqual([1000, 2000, 4000, 8000, 15000]);
    expect(TOTAL_BUDGET_MS).toBe(30000);
  });

  it('success path: one read, the value lands, and nothing else ever reads', async () => {
    const { read } = scriptedRead([{ volume: -3 }]);
    const onValue = jest.fn();
    const onFailure = jest.fn();
    reader = createRecoveringRead<BusLike>({ read, onValue, onFailure });

    await reader.read();
    expect(onValue).toHaveBeenCalledTimes(1);
    expect(onValue).toHaveBeenCalledWith({ volume: -3 });

    await jest.advanceTimersByTimeAsync(5 * 60_000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('a first read that rejects (host reset mid-load) recovers on the 1 s retry', async () => {
    const { read } = scriptedRead([new Error('No project is bound'), { volume: -6 }]);
    const onValue = jest.fn();
    const onFailure = jest.fn();
    reader = createRecoveringRead<BusLike>({ read, onValue, onFailure });

    await reader.read();
    expect(onValue).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect((onFailure.mock.calls[0][0] as Error).message).toBe('No project is bound');

    await jest.advanceTimersByTimeAsync(999);
    expect(read).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);
    expect(onValue).toHaveBeenCalledWith({ volume: -6 });

    // Healed: no further reads.
    await jest.advanceTimersByTimeAsync(5 * 60_000);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('an empty (null) result is a failure: the last value stays and it retries', async () => {
    const { read } = scriptedRead([{ volume: -1 }, null, { volume: -2 }]);
    const onValue = jest.fn();
    reader = createRecoveringRead<BusLike>({ read, onValue });

    await reader.read();
    await reader.read(); // null: no onValue(null)
    expect(onValue).toHaveBeenCalledTimes(1);
    expect(onValue).toHaveBeenLastCalledWith({ volume: -1 });

    await jest.advanceTimersByTimeAsync(1000);
    expect(onValue).toHaveBeenCalledTimes(2);
    expect(onValue).toHaveBeenLastCalledWith({ volume: -2 });
  });

  it('no retry storm: a host that always fails gets 1 + 5 reads, one log, then silence', async () => {
    const { read, maxInFlight } = scriptedRead([], new Error('engine down'));
    const onValue = jest.fn();
    const onFailure = jest.fn();
    reader = createRecoveringRead<BusLike>({ read, onValue, onFailure });

    await reader.read();
    expect(read).toHaveBeenCalledTimes(1);

    // Each retry lands exactly on its backoff step.
    const expectedCallsAt: Array<[number, number]> = [
      [1000, 2],
      [2000, 3],
      [4000, 4],
      [8000, 5],
      [15000, 6],
    ];
    for (const [step, calls] of expectedCallsAt) {
      await jest.advanceTimersByTimeAsync(step - 1);
      expect(read).toHaveBeenCalledTimes(calls - 1);
      await jest.advanceTimersByTimeAsync(1);
      expect(read).toHaveBeenCalledTimes(calls);
    }

    await jest.advanceTimersByTimeAsync(60 * 60_000);
    expect(read).toHaveBeenCalledTimes(1 + RECOVERING_READ_RETRY_DELAYS_MS.length);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onValue).not.toHaveBeenCalled();
    expect(maxInFlight()).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('the engine-ready signal re-reads once its burst settles (healthy state too)', async () => {
    const { read } = scriptedRead([{ volume: 0 }, { volume: -9 }]);
    const onValue = jest.fn();
    reader = createRecoveringRead<BusLike>({ read, onValue });

    await reader.read();
    expect(read).toHaveBeenCalledTimes(1);

    // The real C++ projectLoaded plus the host's synthetic re-emits.
    reader.signal();
    await jest.advanceTimersByTimeAsync(100);
    reader.signal();
    await jest.advanceTimersByTimeAsync(100);
    reader.signal();
    await jest.advanceTimersByTimeAsync(RECOVERING_READ_SETTLE_MS - 1);
    expect(read).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);
    expect(onValue).toHaveBeenLastCalledWith({ volume: -9 });

    await jest.advanceTimersByTimeAsync(5 * 60_000);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('after the retry budget is spent, engine ready starts a fresh bounded run and heals', async () => {
    const outcomes: Array<BusLike | Error> = Array.from(
      { length: 1 + RECOVERING_READ_RETRY_DELAYS_MS.length },
      () => new Error('No project is bound')
    );
    const { read } = scriptedRead(outcomes, new Error('still loading'));
    const onValue = jest.fn();
    const onFailure = jest.fn();
    reader = createRecoveringRead<BusLike>({ read, onValue, onFailure });

    await reader.read();
    await jest.advanceTimersByTimeAsync(TOTAL_BUDGET_MS + 60_000);
    expect(read).toHaveBeenCalledTimes(6);

    // The project finally finishes loading. The first post-ready read still
    // races the host rebind and fails; the fresh budget carries it through.
    outcomes.push(new Error('rebinding'), { volume: -4 });
    reader.signal();
    await jest.advanceTimersByTimeAsync(RECOVERING_READ_SETTLE_MS);
    expect(read).toHaveBeenCalledTimes(7);
    expect(onValue).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(RECOVERING_READ_RETRY_DELAYS_MS[0]);
    expect(read).toHaveBeenCalledTimes(8);
    expect(onValue).toHaveBeenCalledWith({ volume: -4 });

    // Still one log line for the whole failure run.
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it('a signal during a read in flight queues exactly one re-read after it (never overlapping)', async () => {
    const slow = deferred<BusLike | null>();
    const { read, maxInFlight } = scriptedRead([slow, { volume: -12 }]);
    const onValue = jest.fn();
    reader = createRecoveringRead<BusLike>({ read, onValue });

    const first = reader.read();
    reader.signal();
    reader.signal();
    await jest.advanceTimersByTimeAsync(RECOVERING_READ_SETTLE_MS * 4);
    expect(read).toHaveBeenCalledTimes(1); // still waiting on the slow read

    // The slow read was answered with pre-load state; the queued re-read follows.
    slow.resolve({ volume: 0 });
    await first;
    await jest.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(2);
    expect(onValue).toHaveBeenLastCalledWith({ volume: -12 });
    expect(maxInFlight()).toBe(1);

    await jest.advanceTimersByTimeAsync(5 * 60_000);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('a retry that comes due while the latest read is pending is dropped, not overlapped', async () => {
    const pending = deferred<BusLike | null>();
    const { read, maxInFlight } = scriptedRead([new Error('hiccup'), pending, { volume: -5 }]);
    const onValue = jest.fn();
    reader = createRecoveringRead<BusLike>({ read, onValue });

    await reader.read(); // fails, arms the 1 s retry
    const explicit = reader.read(); // e.g. a post-mutation reload, still pending
    await jest.advanceTimersByTimeAsync(1000); // retry comes due mid-read
    expect(read).toHaveBeenCalledTimes(2);

    pending.reject(new Error('still busy')); // the pending read fails and re-arms (2 s)
    await explicit;
    await jest.advanceTimersByTimeAsync(1999);
    expect(read).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(3);
    expect(onValue).toHaveBeenCalledWith({ volume: -5 });
    expect(maxInFlight()).toBe(1);
  });

  it('the latest-started read wins; a slower, older read is discarded', async () => {
    const older = deferred<BusLike | null>();
    const { read } = scriptedRead([older, { volume: -8 }]);
    const onValue = jest.fn();
    reader = createRecoveringRead<BusLike>({ read, onValue });

    const first = reader.read();
    await reader.read();
    older.resolve({ volume: 0 });
    await first;
    expect(onValue).toHaveBeenCalledTimes(1);
    expect(onValue).toHaveBeenCalledWith({ volume: -8 });
  });

  it('dispose (unmount / scene change) cancels the pending retry', async () => {
    const { read } = scriptedRead([new Error('No project is bound')], { volume: -1 });
    const onValue = jest.fn();
    reader = createRecoveringRead<BusLike>({ read, onValue });

    await reader.read();
    expect(jest.getTimerCount()).toBe(1);
    reader.dispose();
    expect(jest.getTimerCount()).toBe(0);

    await jest.advanceTimersByTimeAsync(5 * 60_000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(onValue).not.toHaveBeenCalled();
  });

  it('dispose discards a read still in flight and cancels a settling signal', async () => {
    const slow = deferred<BusLike | null>();
    const { read } = scriptedRead([slow], { volume: -1 });
    const onValue = jest.fn();
    const onFailure = jest.fn();
    reader = createRecoveringRead<BusLike>({ read, onValue, onFailure });

    const first = reader.read();
    reader.signal();
    reader.dispose();
    expect(jest.getTimerCount()).toBe(0);

    slow.resolve({ volume: -7 }); // the previous scene's answer arrives late
    await first;
    await jest.advanceTimersByTimeAsync(5 * 60_000);
    expect(onValue).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);

    // A disposed reader ignores everything.
    reader.signal();
    await reader.read();
    await jest.advanceTimersByTimeAsync(5 * 60_000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('dispose after a failed in-flight read never arms a retry', async () => {
    const slow = deferred<BusLike | null>();
    const { read } = scriptedRead([slow], { volume: -1 });
    reader = createRecoveringRead<BusLike>({ read, onValue: jest.fn() });

    const first = reader.read();
    reader.dispose();
    slow.reject(new Error('No project is bound'));
    await first;
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(5 * 60_000);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('logs once per failure run; a success re-arms the log for the next run', async () => {
    const { read } = scriptedRead([
      new Error('a'),
      new Error('b'),
      { volume: 0 },
      new Error('c'),
    ]);
    const onFailure = jest.fn();
    reader = createRecoveringRead<BusLike>({ read, onValue: jest.fn(), onFailure });

    await reader.read(); // a
    await jest.advanceTimersByTimeAsync(1000); // b
    await jest.advanceTimersByTimeAsync(2000); // success
    expect(onFailure).toHaveBeenCalledTimes(1);

    await reader.read(); // c: a new failure run
    expect(onFailure).toHaveBeenCalledTimes(2);
    expect((onFailure.mock.calls[1][0] as Error).message).toBe('c');
  });

  it('a throwing failure hook cannot break the retry loop', async () => {
    const { read } = scriptedRead([new Error('x'), { volume: -2 }]);
    const onValue = jest.fn();
    reader = createRecoveringRead<BusLike>({
      read,
      onValue,
      onFailure: () => {
        throw new Error('logger blew up');
      },
    });

    await expect(reader.read()).resolves.toBeUndefined();
    await jest.advanceTimersByTimeAsync(1000);
    expect(onValue).toHaveBeenCalledWith({ volume: -2 });
  });
});
