/**
 * Best-effort FX-chain copy for newborn tracks that inherit a SOURCE track's
 * part (cross-panel ports, transition crossfade/fade layers). A fresh track
 * lands bone-dry even when its instrument patch travels, so the source's
 * external inserts are rebuilt on it too — with their states — via
 * `host.copyTrackFxFrom` (@since SDK 2.41.0; feature-gated so older hosts
 * no-op).
 *
 * Best-effort BY DESIGN: the part itself already landed, so FX trouble must
 * never fail or roll back the create. A third-party plugin missing from this
 * machine surfaces as a warning toast (`externalMissing`); everything else
 * still copies. Extracted from useTransitionOps' local helper so transition
 * layers and cross-panel ports share one behavior. @since SDK 3.13.0
 */

import type { PluginHost } from '../types/plugin-sdk.types';

export async function copyTrackFxBestEffort(
  host: Pick<PluginHost, 'copyTrackFxFrom' | 'showToast'>,
  destTrackId: string,
  sourceTrackDbId: string,
): Promise<void> {
  if (typeof host.copyTrackFxFrom !== 'function') return;
  try {
    const res = await host.copyTrackFxFrom(destTrackId, sourceTrackDbId);
    if (res.externalMissing.length > 0) {
      host.showToast(
        'warning',
        'Some FX not copied',
        `Missing plugin(s): ${res.externalMissing.join(', ')}`,
      );
    }
  } catch {
    /* best-effort — the track still works, just drier */
  }
}
