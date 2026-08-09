/**
 * Alt-track group assembly + candidate filtering (SDK 2.66.0).
 *
 * These are the two pure functions the panel shell leans on: groups come from
 * the HOST's track columns (not scene-data), and the drawer must only ever
 * offer pairings the host will accept.
 */

import { describe, it, expect } from '@jest/globals';
import { altGroupsFromTracks, altGroupCandidates, type AltTrackCandidate } from '../alt-tracks';

function track(dbId: string, altGroupId?: string | null, altGroupOrder?: number | null): AltTrackCandidate {
  return { handle: { dbId, altGroupId: altGroupId ?? null, altGroupOrder: altGroupOrder ?? null } };
}

describe('altGroupsFromTracks', () => {
  it('assembles groups from handle columns, ordered by rotation order', () => {
    const groups = altGroupsFromTracks([
      track('lead-b', 'g1', 1),
      track('bass', null),
      track('lead-a', 'g1', 0),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].groupId).toBe('g1');
    expect(groups[0].members.map((m) => m.dbId)).toEqual(['lead-a', 'lead-b']);
    expect(groups[0].members[0].meta).toEqual({ groupId: 'g1', order: 0 });
  });

  it('drops singleton groups — one alternative is not an alternative', () => {
    expect(altGroupsFromTracks([track('solo', 'g1', 0), track('bass', null)])).toEqual([]);
  });

  it('returns nothing when no track is grouped', () => {
    expect(altGroupsFromTracks([track('a'), track('b')])).toEqual([]);
  });

  it('keeps multiple groups separate and in a stable order', () => {
    const groups = altGroupsFromTracks([
      track('p2', 'gb', 1),
      track('l2', 'ga', 1),
      track('p1', 'gb', 0),
      track('l1', 'ga', 0),
    ]);
    expect(groups.map((g) => g.groupId)).toEqual(['ga', 'gb']);
    expect(groups[1].members.map((m) => m.dbId)).toEqual(['p1', 'p2']);
  });

  it('breaks equal orders deterministically by dbId', () => {
    const forwards = altGroupsFromTracks([track('b', 'g1', 0), track('a', 'g1', 0)]);
    const backwards = altGroupsFromTracks([track('a', 'g1', 0), track('b', 'g1', 0)]);
    expect(forwards[0].members.map((m) => m.dbId)).toEqual(['a', 'b']);
    expect(backwards[0].members.map((m) => m.dbId)).toEqual(['a', 'b']);
  });

  it('treats a missing order as 0 rather than dropping the member', () => {
    const groups = altGroupsFromTracks([track('a', 'g1', null), track('b', 'g1', 1)]);
    expect(groups[0].members.map((m) => m.dbId)).toEqual(['a', 'b']);
  });
});

describe('altGroupCandidates', () => {
  it('offers ungrouped siblings but never the track itself', () => {
    const self = track('a');
    const candidates = altGroupCandidates([self, track('b'), track('c')], self);
    expect(candidates.map((c) => c.handle.dbId)).toEqual(['b', 'c']);
  });

  it('hides tracks already in a DIFFERENT group (the host would reject them)', () => {
    const self = track('a');
    const candidates = altGroupCandidates([self, track('b', 'other-group', 0), track('c')], self);
    expect(candidates.map((c) => c.handle.dbId)).toEqual(['c']);
  });

  it('still offers members of the track OWN group (adding a third member)', () => {
    const self = track('a', 'g1', 0);
    const candidates = altGroupCandidates([self, track('b', 'g1', 1), track('c')], self);
    expect(candidates.map((c) => c.handle.dbId)).toEqual(['b', 'c']);
  });
});
