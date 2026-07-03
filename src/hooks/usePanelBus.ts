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
  PanelBusState,
  PluginHost,
} from '../types/plugin-sdk.types';

export interface UsePanelBusResult {
  /** False on pre-2.36 hosts — render no strip. */
  supported: boolean;
  /** Null until the first load completes for the current scene. */
  bus: PanelBusState | null;
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
}

export function usePanelBus(host: PluginHost, activeSceneId: string | null): UsePanelBusResult {
  const supported = typeof host.getPanelBusState === 'function';
  const [bus, setBus] = useState<PanelBusState | null>(null);
  const [availableFx, setAvailableFx] = useState<InstrumentDescriptor[]>([]);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxPickerOpen, setFxPickerOpen] = useState(false);
  const fxLoadedRef = useRef(false);
  // Stale-scene guard: a slow read for the PREVIOUS scene must not clobber
  // the current scene's state (same shape as the panels' loadTracks guard).
  const loadSeqRef = useRef(0);

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

  useEffect(() => {
    setBus(null);
    setFxPickerOpen(false);
    void reload();
  }, [reload]);

  const loadFxList = useCallback(
    async (force: boolean): Promise<void> => {
      if (!supported || !host.getAvailableFx) return;
      if (fxLoadedRef.current && !force) return;
      setFxLoading(true);
      try {
        const list = await host.getAvailableFx();
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
      if (open) void loadFxList(false); // lazy-load on first open
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
    availableFx,
    fxLoading,
    fxPickerOpen,
    setFxPickerOpen: openPicker,
    refreshFx: () => void loadFxList(true),
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
  };
}
