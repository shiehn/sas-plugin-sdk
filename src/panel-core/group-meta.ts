/**
 * Generic multi-track group seam — the crossfade-pair pattern, family- and
 * meta-parameterized.
 *
 * A "track group" is N normal tracks linked by a shared `groupId` persisted in
 * scene plugin_data under one key PER MEMBER: `track:<dbId>:<metaKey>`. Groups
 * are never stored as a group-level record; they are assembled by scanning the
 * member keys (single source of truth, survives member deletion gracefully).
 * The panel-core resolves parsed groups against live tracks each render:
 * complete groups render through a custom group row and their members are
 * excluded from the normal row list; incomplete groups degrade per the
 * extension's `isComplete` policy (crossfade: both members required; a bass
 * voice-group: anchor required).
 *
 * This is the seam the crossfade/fade metas established (crossfade-meta.ts);
 * new group families (e.g. the bass plugin's voice groups) ride it without
 * panel-core changes.
 *
 * @since SDK 2.35.0
 */

/** One parsed member: the scene-data key's dbId + its narrowed meta value. */
export interface TrackGroupMember<M> {
  dbId: string;
  meta: M;
}

/** One parsed group (members in `sortMembers` order when provided). */
export interface TrackGroupMeta<M> {
  groupId: string;
  members: TrackGroupMember<M>[];
}

/** How to scan + narrow one group family out of scene plugin_data. */
export interface GroupParseSpec<M> {
  /** Scene-data key suffix: scans `track:<dbId>:<metaKey>`. */
  metaKey: string;
  /** Defensive narrow (the `asCrossfadeMeta` pattern) — return null to skip. */
  asMeta(val: unknown): M | null;
  /** Extract the shared group id from a member meta. */
  groupIdOf(meta: M): string;
  /** Stable member order (e.g. by voiceIndex). Omit = scene-data scan order. */
  sortMembers?(a: TrackGroupMember<M>, b: TrackGroupMember<M>): number;
}

/**
 * Scan all `track:<dbId>:<metaKey>` keys in a scene's plugin_data and assemble
 * groups. Pure — no I/O; caller passes the already-fetched scene data map.
 */
export function parseTrackGroups<M>(
  sceneData: Record<string, unknown>,
  spec: GroupParseSpec<M>,
): TrackGroupMeta<M>[] {
  const pattern = new RegExp(`^track:(.+):${spec.metaKey}$`);
  const groups = new Map<string, TrackGroupMember<M>[]>();
  for (const [key, val] of Object.entries(sceneData)) {
    const match = pattern.exec(key);
    if (!match) continue;
    const meta = spec.asMeta(val);
    if (!meta) continue;
    const groupId = spec.groupIdOf(meta);
    const list = groups.get(groupId) ?? [];
    list.push({ dbId: match[1], meta });
    groups.set(groupId, list);
  }
  const out: TrackGroupMeta<M>[] = [];
  for (const [groupId, members] of groups) {
    if (spec.sortMembers) members.sort(spec.sortMembers);
    out.push({ groupId, members });
  }
  return out;
}

/** A group resolved against live tracks (only members whose track exists). */
export interface ResolvedTrackGroup<M, T> {
  groupId: string;
  members: Array<{ dbId: string; meta: M; track: T }>;
}

export interface ResolveGroupsOptions<M, T> {
  /**
   * Group completeness policy. A group failing this renders as loose normal
   * rows instead (its members are NOT excluded). Default: every PARSED member
   * resolved a live track — the crossfade rule (partner deleted ⇒ degrade).
   */
  isComplete?(group: ResolvedTrackGroup<M, T>, parsed: TrackGroupMeta<M>): boolean;
}

export interface ResolvedGroupsResult<M, T> {
  /** Complete groups, ready for the group row renderer. */
  resolved: ResolvedTrackGroup<M, T>[];
  /** dbIds of members of COMPLETE groups — exclude these from normal rows. */
  memberDbIds: Set<string>;
  /**
   * dbIds whose member key exists but whose track is gone (deleted
   * out-of-band) — candidates for lazy scene-data cleanup.
   */
  staleMemberDbIds: string[];
}

/**
 * Resolve parsed groups against live track state. Pure; call from a useMemo
 * keyed on [tracks, parsedGroups] (fresh array identities per call are
 * expected — do NOT key effects on the arrays without a string-key guard,
 * see the drift-resync `lastResyncKeyRef` pattern).
 */
export function resolveTrackGroups<M, T>(
  parsedGroups: TrackGroupMeta<M>[],
  tracks: readonly T[],
  getDbId: (track: T) => string,
  opts: ResolveGroupsOptions<M, T> = {},
): ResolvedGroupsResult<M, T> {
  const byDbId = new Map<string, T>();
  for (const t of tracks) byDbId.set(getDbId(t), t);

  const resolved: ResolvedTrackGroup<M, T>[] = [];
  const memberDbIds = new Set<string>();
  const staleMemberDbIds: string[] = [];

  for (const parsed of parsedGroups) {
    const live: ResolvedTrackGroup<M, T> = { groupId: parsed.groupId, members: [] };
    for (const member of parsed.members) {
      const track = byDbId.get(member.dbId);
      if (track) live.members.push({ dbId: member.dbId, meta: member.meta, track });
      else staleMemberDbIds.push(member.dbId);
    }
    if (live.members.length === 0) continue;
    const complete = opts.isComplete
      ? opts.isComplete(live, parsed)
      : live.members.length === parsed.members.length;
    if (!complete) continue; // degrade: members render as normal rows
    resolved.push(live);
    for (const m of live.members) memberDbIds.add(m.dbId);
  }

  return { resolved, memberDbIds, staleMemberDbIds };
}
