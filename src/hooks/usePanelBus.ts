/**
 * usePanelBus — panel-side state + handlers for the PanelMasterStrip
 * (docs/panel-bus.md §11).
 *
 * Feature-gated: `supported` is false on hosts without the panel-bus surface
 * (older app builds), and every consumer should render nothing in that case —
 * the strip must never appear on a host that can't back it. Engaging is the
 * host's call: an explicit mutation (fader move / FX add) engages, and so does
 * a read in the ACTIVE scene once the panel owns a track there and the user
 * has not disengaged it (auto-engage, 08-10). A read never disengages.
 *
 * Reload story: state re-reads on scene change and after every mutation.
 * `getPanelBusState` host-side also (re)realizes the bus (adopt-by-marker)
 * and routes not-yet-routed panel tracks into it. A panel therefore calls
 * `notifyTracksChanged()` whenever its track set changes (after creating a
 * track, at the end of its track reload): the re-read is what makes a new
 * track join the bus at once instead of on the next scene change or reopen
 * (S-027 gap G1, SDK 3.19.0). `GeneratorPanelShell` wires this for every
 * panel-core panel; a panel that mounts the strip itself calls it.
 *
 * Recovery (S-019, SDK 3.18.0): a read that fails (or returns nothing) keeps
 * the last state and heals itself. It re-reads on the host's engine-ready
 * signal (`onEngineReady`, fired when a project finishes loading, the same
 * signal that re-adopts the panel's tracks) and on a bounded backoff (1 s,
 * 2 s, 4 s, 8 s, 15 s, then quiet). A slow project load used to leave the
 * strip hidden until the next scene change. See `recovering-read.ts`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  InstrumentDescriptor,
  PanelBusFxEntry,
  PanelBusLevels,
  PanelBusMotionState,
  PanelBusSidechainState,
  PanelBusState,
  PluginHost,
} from '../types/plugin-sdk.types';
import { createRecoveringRead, type RecoveringRead } from './recovering-read';

/** A recovering reader bound to the scene it was created for. */
interface SceneReader {
  sceneId: string;
  reader: RecoveringRead;
}

/** Legacy bus meter poll cadence — pre-2.70 hosts only. 2.70+ hosts push
 *  levels via `onPanelBusLevels` (engine-batched, change-suppressed) and
 *  the hook never polls. */
const LEVELS_POLL_MS = 66;

export interface UsePanelBusResult {
  /** False on pre-2.36 hosts — render no strip. */
  supported: boolean;
  /** Null until the first load completes for the current scene. */
  bus: PanelBusState | null;
  /** Stereo output levels (null = disengaged / floored). Engine-pushed on
   *  2.70+ hosts (change-suppressed ~15 Hz); polled on older hosts. */
  levels: PanelBusLevels | null;
  /**
   * Attach to the strip's container element. Gates the level subscription
   * to panels actually on screen (IntersectionObserver) — a collapsed or
   * scrolled-away panel holds no engine-stream refcount. Optional:
   * leaving it unattached behaves as always-visible. @since SDK 2.70.0
   */
  meterVisibilityRef: (el: HTMLElement | null) => void;
  availableFx: InstrumentDescriptor[];
  fxLoading: boolean;
  fxPickerOpen: boolean;
  setFxPickerOpen: (open: boolean) => void;
  refreshFx: () => void;
  /** Read the bus state now (explicit; runs immediately). */
  reload: () => Promise<void>;
  /**
   * The panel's track set changed (a track was created, or the panel's
   * track reload finished). Re-reads the bus state so the host routes new
   * tracks into the scene bus, and auto-engages a fresh scene's bus, right
   * away (S-027 gap G1). Coalesced and never overlapping: idle, it reads
   * now; with a read in flight, it queues ONE re-read after it however many
   * calls land meanwhile; with an engine-ready re-read settling, that read
   * covers it. Stable identity (safe in any deps list). No-op on hosts
   * without the bus surface, and after unmount. Fire-and-forget.
   * @since SDK 3.19.0
   */
  notifyTracksChanged: () => void;
  onVolumeChange: (volumeDb: number) => void;
  onMuteToggle: () => void;
  onSoloToggle: () => void;
  onAddFx: (pluginId: string) => void;
  onRemoveFx: (fxIndex: number) => void;
  onToggleFxEnabled: (fxIndex: number, enabled: boolean) => void;
  onShowFxEditor: (fxIndex: number) => void;
  /** False on pre-2.53 hosts (no movePanelBusFx) — hide drag affordances. */
  fxReorderSupported: boolean;
  /** Move a bus FX to another slot; both args are `PanelBusFxEntry.index`
   *  values (splice semantics — the FX lands AT `toFxIndex`). @since 2.53.0 */
  onMoveFx: (fromFxIndex: number, toFxIndex: number) => void;
  /**
   * Sidechain (kick→bass ducking) state — null until loaded or on hosts
   * without the surface (pre-2.52). @since 2.52.0
   */
  sidechain: PanelBusSidechainState | null;
  /** False on pre-2.52 hosts — render no Duck control. */
  sidechainSupported: boolean;
  /** Debounced while dragging (~150 ms); local state echoes immediately. */
  onSidechainAmountChange: (amount: number) => void;
  onSidechainPresetChange: (presetId: PanelBusSidechainState['presetId']) => void;
  /** Switch the duck's onset source (kicks | ghost grids). @since 2.54.0 */
  onSidechainSourceChange: (source: PanelBusSidechainState['source']) => void;
  /** Set how long each dip lasts, as a musical division. @since 3.2.0 */
  onSidechainLengthChange: (length: PanelBusSidechainState['length']) => void;
  /**
   * Motion (tempo-locked filter wobble) state — null until loaded or on
   * hosts without the surface (pre-2.54). @since 2.54.0
   */
  motion: PanelBusMotionState | null;
  /** False on pre-2.54 hosts — render no Motion control. */
  motionSupported: boolean;
  /** Debounced while dragging (~150 ms); local state echoes immediately. */
  onMotionAmountChange: (amount: number) => void;
  /** Set the LFO period (quarter-notes). Clears any per-bar pattern —
   *  patterns are agent/tool territory; the strip drives a single rate. */
  onMotionRateChange: (rateQn: number) => void;
  onMotionShapeChange: (shape: PanelBusMotionState['shape']) => void;
  /** Switch what the envelope drives: Filter cutoff or Amp gate. @since 2.54.0 */
  onMotionTargetChange: (target: PanelBusMotionState['target']) => void;
}

export function usePanelBus(host: PluginHost, activeSceneId: string | null): UsePanelBusResult {
  const supported = typeof host.getPanelBusState === 'function';
  const sidechainSupported =
    typeof host.getPanelBusSidechain === 'function' && typeof host.setPanelBusSidechain === 'function';
  const motionSupported =
    typeof host.getPanelBusMotion === 'function' && typeof host.setPanelBusMotion === 'function';
  const fxReorderSupported = supported && typeof host.movePanelBusFx === 'function';
  const [bus, setBus] = useState<PanelBusState | null>(null);
  const [levels, setLevels] = useState<PanelBusLevels | null>(null);
  const [sidechain, setSidechain] = useState<PanelBusSidechainState | null>(null);
  const [motion, setMotion] = useState<PanelBusMotionState | null>(null);
  const [availableFx, setAvailableFx] = useState<InstrumentDescriptor[]>([]);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxPickerOpen, setFxPickerOpen] = useState(false);
  const fxLoadedRef = useRef(false);
  // One recovering reader per surface, created per (host, scene) and disposed
  // on scene change / unmount. Disposal is the stale-scene guard: a slow read
  // for the PREVIOUS scene can never clobber the current scene's state.
  const busReaderRef = useRef<SceneReader | null>(null);
  const sidechainReaderRef = useRef<SceneReader | null>(null);
  const motionReaderRef = useRef<SceneReader | null>(null);
  const sidechainDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const motionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    if (!supported || !activeSceneId || !host.getPanelBusState) {
      setBus(null);
      return;
    }
    const current = busReaderRef.current;
    if (current && current.sceneId === activeSceneId) await current.reader.read();
  }, [host, activeSceneId, supported]);

  const reloadSidechain = useCallback(async (): Promise<void> => {
    if (!sidechainSupported || !activeSceneId || !host.getPanelBusSidechain) {
      setSidechain(null);
      return;
    }
    const current = sidechainReaderRef.current;
    if (current && current.sceneId === activeSceneId) await current.reader.read();
  }, [host, activeSceneId, sidechainSupported]);

  const reloadMotion = useCallback(async (): Promise<void> => {
    if (!motionSupported || !activeSceneId || !host.getPanelBusMotion) {
      setMotion(null);
      return;
    }
    const current = motionReaderRef.current;
    if (current && current.sceneId === activeSceneId) await current.reader.read();
  }, [host, activeSceneId, motionSupported]);

  // S-027 S8 (gap G1): only the STATE read routes tracks and auto-engages, so
  // only it refreshes; the sidechain and motion reads don't depend on this
  // panel's membership. Deliberately dependency-free: it pokes whichever
  // reader is current (scene-scoped, disposed on scene change / unmount), so
  // a panel can list it in its loadTracks deps without ever re-creating
  // loadTracks (the stale-dist render loop lesson). A stale-scene call can at
  // worst cost the current scene one extra, coalesced read; callers already
  // skip stale track loads.
  const notifyTracksChanged = useCallback((): void => {
    busReaderRef.current?.reader.refresh();
  }, []);

  useEffect(() => {
    setBus(null);
    setFxPickerOpen(false);
    setSidechain(null);
    setMotion(null);
    if (!activeSceneId) return;
    const sceneId = activeSceneId;

    // Errors stay swallowed for the UX (the strip keeps its last state), but
    // get logged: at most once per panel per scene visit, never per retry.
    let logged = false;
    const logOnce =
      (surface: string) =>
      (error: unknown): void => {
        if (logged) return;
        logged = true;
        const detail = error instanceof Error ? error.message : String(error);
        console.warn(
          `[usePanelBus] panel bus ${surface} read failed for scene ${sceneId} (${detail}); ` +
            'keeping the last state, retrying for up to 30 s and again when the engine reports ready'
        );
      };

    const created: Array<{ ref: { current: SceneReader | null }; scoped: SceneReader }> = [];
    const bind = <T>(
      ref: { current: SceneReader | null },
      surface: string,
      read: () => Promise<T | null | undefined>,
      onValue: (value: T) => void
    ): void => {
      const scoped: SceneReader = {
        sceneId,
        reader: createRecoveringRead<T>({ read, onValue, onFailure: logOnce(surface) }),
      };
      ref.current = scoped;
      created.push({ ref, scoped });
    };

    if (supported && host.getPanelBusState) {
      bind<PanelBusState>(busReaderRef, 'state', () => host.getPanelBusState!(sceneId), setBus);
    }
    if (sidechainSupported && host.getPanelBusSidechain) {
      bind<PanelBusSidechainState>(
        sidechainReaderRef,
        'sidechain',
        () => host.getPanelBusSidechain!(sceneId),
        setSidechain
      );
    }
    if (motionSupported && host.getPanelBusMotion) {
      bind<PanelBusMotionState>(motionReaderRef, 'motion', () => host.getPanelBusMotion!(sceneId), setMotion);
    }
    if (created.length === 0) return;

    for (const { scoped } of created) void scoped.reader.read();

    return () => {
      for (const { ref, scoped } of created) {
        scoped.reader.dispose();
        if (ref.current === scoped) ref.current = null;
      }
    };
  }, [host, activeSceneId, supported, sidechainSupported, motionSupported]);

  // Engine ready = a project finished loading (the same signal that re-adopts
  // the panel's tracks). Re-read even when healthy: a same-project reopen
  // keeps the scene id but re-realizes the bus. Subscribed once per HOST, not
  // per scene, and routed to whichever readers are current: the app keys its
  // main-side listener by (plugin, event), so an unsubscribe here would also
  // deafen panel-core's track re-adoption until something re-subscribed.
  // Scene churn (including the null scene mid project switch) must never
  // unsubscribe.
  const anySurface = supported || sidechainSupported || motionSupported;
  useEffect(() => {
    if (!anySurface || typeof host.onEngineReady !== 'function') return;
    const maybeUnsubscribe: unknown = host.onEngineReady(() => {
      busReaderRef.current?.reader.signal();
      sidechainReaderRef.current?.reader.signal();
      motionReaderRef.current?.reader.signal();
    });
    return () => {
      if (typeof maybeUnsubscribe === 'function') (maybeUnsubscribe as () => void)();
    };
  }, [host, anySurface]);

  // Flush guard: never leave a pending debounced amount pointing at a stale
  // scene or an unmounted panel.
  useEffect(() => {
    return () => {
      if (sidechainDebounceRef.current) {
        clearTimeout(sidechainDebounceRef.current);
        sidechainDebounceRef.current = null;
      }
      if (motionDebounceRef.current) {
        clearTimeout(motionDebounceRef.current);
        motionDebounceRef.current = null;
      }
    };
  }, [activeSceneId]);

  // ── Meter visibility gates ────────────────────────────────────────────
  // Document visibility (tab/window hidden) + on-screen visibility
  // (IntersectionObserver on the strip container, when attached). Both gate
  // the push subscription below so hidden panels hold no engine-stream
  // refcount; an unattached ref defaults to visible for back-compat.
  const [docVisible, setDocVisible] = useState<boolean>(
    typeof document === 'undefined' ? true : !document.hidden
  );
  const [onScreen, setOnScreen] = useState(true);
  const meterObserverRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibilityChange = (): void => setDocVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const meterVisibilityRef = useCallback((el: HTMLElement | null): void => {
    meterObserverRef.current?.disconnect();
    meterObserverRef.current = null;
    if (!el || typeof IntersectionObserver === 'undefined') {
      // Detached (or jsdom) — treat as visible so the meter never dies from
      // a missing observer.
      setOnScreen(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      setOnScreen(entries.some((entry) => entry.isIntersecting));
    });
    observer.observe(el);
    meterObserverRef.current = observer;
  }, []);

  useEffect(() => {
    return () => meterObserverRef.current?.disconnect();
  }, []);

  const pushSupported = supported && typeof host.onPanelBusLevels === 'function';

  // ── Meter, push path (2.70+ hosts) ────────────────────────────────────
  // Subscribe only while engaged AND viewable; the host refcounts
  // subscriptions and turns the engine-side producer off at zero. An update
  // without this scene's entry means the bus vanished — floor the meter.
  useEffect(() => {
    if (!pushSupported || !activeSceneId || !bus?.engaged || !docVisible || !onScreen) {
      if (pushSupported) setLevels(null);
      return;
    }
    const unsubscribe = host.onPanelBusLevels!((updates) => {
      const mine = updates.find((update) => update.sceneId === activeSceneId);
      setLevels(mine ? { leftDb: mine.leftDb, rightDb: mine.rightDb, clipped: mine.clipped } : null);
    });
    return () => {
      unsubscribe();
    };
  }, [pushSupported, host, activeSceneId, bus?.engaged, docVisible, onScreen]);

  // ── Meter, legacy poll path (pre-2.70 hosts only) ─────────────────────
  // Errors and unrealized states floor the meter rather than surfacing.
  useEffect(() => {
    if (pushSupported || !supported || !activeSceneId || !bus?.engaged || !host.getPanelBusLevels) {
      if (!pushSupported) setLevels(null);
      return;
    }
    let cancelled = false;
    const tick = async (): Promise<void> => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const next = await host.getPanelBusLevels!(activeSceneId);
        if (!cancelled) setLevels(next);
      } catch {
        if (!cancelled) setLevels(null);
      }
    };
    void tick();
    const id = setInterval(() => void tick(), LEVELS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pushSupported, supported, activeSceneId, bus?.engaged, host]);

  const loadFxList = useCallback(
    async (opts: { force?: boolean; rescan?: boolean }): Promise<void> => {
      if (!supported || !host.getAvailableFx) return;
      if (fxLoadedRef.current && !opts.force && !opts.rescan) return;
      setFxLoading(true);
      try {
        // A user-initiated rescan re-walks the plugin directories AND clears
        // the engine's failed-probe blacklist (host.rescanAvailableFx), so a
        // plugin installed mid-session or blacklisted by an earlier crash
        // reappears with no restart. The lazy first-open path just reads the
        // cache. Fall back to getAvailableFx on pre-2.40 hosts.
        const list =
          opts.rescan && host.rescanAvailableFx
            ? await host.rescanAvailableFx()
            : await host.getAvailableFx();
        setAvailableFx(list);
        fxLoadedRef.current = true;
      } catch {
        // Scan unavailable — the picker shows its empty state.
      } finally {
        setFxLoading(false);
      }
    },
    [host, supported]
  );

  const openPicker = useCallback(
    (open: boolean): void => {
      setFxPickerOpen(open);
      if (open) void loadFxList({}); // lazy-load on first open (cache read)
    },
    [loadFxList]
  );

  // One wrapper for every mutation: host call → state reload. Errors surface
  // via the host's platform toast (renderer-plugin-host.handlePlatformError);
  // the strip just re-reads whatever state is true afterwards.
  const mutate = useCallback(
    (fn: (() => Promise<void>) | undefined): void => {
      if (!fn || !activeSceneId) return;
      void (async () => {
        try {
          await fn();
        } catch {
          // surfaced by the host layer; state reload below still converges
        }
        await reload();
      })();
    },
    [activeSceneId, reload]
  );

  return {
    supported,
    bus,
    levels,
    meterVisibilityRef,
    availableFx,
    fxLoading,
    fxPickerOpen,
    setFxPickerOpen: openPicker,
    refreshFx: () => void loadFxList({ rescan: true }),
    reload,
    notifyTracksChanged,
    onVolumeChange: (volumeDb: number) =>
      mutate(host.setPanelBusVolume && (() => host.setPanelBusVolume!(activeSceneId!, volumeDb))),
    onMuteToggle: () =>
      mutate(
        host.setPanelBusMute && (() => host.setPanelBusMute!(activeSceneId!, !(bus?.muted ?? false)))
      ),
    onSoloToggle: () =>
      mutate(
        host.setPanelBusSolo && (() => host.setPanelBusSolo!(activeSceneId!, !(bus?.soloed ?? false)))
      ),
    onAddFx: (pluginId: string) =>
      mutate(host.loadPanelBusFx && (async () => {
        await host.loadPanelBusFx!(activeSceneId!, pluginId);
      })),
    onRemoveFx: (fxIndex: number) =>
      mutate(host.removePanelBusFx && (() => host.removePanelBusFx!(activeSceneId!, fxIndex))),
    onToggleFxEnabled: (fxIndex: number, enabled: boolean) =>
      mutate(
        host.setPanelBusFxEnabled &&
          (() => host.setPanelBusFxEnabled!(activeSceneId!, fxIndex, enabled))
      ),
    onShowFxEditor: (fxIndex: number) =>
      mutate(
        host.showPanelBusFxEditor && (() => host.showPanelBusFxEditor!(activeSceneId!, fxIndex))
      ),
    fxReorderSupported,
    onMoveFx: (fromFxIndex: number, toFxIndex: number) => {
      if (!host.movePanelBusFx || !activeSceneId || fromFxIndex === toFxIndex) return;
      // Optimistic: land the chip in its new slot immediately; the
      // post-mutation reload converges to engine truth (and IS the rollback
      // when the host call fails).
      setBus((prev: PanelBusState | null) => {
        if (!prev) return prev;
        const from = prev.fx.findIndex((f: PanelBusFxEntry) => f.index === fromFxIndex);
        const to = prev.fx.findIndex((f: PanelBusFxEntry) => f.index === toFxIndex);
        if (from < 0 || to < 0) return prev;
        const fx = [...prev.fx];
        const [moving] = fx.splice(from, 1);
        fx.splice(to, 0, moving);
        return { ...prev, fx };
      });
      mutate(() => host.movePanelBusFx!(activeSceneId, fromFxIndex, toFxIndex));
    },
    sidechain,
    sidechainSupported,
    onSidechainAmountChange: (amount: number) => {
      if (!sidechainSupported || !activeSceneId || !host.setPanelBusSidechain) return;
      const clamped = Math.max(0, Math.min(1, amount));
      const presetId = sidechain?.presetId ?? 'classic';
      const source = sidechain?.source ?? 'kicks';
      const length = sidechain?.length ?? 'preset';
      // Local echo so the knob tracks the drag; the host write debounces.
      setSidechain((prev) =>
        prev
          ? { ...prev, amount: clamped, engaged: true }
          : {
              engaged: true,
              amount: clamped,
              presetId,
              source,
              length,
              kickTrackCount: 0,
              kickOnsetCount: 0,
            }
      );
      if (sidechainDebounceRef.current) clearTimeout(sidechainDebounceRef.current);
      sidechainDebounceRef.current = setTimeout(() => {
        sidechainDebounceRef.current = null;
        void (async () => {
          try {
            await host.setPanelBusSidechain!(activeSceneId, clamped, presetId, source, length);
          } catch {
            // surfaced by the host layer; reload below converges
          }
          await reloadSidechain();
        })();
      }, 150);
    },
    onSidechainPresetChange: (presetId: PanelBusSidechainState['presetId']) => {
      if (!sidechainSupported || !activeSceneId || !host.setPanelBusSidechain) return;
      const amount = sidechain?.amount ?? 0;
      const source = sidechain?.source ?? 'kicks';
      const length = sidechain?.length ?? 'preset';
      setSidechain((prev) => (prev ? { ...prev, presetId, engaged: true } : prev));
      void (async () => {
        try {
          await host.setPanelBusSidechain!(activeSceneId, amount, presetId, source, length);
        } catch {
          // surfaced by the host layer; reload below converges
        }
        await reloadSidechain();
      })();
    },
    onSidechainSourceChange: (source: PanelBusSidechainState['source']) => {
      if (!sidechainSupported || !activeSceneId || !host.setPanelBusSidechain) return;
      const amount = sidechain?.amount ?? 0;
      const presetId = sidechain?.presetId ?? 'classic';
      const length = sidechain?.length ?? 'preset';
      setSidechain((prev) => (prev ? { ...prev, source, engaged: true } : prev));
      void (async () => {
        try {
          await host.setPanelBusSidechain!(activeSceneId, amount, presetId, source, length);
        } catch {
          // surfaced by the host layer; reload below converges
        }
        await reloadSidechain();
      })();
    },
    onSidechainLengthChange: (length: PanelBusSidechainState['length']) => {
      if (!sidechainSupported || !activeSceneId || !host.setPanelBusSidechain) return;
      const amount = sidechain?.amount ?? 0;
      const presetId = sidechain?.presetId ?? 'classic';
      const source = sidechain?.source ?? 'kicks';
      setSidechain((prev) => (prev ? { ...prev, length, engaged: true } : prev));
      void (async () => {
        try {
          await host.setPanelBusSidechain!(activeSceneId, amount, presetId, source, length);
        } catch {
          // surfaced by the host layer; reload below converges
        }
        await reloadSidechain();
      })();
    },
    motion,
    motionSupported,
    onMotionAmountChange: (amount: number) => {
      if (!motionSupported || !activeSceneId || !host.setPanelBusMotion) return;
      const clamped = Math.max(0, Math.min(1, amount));
      // Local echo so the slider tracks the drag; the host write debounces.
      setMotion((prev) => (prev ? { ...prev, amount: clamped, engaged: true } : prev));
      if (motionDebounceRef.current) clearTimeout(motionDebounceRef.current);
      motionDebounceRef.current = setTimeout(() => {
        motionDebounceRef.current = null;
        void (async () => {
          try {
            await host.setPanelBusMotion!(activeSceneId, { amount: clamped });
          } catch {
            // surfaced by the host layer; reload below converges
          }
          await reloadMotion();
        })();
      }, 150);
    },
    onMotionRateChange: (rateQn: number) => {
      if (!motionSupported || !activeSceneId || !host.setPanelBusMotion) return;
      setMotion((prev) => (prev ? { ...prev, rateQn, patternQn: [], engaged: true } : prev));
      void (async () => {
        try {
          // A single strip-picked rate replaces any agent-authored pattern.
          await host.setPanelBusMotion!(activeSceneId, { rateQn, patternQn: [] });
        } catch {
          // surfaced by the host layer; reload below converges
        }
        await reloadMotion();
      })();
    },
    onMotionShapeChange: (shape: PanelBusMotionState['shape']) => {
      if (!motionSupported || !activeSceneId || !host.setPanelBusMotion) return;
      setMotion((prev) => (prev ? { ...prev, shape, engaged: true } : prev));
      void (async () => {
        try {
          await host.setPanelBusMotion!(activeSceneId, { shape });
        } catch {
          // surfaced by the host layer; reload below converges
        }
        await reloadMotion();
      })();
    },
    onMotionTargetChange: (target: PanelBusMotionState['target']) => {
      if (!motionSupported || !activeSceneId || !host.setPanelBusMotion) return;
      setMotion((prev) => (prev ? { ...prev, target, engaged: true } : prev));
      void (async () => {
        try {
          await host.setPanelBusMotion!(activeSceneId, { target });
        } catch {
          // surfaced by the host layer; reload below converges
        }
        await reloadMotion();
      })();
    },
  };
}
