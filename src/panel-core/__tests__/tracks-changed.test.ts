/**
 * Tracks-changed channel + its bus wiring (S-027 slice S8, gap G1,
 * SDK 3.19.0).
 *
 * G1: a newly created panel track did not join its scene bus until the user
 * switched scenes or reopened, because the host routes (and auto-engages)
 * only when the bus state is read, and nothing read it after a create. Now
 * panel-core emits on this channel after every track load / Add Track, and
 * GeneratorPanelShell forwards it to usePanelBus().notifyTracksChanged,
 * which is the bus reader's refresh(). The "wired" block below rebuilds that
 * exact chain (channel → reader.refresh → host.getPanelBusState) against a
 * fake host that routes on read the way sas-app's bus mixin does, since the
 * SDK's node-env jest can't render the hooks themselves.
 */
import { createTracksChangedChannel } from '../tracks-changed';
import { createRecoveringRead, type RecoveringRead } from '../../hooks/recovering-read';

describe('createTracksChangedChannel', () => {
  it('delivers each emit to every current listener', () => {
    const channel = createTracksChangedChannel();
    const a = jest.fn();
    const b = jest.fn();
    channel.subscribe(a);
    channel.subscribe(b);

    channel.emit();
    channel.emit();
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('emit with no listener is a no-op', () => {
    const channel = createTracksChangedChannel();
    expect(() => channel.emit()).not.toThrow();
    expect(channel.size()).toBe(0);
  });

  it('unsubscribe removes only that subscription and is idempotent', () => {
    const channel = createTracksChangedChannel();
    const listener = jest.fn();
    const first = channel.subscribe(listener);
    const second = channel.subscribe(listener); // same function, own subscription
    expect(channel.size()).toBe(2);

    first();
    first();
    expect(channel.size()).toBe(1);
    channel.emit();
    expect(listener).toHaveBeenCalledTimes(1);

    second();
    channel.emit();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(channel.size()).toBe(0);
  });

  it('a throwing listener neither stops the others nor fails the track load that emitted', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const channel = createTracksChangedChannel();
      const after = jest.fn();
      channel.subscribe(() => {
        throw new Error('bus hook gone');
      });
      channel.subscribe(after);

      expect(() => channel.emit()).not.toThrow();
      expect(after).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('an emit reaches the listeners subscribed when it started (snapshot)', () => {
    const channel = createTracksChangedChannel();
    const late = jest.fn();
    let unsubscribeSecond: () => void = () => undefined;
    const second = jest.fn();
    channel.subscribe(() => {
      unsubscribeSecond();
      channel.subscribe(late);
    });
    unsubscribeSecond = channel.subscribe(second);

    channel.emit();
    expect(second).toHaveBeenCalledTimes(1);
    expect(late).not.toHaveBeenCalled();
  });
});

// ── Wired as the shell wires it ─────────────────────────────────────────────

interface FakeBusState {
  engaged: boolean;
  routedTrackIds: string[];
}

/**
 * The host side of the contract, reduced to what G1 is about: a read routes
 * every owned-but-unrouted track into the bus and auto-engages the bus once
 * the panel owns a track (sas-app bus.ts getPanelBusState / ensurePanelBus).
 */
function fakeBusHost(opts: { slow?: boolean } = {}) {
  const owned: string[] = [];
  const routed = new Set<string>();
  let engaged = false;
  const pending: Array<() => void> = [];

  const settle = (): FakeBusState => {
    if (owned.length > 0) engaged = true;
    if (engaged) for (const id of owned) routed.add(id);
    return { engaged, routedTrackIds: [...routed] };
  };

  const getPanelBusState = jest.fn(
    (_sceneId: string): Promise<FakeBusState> =>
      opts.slow
        ? new Promise<FakeBusState>((resolve) => pending.push(() => resolve(settle())))
        : Promise.resolve(settle())
  );

  return {
    getPanelBusState,
    createTrack(id: string): void {
      owned.push(id); // host.createTrack: lands under the scene, NOT in the bus
    },
    isRouted: (id: string): boolean => routed.has(id),
    /** Answer the oldest pending read (slow hosts only). */
    answerNext(): void {
      pending.shift()?.();
    },
  };
}

describe('tracks-changed → panel bus re-read (GeneratorPanelShell wiring)', () => {
  let reader: RecoveringRead | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    reader?.dispose();
    reader = null;
    jest.useRealTimers();
  });

  /** usePanelBus mount + the shell's subscription, as one unit. */
  function mountPanel(host: ReturnType<typeof fakeBusHost>, sceneId = 'scene-1') {
    const channel = createTracksChangedChannel();
    const onValue = jest.fn();
    reader = createRecoveringRead<FakeBusState>({
      read: () => host.getPanelBusState(sceneId),
      onValue,
    });
    const current = reader;
    void current.read(); // the hook's mount read
    const unsubscribe = channel.subscribe(() => current.refresh()); // shell effect
    return {
      channel,
      onValue,
      unmount: (): void => {
        unsubscribe(); // shell effect cleanup
        current.dispose(); // usePanelBus effect cleanup
      },
    };
  }

  it('a created track gets a bus re-read right away and joins the bus (no scene change needed)', async () => {
    const host = fakeBusHost();
    host.createTrack('t1');
    const panel = mountPanel(host);
    await jest.advanceTimersByTimeAsync(0);
    expect(host.getPanelBusState).toHaveBeenCalledTimes(1);
    expect(host.isRouted('t1')).toBe(true);

    host.createTrack('t2'); // Add Track
    expect(host.isRouted('t2')).toBe(false); // G1: outside the bus until a read

    panel.channel.emit(); // core: after Add Track / at the end of loadTracks
    await jest.advanceTimersByTimeAsync(0);
    expect(host.getPanelBusState).toHaveBeenCalledTimes(2);
    expect(host.isRouted('t2')).toBe(true);
    expect(panel.onValue).toHaveBeenLastCalledWith({ engaged: true, routedTrackIds: ['t1', 't2'] });
  });

  it('the first track of a fresh scene engages the bus at once, so the strip appears', async () => {
    const host = fakeBusHost();
    const panel = mountPanel(host);
    await jest.advanceTimersByTimeAsync(0);
    expect(panel.onValue).toHaveBeenLastCalledWith({ engaged: false, routedTrackIds: [] });

    host.createTrack('t1');
    panel.channel.emit();
    await jest.advanceTimersByTimeAsync(0);
    expect(panel.onValue).toHaveBeenLastCalledWith({ engaged: true, routedTrackIds: ['t1'] });
  });

  it('no read storm: a bulk compose landing 16 tracks during a slow read costs one trailing read', async () => {
    const host = fakeBusHost({ slow: true });
    const panel = mountPanel(host); // mount read in flight
    expect(host.getPanelBusState).toHaveBeenCalledTimes(1);

    for (let i = 1; i <= 16; i += 1) {
      host.createTrack(`t${i}`);
      panel.channel.emit(); // one incremental loadTracks per completed placeholder
    }
    await jest.advanceTimersByTimeAsync(60_000);
    expect(host.getPanelBusState).toHaveBeenCalledTimes(1); // never two in flight

    host.answerNext(); // the mount read (it already sees all 16)
    await jest.advanceTimersByTimeAsync(0);
    expect(host.getPanelBusState).toHaveBeenCalledTimes(2); // the one trailing read
    host.answerNext();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(host.getPanelBusState).toHaveBeenCalledTimes(2);
    for (let i = 1; i <= 16; i += 1) expect(host.isRouted(`t${i}`)).toBe(true);
  });

  it('unmount cleanup: after unmount a track change reaches no reader and reads nothing', async () => {
    const host = fakeBusHost();
    const panel = mountPanel(host);
    await jest.advanceTimersByTimeAsync(0);
    expect(host.getPanelBusState).toHaveBeenCalledTimes(1);

    panel.unmount();
    expect(panel.channel.size()).toBe(0);
    host.createTrack('late');
    panel.channel.emit(); // e.g. a track load that resolved after the panel closed
    await jest.advanceTimersByTimeAsync(60_000);
    expect(host.getPanelBusState).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('unmount while a triggered read is in flight: its result is discarded and nothing follows', async () => {
    const host = fakeBusHost({ slow: true });
    const panel = mountPanel(host);
    host.createTrack('t1');
    panel.channel.emit(); // queued behind the mount read

    panel.unmount();
    host.answerNext();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(host.getPanelBusState).toHaveBeenCalledTimes(1);
    expect(panel.onValue).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
