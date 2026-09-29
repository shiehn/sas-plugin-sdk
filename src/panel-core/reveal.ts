/**
 * Agent auto-reveal, the panel's half (SDK 3.20.0).
 *
 * When an agent changes a track, or asks for one ("show me the bass FX"), the
 * host opens the owning panel and scrolls to / highlights the row, finding it
 * by the `data-track-id` / `data-track-db-id` attributes `TrackRow` renders.
 * What only the panel can do is change UI state it owns, so the host sends a
 * `PluginRevealRequest` through `host.onRevealRequest` and panel-core applies
 * it: today, opening the track's drawer to the requested tab.
 */

import type { PluginRevealRequest } from '../types/plugin-sdk.types';

/**
 * The engine id of the panel track a reveal request targets, or null when the
 * request is for a track this panel doesn't own. Matches the engine id first,
 * then the DB id.
 */
export function findRevealTrackId(
  tracks: ReadonlyArray<{ handle: { id: string; dbId: string } }>,
  request: PluginRevealRequest,
): string | null {
  if (request.trackId) {
    const byId = tracks.find((t) => t.handle.id === request.trackId);
    if (byId) return byId.handle.id;
  }
  if (request.trackDbId) {
    const byDbId = tracks.find((t) => t.handle.dbId === request.trackDbId);
    if (byDbId) return byDbId.handle.id;
  }
  return null;
}
