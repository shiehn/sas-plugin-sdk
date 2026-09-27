/**
 * createRecoveringRead().refresh() — the coalesced "the state just changed"
 * read behind usePanelBus().notifyTracksChanged (S-027 slice S8, gap G1,
 * SDK 3.19.0).
 *
 * The host routes a panel's tracks into its scene bus only when the bus state
 * is READ, so a panel refreshes after it creates or loads tracks. The rules
 * pinned here: a read that starts after the call, right away when idle; never
 * two reads in flight; a burst collapses into one trailing read (no read
 * storm); the S-019 recovery rules still hold; dispose (unmount, scene
 * change) stops everything.
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
  members: number;
}

type Outcome = BusLike | Error | null | Deferred<BusLike | null>;

/** A scripted host read that also measures concurrency. */
function scriptedRead(outcomes: Outcome[], fallback?: BusLike | Error) {
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

const QUIET_MS = 5 * 60_000;

describe('createRecoveringRead().refresh()', () => {
  let reader: RecoveringRead | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    reader?.dispose();
    reader = null;
    jest.useRealTimers();
  });

  it('idle: a track created after the last read gets a fresh read at once, with no settle delay', async () => {
    const { read } = scriptedRead([{ members: 0 }, { members: 1 }]);
    const onValue = jest.fn();
    reader = createRecoveringRead<BusLike>({ read, onValue });

    await reader.read(); // mount read: the scene had no tracks yet
    expect(onValue).toHaveBeenLastCalledWith({ members: 0 });

    reader.refresh(); // the panel created its first track
    expect(read).toHaveBeenCalledTimes(2); // started synchronously, not after 500 ms
    await jest.advanceTimersByTimeAsync(0);
    expect(onValue).toHaveBeenLastCalledWith({ members: 1 });

    await jest.advanceTimersByTimeAsync(QUIET_MS);
    expect(read).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('no read storm: a burst of refreshes during a read in flight collapses into ONE trailing read', async () => {
    const slow = deferred<BusLike | null>();
    const { read, maxInFlight } = scriptedRead([slow, { members: 8 }]);
    const onValue = jest.fn();
    reader = createRecoveringRead<BusLike>({ read, onValue });

    reader.refresh(); // first bulk-compose track landed
    expect(read).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 25; i += 1) reader.refresh(); // the rest of the burst
    await jest.advanceTimersByTimeAsync(RECOVERING_READ_SETTLE_MS * 4);
    expect(read).toHaveBeenCalledTimes(1); // still waiting, nothing overlapped

    // The in-flight read started before the later tracks existed; one
    // trailing read picks them all up.
    slow.resolve({ members: 1 });
    await jest.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(2);
    expect(onValue).toHaveBeenLastCalledWith({ members: 8 });
    expect(maxInFlight()).toBe(1);

    await jest.advanceTimersByTimeAsync(QUIET_MS);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('a refresh during the explicit mount read queues one re-read after it (never overlapping)', async () => {
    const mount = deferred<BusLike | null>();
    const { read, maxInFlight } = scriptedRead([mount, { members: 3 }]);
    const onValue = jest.fn();
    reader = createRecoveringRead<BusLike>({ read, onValue });

    const first = reader.read(); // the hook's mount read
    reader.refresh(); // the first track load (which re-adopts tracks) finished first
    expect(read).toHaveBeenCalledTimes(1);

    mount.resolve({ members: 0 }); // answered before the adopt: nothing routed
    await first;
    await jest.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(2);
    expect(onValue).toHaveBeenLastCalledWith({ members: 3 });
    expect(maxInFlight()).toBe(1);
  });

  it('an engine-ready signal already settling covers a refresh (no extra read)', async () => {
    const { read } = scriptedRead([{ members: 0 }, { members: 4 }], { members: 4 });
    reader = createRecoveringRead<BusLike>({ read, onValue: jest.fn() });

    await reader.read();
    reader.signal(); // project loaded
    await jest.advanceTimersByTimeAsync(100);
    reader.refresh(); // the engine-ready track reload finished inside the settle window
    reader.refresh();
    expect(read).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(RECOVERING_READ_SETTLE_MS);
    expect(read).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(QUIET_MS);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('a refresh during a failure backoff reads now and replaces the pending retry', async () => {
    const { read } = scriptedRead([new Error('No project is bound'), { members: 2 }]);
    const onValue = jest.fn();
    reader = createRecoveringRead<BusLike>({ read, onValue });

    await reader.read(); // fails, arms the 1 s retry
    await jest.advanceTimersByTimeAsync(400);
    reader.refresh();
    expect(read).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(0);
    expect(onValue).toHaveBeenCalledWith({ members: 2 });

    // The old 1 s retry must not fire on top of the healed state.
    await jest.advanceTimersByTimeAsync(QUIET_MS);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('a refresh against a host that keeps failing uses the bounded backoff: 1 + 5 reads, one log, then quiet', async () => {
    const { read } = scriptedRead([], new Error('host reset'));
    const onValue = jest.fn();
    const onFailure = jest.fn();
    reader = createRecoveringRead<BusLike>({ read, onValue, onFailure });

    reader.refresh();
    await jest.advanceTimersByTimeAsync(QUIET_MS);
    expect(read).toHaveBeenCalledTimes(1 + RECOVERING_READ_RETRY_DELAYS_MS.length);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onValue).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('spaced-out track creations each get their own read, never more', async () => {
    const { read } = scriptedRead([], { members: 1 });
    reader = createRecoveringRead<BusLike>({ read, onValue: jest.fn() });

    for (let i = 0; i < 6; i += 1) {
      reader.refresh();
      await jest.advanceTimersByTimeAsync(2000); // generation time between voices
    }
    expect(read).toHaveBeenCalledTimes(6);
  });

  it('dispose (unmount / scene change): refresh is a no-op afterwards', async () => {
    const { read } = scriptedRead([], { members: 1 });
    reader = createRecoveringRead<BusLike>({ read, onValue: jest.fn() });

    reader.dispose();
    reader.refresh();
    await jest.advanceTimersByTimeAsync(QUIET_MS);
    expect(read).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('dispose drops a queued trailing read and discards the read in flight', async () => {
    const slow = deferred<BusLike | null>();
    const { read } = scriptedRead([slow], { members: 9 });
    const onValue = jest.fn();
    reader = createRecoveringRead<BusLike>({ read, onValue });

    reader.refresh();
    reader.refresh(); // queued behind the slow read
    reader.dispose(); // panel unmounted
    slow.resolve({ members: 1 });
    await jest.advanceTimersByTimeAsync(QUIET_MS);

    expect(read).toHaveBeenCalledTimes(1);
    expect(onValue).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
