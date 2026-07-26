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
  useEffect(() => {
    if (!enabled) return undefined;
    const onFreezeChanged = (): void => {
      void refresh();
    };
    window.addEventListener('sas:freeze-changed', onFreezeChanged);
    return () => window.removeEventListener('sas:freeze-changed', onFreezeChanged);
  }, [enabled, refresh]);

  const run = useCallback(
    async (action: 'freeze' | 'unfreeze'): Promise<void> => {
      if (!host) return;
      const method = action === 'freeze' ? host.freezeTrack : host.unfreezeTrack;
      if (typeof method !== 'function') return;
      setBusy(action);
      setError(null);
      try {
        setState(await method.call(host, trackId));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        void refresh();
      } finally {
        setBusy(null);
      }
    },
    [host, trackId, refresh]
  );

  const freeze = useCallback((): Promise<void> => run('freeze'), [run]);
  const unfreeze = useCallback((): Promise<void> => run('unfreeze'), [run]);

  return { enabled, state, busy, error, refresh, freeze, unfreeze };
}
