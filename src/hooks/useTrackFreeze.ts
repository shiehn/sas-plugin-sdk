/**
 * useTrackFreeze — one track's freeze state + actions (@since SDK 2.47.0).
 *
 * Owned by TrackRow (always mounted) so the ❄ row badge and the drawer's
 * Freeze tab share ONE state — the drawer unmounts when closed, so state
 * lifted here survives open/close. Capability-gated: pass any host; when it
 * lacks `getTrackFreezeState` the hook is inert (`enabled: false`, no
 * fetches) and nothing renders.
 */

import { useState, useEffect, useCallback } from 'react';
import type { PluginHost, TrackFreezeState } from '../types/plugin-sdk.types';

export interface UseTrackFreezeResult {
  /** Host supports the freeze surface (feature detection). */
  enabled: boolean;
  /** null until the first read resolves (or when reads fail / hook disabled). */
  state: TrackFreezeState | null;
  busy: 'freeze' | 'unfreeze' | null;
  error: string | null;
  refresh: () => Promise<void>;
  freeze: () => Promise<void>;
  unfreeze: () => Promise<void>;
  /**
   * Render a NEW stem even though nothing detectable changed (@since 2.67.0).
   * The escape hatch for sound the app cannot see move — a third-party
   * instrument's patch edited in its own window. `undefined` when the host
   * predates the option, so callers can hide the control.
   */
  forceRefreeze?: () => Promise<void>;
}

export function useTrackFreeze(host: PluginHost | undefined, trackId: string): UseTrackFreezeResult {
  const enabled = !!host && typeof host.getTrackFreezeState === 'function';
  const [state, setState] = useState<TrackFreezeState | null>(null);
  const [busy, setBusy] = useState<'freeze' | 'unfreeze' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled || !host?.getTrackFreezeState) return;
    try {
      setState(await host.getTrackFreezeState(trackId));
    } catch {
      // Non-fatal (e.g. sample/audio rows refuse) — badge/tab stay inert.
      setState(null);
    }
  }, [enabled, host, trackId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Scene-level and Freeze-All batches change freeze state OUTSIDE this
  // row — the workstation dispatches 'sas:freeze-changed' when a batch
  // completes so every mounted badge/tab refetches (@since SDK 2.47.1).
  // Single-track actions dispatch it too (see `run`), which is how the scene
  // and project ❄ rollups follow a row's toggle; `detail.trackId` lets the
  // hook that just acted skip its own echo — it already holds the state the
  // action returned, and refetching it would only race that value.
  useEffect(() => {
    if (!enabled) return undefined;
    const onFreezeChanged = (e: Event): void => {
      const originator = (e as CustomEvent<{ trackId?: string } | undefined>).detail?.trackId;
      if (originator === trackId) return;
      void refresh();
    };
    window.addEventListener('sas:freeze-changed', onFreezeChanged);
    return () => window.removeEventListener('sas:freeze-changed', onFreezeChanged);
  }, [enabled, refresh, trackId]);

  const run = useCallback(
    async (action: 'freeze' | 'unfreeze', force?: boolean): Promise<void> => {
      if (!host) return;
      const method = action === 'freeze' ? host.freezeTrack : host.unfreezeTrack;
      if (typeof method !== 'function') return;
      setBusy(action);
      setError(null);
      try {
        setState(
          action === 'freeze' && force
            ? await host.freezeTrack!.call(host, trackId, { force: true })
            : await method.call(host, trackId)
        );
        // The scene ❄ count and the project rollup are derived from this
        // track's row, so they are wrong the moment it changes. Same event
        // the batch handlers use — one contract, every listener.
        window.dispatchEvent(new CustomEvent('sas:freeze-changed', { detail: { trackId } }));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        // The row's ❄ toggle is one click with no dialog, so a failure has no
        // other place to land — the drawer (which renders `error` inline) may
        // not even be open. Toast it: main's refusals name the remedy.
        host.showToast?.(
          'error',
          action === 'freeze' ? 'Freeze Failed' : 'Unfreeze Failed',
          message
        );
        void refresh();
      } finally {
        setBusy(null);
      }
    },
    [host, trackId, refresh]
  );

  const freeze = useCallback((): Promise<void> => run('freeze'), [run]);
  const unfreeze = useCallback((): Promise<void> => run('unfreeze'), [run]);
  const forceRefreeze = useCallback((): Promise<void> => run('freeze', true), [run]);

  // The host's freezeTrack takes the options argument from 2.67.0 on. An
  // older host would silently ignore `force` and reuse the cached stem — the
  // exact wrong outcome — so the action is withheld rather than lying.
  const supportsForce = (host?.freezeTrack?.length ?? 0) >= 2;

  return {
    enabled,
    state,
    busy,
    error,
    refresh,
    freeze,
    unfreeze,
    ...(supportsForce ? { forceRefreeze } : {}),
  };
}
