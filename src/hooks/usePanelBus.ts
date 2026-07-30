/**
 * usePanelBus — panel-side state + handlers for the PanelMasterStrip
 * (docs/panel-bus.md §11).
 *
 * Feature-gated: `supported` is false on hosts without the panel-bus surface
 * (older app builds), and every consumer should render nothing in that case —
 * the strip must never appear on a host that can't back it. Reading state
 * NEVER engages a bus; the first mutation (fader move / FX add) does, host-side.
 *
 * Reload story: state re-reads on scene change and after every mutation.
 * `getPanelBusState` host-side also (re)realizes the bus (adopt-by-marker)
 * and routes not-yet-routed panel tracks, so calling `reload()` from the
 * panel's track-reload path keeps everything converged with zero extra wiring.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  InstrumentDescriptor,
  PanelBusFxEntry,
  PanelBusLevels,
  PanelBusSidechainState,
  PanelBusState,
  PluginHost,
} from '../types/plugin-sdk.types';

/** Bus meter poll cadence. Half the per-track meters' 33 ms — one extra IPC
 *  round-trip per engaged panel is cheap, and 15 Hz reads fine on a bus bar. */
const LEVELS_POLL_MS = 66;

export interface UsePanelBusResult {
  /** False on pre-2.36 hosts — render no strip. */
  supported: boolean;
  /** Null until the first load completes for the current scene. */
  bus: PanelBusState | null;
  /** Stereo output levels (null = disengaged / floored). Polled at ~15 Hz. */
  levels: PanelBusLevels | null;
  availableFx: InstrumentDescriptor[];
  fxLoading: boolean;
  fxPickerOpen: boolean;
  setFxPickerOpen: (open: boolean) => void;
  refreshFx: () => void;
  reload: () => Promise<void>;
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
}

export function usePanelBus(host: PluginHost, activeSceneId: string | null): UsePanelBusResult {
  const supported = typeof host.getPanelBusState === 'function';
  const sidechainSupported =
    typeof host.getPanelBusSidechain === 'function' && typeof host.setPanelBusSidechain === 'function';
  const fxReorderSupported = supported && typeof host.movePanelBusFx === 'function';
  const [bus, setBus] = useState<PanelBusState | null>(null);
  const [levels, setLevels] = useState<PanelBusLevels | null>(null);
  const [sidechain, setSidechain] = useState<PanelBusSidechainState | null>(null);
  const [availableFx, setAvailableFx] = useState<InstrumentDescriptor[]>([]);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxPickerOpen, setFxPickerOpen] = useState(false);
  const fxLoadedRef = useRef(false);
  // Stale-scene guard: a slow read for the PREVIOUS scene must not clobber
  // the current scene's state (same shape as the panels' loadTracks guard).
  const loadSeqRef = useRef(0);
  const sidechainSeqRef = useRef(0);
  const sidechainDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    if (!supported || !activeSceneId || !host.getPanelBusState) {
      setBus(null);
      return;
    }
    const seq = ++loadSeqRef.current;
    try {
      const state = await host.getPanelBusState(activeSceneId);
      if (loadSeqRef.current === seq) setBus(state);
    } catch {
      // Host hiccup (project switching, engine restart) — keep prior state;
      // the next scene-change or mutation reload converges.
    }
  }, [host, activeSceneId, supported]);

  const reloadSidechain = useCallback(async (): Promise<void> => {
    if (!sidechainSupported || !activeSceneId || !host.getPanelBusSidechain) {
      setSidechain(null);
      return;
    }
    const seq = ++sidechainSeqRef.current;
    try {
      const state = await host.getPanelBusSidechain(activeSceneId);
      if (sidechainSeqRef.current === seq) setSidechain(state);
    } catch {
      // Cheap blob read — a hiccup just leaves the prior state; the next
      // scene change or knob touch converges.
    }
  }, [host, activeSceneId, sidechainSupported]);

  useEffect(() => {
    setBus(null);
    setFxPickerOpen(false);
    setSidechain(null);
    void reload();
    void reloadSidechain();
  }, [reload, reloadSidechain]);

  // Flush guard: never leave a pending debounced amount pointing at a stale
  // scene or an unmounted panel.
  useEffect(() => {
    return () => {
      if (sidechainDebounceRef.current) {
        clearTimeout(sidechainDebounceRef.current);
        sidechainDebounceRef.current = null;
      }
    };
  }, [activeSceneId]);

  // Meter poll: only while the bus is engaged (and the tab visible). Errors
  // and unrealized states floor the meter rather than surfacing.
  useEffect(() => {
    if (!supported || !activeSceneId || !bus?.engaged || !host.getPanelBusLevels) {
      setLevels(null);
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
  }, [supported, activeSceneId, bus?.engaged, host]);

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
    availableFx,
    fxLoading,
    fxPickerOpen,
    setFxPickerOpen: openPicker,
    refreshFx: () => void loadFxList({ rescan: true }),
    reload,
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
      // Local echo so the knob tracks the drag; the host write debounces.
      setSidechain((prev) =>
        prev
          ? { ...prev, amount: clamped, engaged: true }
          : { engaged: true, amount: clamped, presetId, kickTrackCount: 0, kickOnsetCount: 0 }
      );
      if (sidechainDebounceRef.current) clearTimeout(sidechainDebounceRef.current);
      sidechainDebounceRef.current = setTimeout(() => {
        sidechainDebounceRef.current = null;
        void (async () => {
          try {
            await host.setPanelBusSidechain!(activeSceneId, clamped, presetId);
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
      setSidechain((prev) => (prev ? { ...prev, presetId, engaged: true } : prev));
      void (async () => {
        try {
          await host.setPanelBusSidechain!(activeSceneId, amount, presetId);
        } catch {
          // surfaced by the host layer; reload below converges
        }
        await reloadSidechain();
      })();
    },
  };
}
