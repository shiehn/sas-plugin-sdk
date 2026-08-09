/**
 * Alt-track groups — pure panel-side view of the host's alternatives model.
 *
 * An "alt group" is n tracks that are interchangeable ALTERNATIVES of one
 * part (two Lead presets, say): equally good, filling the same role, and
 * NEVER played together. During loop-a playback the host rotates them
 * round-robin — one member per loop cycle — and the arranger staggers them
 * across the arrangement for variety.
 *
 * Unlike every other panel group family (crossfades, ensemble voices,
 * mix-asset kinds), membership is NOT panel scene-data: it is first-class
 * host state on the track rows (`tracks.alt_group_id` / `alt_group_order`,
 * host Migration 080) so the arranger can consume it. The panel therefore
 * builds group metas from the track HANDLES rather than scanning
 * `track:<dbId>:<metaKey>` keys — but the assembled shape is the same
 * `TrackGroupMeta`, so it flows through the existing `resolveTrackGroups`
 * pipeline unchanged.
 *
 * @since SDK 2.66.0
 */

import type { PluginTrackHandle } from '../types/plugin-sdk.types';
import type { TrackGroupMeta } from './group-meta';

/** Per-member alt metadata, mirroring the host's two track columns. */
export interface AltTrackMeta {
  groupId: string;
  /** Rotation order: lowest plays first and is what renders bake. */
  order: number;
}

/** The minimum a track must expose to participate (satisfied by panel rows). */
export interface AltTrackCandidate {
  handle: Pick<PluginTrackHandle, 'dbId' | 'altGroupId' | 'altGroupOrder'>;
}

/**
 * Assemble alt groups from live track handles, members sorted by rotation
 * order (ties broken by dbId so the order is stable across reloads).
 *
 * Singleton groups are dropped: one alternative is not an alternative — it
 * renders as a normal row. The host dissolves singletons on ungroup, so this
 * only bites transiently (mid-edit, or a member deleted out-of-band).
 */
export function altGroupsFromTracks<T extends AltTrackCandidate>(
  tracks: readonly T[],
): TrackGroupMeta<AltTrackMeta>[] {
  const byGroup = new Map<string, Array<{ dbId: string; meta: AltTrackMeta }>>();
  for (const track of tracks) {
    const groupId = track.handle.altGroupId;
    if (!groupId) continue;
    const members = byGroup.get(groupId) ?? [];
    members.push({
      dbId: track.handle.dbId,
      meta: { groupId, order: track.handle.altGroupOrder ?? 0 },
    });
    byGroup.set(groupId, members);
  }

  const out: TrackGroupMeta<AltTrackMeta>[] = [];
  for (const [groupId, members] of byGroup) {
    if (members.length < 2) continue;
    members.sort((a, b) => a.meta.order - b.meta.order || a.dbId.localeCompare(b.dbId));
    out.push({ groupId, members });
  }
  // Deterministic group order across renders.
  out.sort((a, b) => a.groupId.localeCompare(b.groupId));
  return out;
}

/**
 * Tracks this panel could add to `currentTrack`'s alternatives: same panel
 * (the host enforces this too), not the track itself, and not already in a
 * DIFFERENT group — the host rejects inputs spanning two groups, so never
 * offer a choice that can only fail.
 */
export function altGroupCandidates<T extends AltTrackCandidate>(
  tracks: readonly T[],
  currentTrack: T,
): T[] {
  const currentGroupId = currentTrack.handle.altGroupId ?? null;
  return tracks.filter((t) => {
    if (t.handle.dbId === currentTrack.handle.dbId) return false;
    const groupId = t.handle.altGroupId ?? null;
    if (groupId === null) return true;
    return groupId === currentGroupId;
  });
}
