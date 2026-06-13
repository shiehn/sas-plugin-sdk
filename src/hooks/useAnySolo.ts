/**
 * useAnySolo — reactively reports whether ANY track in the project is soloed.
 *
 * Solo is cross-panel: when the user solos a track in ANY panel, the engine's
 * effective-mute model silences every non-soloed track. A panel uses this flag
 * to DIM its own non-soloed rows without lighting their Mute buttons:
 *
 * ```tsx
 * const anySolo = useAnySolo(host);
 * // ...
 * <TrackRow soloedOut={anySolo && !track.runtimeState.solo} ... />
 * ```
 *
 * Refreshes on mount and on every track-state change. `onTrackStateChange`
 * fires for tracks in ALL panels (not just this plugin's), so a solo toggled in
 * another panel updates this flag too.
 */

import { useEffect, useState } from 'react';
import type { PluginHost } from '../types/plugin-sdk.types';

export function useAnySolo(
  host: Pick<PluginHost, 'isAnySoloActive' | 'onTrackStateChange'>
): boolean {
  const [anySolo, setAnySolo] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = (): void => {
      host
        .isAnySoloActive()
        .then((v) => {
          if (active) setAnySolo(v);
        })
        .catch(() => {
          /* engine unreachable — leave the flag as-is rather than flicker */
        });
    };
    refresh();
    const unsub = host.onTrackStateChange(() => refresh());
    return () => {
      active = false;
      unsub();
    };
  }, [host]);

  return anySolo;
}
