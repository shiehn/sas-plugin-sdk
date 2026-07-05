/**
 * useTrackExternalFx — panel-side state + handlers for one track's
 * third-party FX inserts (the TrackDrawer FX-tab section; the per-track
 * sibling of usePanelBus).
 *
 * Feature-gated: `supported` is false on hosts without the track-external-FX
 * surface (pre-2.39 app builds) and consumers must render nothing then.
 * Reading converges persisted state host-side (raw-state replay on the
 * session's first read; rebuild after a `.sasproj` import), so the mount
 * read is the whole reload story.
 *
 * Mutations follow the strip's pattern: host call → list reload. Errors
 * surface via the host's platform toast; the section re-reads whatever
 * state is true afterwards.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  InstrumentDescriptor,
  PluginHost,
  TrackExternalFxEntry,
} from '../types/plugin-sdk.types';

export interface UseTrackExternalFxResult {
  /** False on pre-2.39 hosts — render no section. */
  supported: boolean;
  /** Null until the first load completes for the current track. */
  fx: TrackExternalFxEntry[] | null;
  availableFx: InstrumentDescriptor[];
  fxLoading: boolean;
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
  refreshFx: () => void;
  reload: () => Promise<void>;
  onAddFx: (pluginId: string) => void;
  onRemoveFx: (fxIndex: number) => void;
  onToggleFxEnabled: (fxIndex: number, enabled: boolean) => void;
  onShowFxEditor: (fxIndex: number) => void;
}

export function useTrackExternalFx(host: PluginHost, trackId: string): UseTrackExternalFxResult {
  const supported = typeof host.getTrackExternalFx === 'function';
  const [fx, setFx] = useState<TrackExternalFxEntry[] | null>(null);
  const [availableFx, setAvailableFx] = useState<InstrumentDescriptor[]>([]);
  const [fxLoading, setFxLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fxLoadedRef = useRef(false);
  // Stale-track guard: a slow read for the PREVIOUS track must not clobber
  // the current track's list (same shape as usePanelBus's scene guard).
  const loadSeqRef = useRef(0);

  const reload = useCallback(async (): Promise<void> => {
    if (!supported || !trackId || !host.getTrackExternalFx) {
      setFx(null);
      return;
    }
    const seq = ++loadSeqRef.current;
    try {
      const list = await host.getTrackExternalFx(trackId);
      if (loadSeqRef.current === seq) setFx(list);
    } catch {
      // Host hiccup (project switching, engine restart) — keep prior state;
      // the next mutation or remount converges.
    }
  }, [host, trackId, supported]);

  useEffect(() => {
    setFx(null);
    setPickerOpen(false);
    void reload();
  }, [reload]);

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
      setPickerOpen(open);
      if (open) void loadFxList({}); // lazy-load on first open (cache read)
    },
    [loadFxList]
  );

  const mutate = useCallback(
    (fn: (() => Promise<void>) | undefined): void => {
      if (!fn || !trackId) return;
      void (async () => {
        try {
          await fn();
        } catch {
          // surfaced by the host layer; state reload below still converges
        }
        await reload();
      })();
    },
    [trackId, reload]
  );

  return {
    supported,
    fx,
    availableFx,
    fxLoading,
    pickerOpen,
    setPickerOpen: openPicker,
    refreshFx: () => void loadFxList({ rescan: true }),
    reload,
    onAddFx: (pluginId: string) =>
      mutate(host.loadTrackExternalFx && (async () => {
        await host.loadTrackExternalFx!(trackId, pluginId);
      })),
    onRemoveFx: (fxIndex: number) =>
      mutate(host.removeTrackExternalFx && (() => host.removeTrackExternalFx!(trackId, fxIndex))),
    onToggleFxEnabled: (fxIndex: number, enabled: boolean) =>
      mutate(
        host.setTrackExternalFxEnabled &&
          (() => host.setTrackExternalFxEnabled!(trackId, fxIndex, enabled))
      ),
    onShowFxEditor: (fxIndex: number) =>
      mutate(
        host.showTrackExternalFxEditor && (() => host.showTrackExternalFxEditor!(trackId, fxIndex))
      ),
  };
}
