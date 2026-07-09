/**
 * Fade metadata — family-agnostic types + parsing for transition orphan fades
 * (synth / drum / instrument panels).
 *
 * A fade is a CROSSFADE WITH ONE EMPTY ENDPOINT: a single generated track that
 * either fades IN (a target-only track entering — `morph(∅ → target)`) or fades
 * OUT (an origin-only track leaving — `morph(origin → ∅)`) across the transition
 * loop. It reuses the same generation pipeline (`buildCrossfadeInpaintPrompt`
 * with one empty endpoint) and the same volume-automation fader as crossfade.
 *
 * Stored in scene plugin_data under `track:<dbId>:fade` (ONE entry per track —
 * unlike crossfade there is no partner / groupId). Kept as a SEPARATE type from
 * crossfade so the load-bearing "drop a half-broken pair" guard in
 * `parseCrossfadePairs` stays intact.
 *
 * @since SDK 2.28.0
 */

import { type VolumeAutomationPoint, FADE_FLOOR_DB, gainToDb } from './crossfade-meta';

/** Which way the lone track fades over the transition. */
export type FadeDirection = 'in' | 'out';

/**
 * How the fade is shaped:
 * - `volume` — a one-sided level ramp does the work (DJ-style). Best for
 *   textural/sustained material (pads, atmospheres).
 * - `build` — the MIDI carries the fade (the inpaint grows sparse→full on the way
 *   in, or dissolves on the way out); the level stays flat. Best for articulated
 *   material (lead, bass, drums, winds, vocals).
 */
export type FadeGesture = 'volume' | 'build';

/** Per-track fade metadata (one scene-data value per fade track). */
export interface FadeMeta {
  direction: FadeDirection;
  gesture: FadeGesture;
  /**
   * Audio transition variant for one-sided LOOP transitions. `'fade'` (default,
   * and the only value MIDI panels write) is a plain level ramp; `stutter` /
   * `chopped` re-render the loop's audio, `delay` adds a delay-throw FX. Shown as
   * a badge on the row. @since SDK 2.32.0
   */
  effect?: 'fade' | 'stutter' | 'chopped' | 'delay';
  /** DB id of the SOURCE track this fade's preset/sample + pattern was seeded from. */
  sourceTrackDbId: string;
  /** DB id of the scene the source track lives in (the from/to scene). */
  sourceSceneId: string;
  /** Source track display name (shown in the caption). */
  sourceName: string;
  /** Copied preset/sample label (shown in the caption). */
  soundLabel: string;
  /** Fade position 0..1 — WHERE in time the fade midpoint sits. */
  sliderPos: number;
  /**
   * GROUP fades (verbatim multi-track fades, e.g. a bass voice group): shared
   * id linking every member track of one fade — by convention the first
   * member copy's dbId. Absent on classic single-track fades; old metas parse
   * unchanged. All members of a group share direction/gesture/sliderPos.
   * @since SDK 2.41.0
   */
  groupId?: string;
  /** Stable member order within the group (e.g. bass voiceIndex). @since SDK 2.41.0 */
  memberIndex?: number;
  /** Per-member caption, e.g. the bass voice partition label. @since SDK 2.41.0 */
  memberLabel?: string;
}

/** A fade entry resolved from scene data: the fade track's dbId + its metadata. */
export interface FadeEntry {
  dbId: string;
  meta: FadeMeta;
}

/** Narrow an unknown scene-data value to FadeMeta (defensive — survives partial blobs). */
export function asFadeMeta(val: unknown): FadeMeta | null {
  if (!val || typeof val !== 'object') return null;
  const m = val as Partial<FadeMeta>;
  if (m.direction !== 'in' && m.direction !== 'out') return null;
  if (m.gesture !== 'volume' && m.gesture !== 'build') return null;
  const effect =
    m.effect === 'stutter' || m.effect === 'chopped' || m.effect === 'delay' || m.effect === 'fade'
      ? m.effect
      : undefined;
  return {
    direction: m.direction,
    gesture: m.gesture,
    effect,
    sourceTrackDbId: typeof m.sourceTrackDbId === 'string' ? m.sourceTrackDbId : '',
    sourceSceneId: typeof m.sourceSceneId === 'string' ? m.sourceSceneId : '',
    sourceName: typeof m.sourceName === 'string' ? m.sourceName : '',
    soundLabel: typeof m.soundLabel === 'string' ? m.soundLabel : '',
    sliderPos: typeof m.sliderPos === 'number' ? m.sliderPos : 0.5,
    groupId: typeof m.groupId === 'string' && m.groupId ? m.groupId : undefined,
    memberIndex: typeof m.memberIndex === 'number' ? m.memberIndex : undefined,
    memberLabel: typeof m.memberLabel === 'string' && m.memberLabel ? m.memberLabel : undefined,
  };
}

/**
 * Scan all `track:<dbId>:fade` keys in a scene's plugin_data and return one entry
 * per valid fade. Unlike crossfade there is no grouping or both-present gate — a
 * fade is intrinsically a single track.
 */
export function parseFades(sceneData: Record<string, unknown>): FadeEntry[] {
  const out: FadeEntry[] = [];
  for (const [key, val] of Object.entries(sceneData)) {
    const match = /^track:(.+):fade$/.exec(key);
    if (!match) continue;
    const meta = asFadeMeta(val);
    if (!meta) continue;
    out.push({ dbId: match[1], meta });
  }
  return out;
}

/**
 * One GROUP fade assembled from its member entries: N tracks fading together
 * as a unit (verbatim group fades — e.g. a copied bass voice group). Scalars
 * (direction/gesture/sliderPos) come from the first member; creation writes
 * them identically across members. Generic over the entry type so callers can
 * split live-resolved entries without losing their extra fields.
 * @since SDK 2.41.0
 */
export interface GroupFadeEntryOf<E extends FadeEntry> {
  groupId: string;
  direction: FadeDirection;
  gesture: FadeGesture;
  sliderPos: number;
  /** Members sorted by memberIndex (creation order fallback). */
  members: E[];
}

/** The plain-entry specialization (scene-data parse results). @since SDK 2.41.0 */
export type GroupFadeEntry = GroupFadeEntryOf<FadeEntry>;

/**
 * Partition parsed fade entries into classic single-track fades and group
 * fades (entries sharing a `groupId`). Pure; keyed for the panel-core render
 * split — drift-resync and curve re-apply deliberately keep iterating the
 * FLAT entry list so they need no group awareness. @since SDK 2.41.0
 */
export function splitFadeEntries<E extends FadeEntry>(entries: E[]): {
  singles: E[];
  groups: GroupFadeEntryOf<E>[];
} {
  const singles: E[] = [];
  const byGroup = new Map<string, E[]>();
  for (const entry of entries) {
    const gid = entry.meta.groupId;
    if (!gid) {
      singles.push(entry);
      continue;
    }
    const list = byGroup.get(gid) ?? [];
    list.push(entry);
    byGroup.set(gid, list);
  }
  const groups: GroupFadeEntryOf<E>[] = [];
  for (const [groupId, members] of byGroup) {
    members.sort((a, b) => (a.meta.memberIndex ?? 0) - (b.meta.memberIndex ?? 0));
    const head = members[0].meta;
    groups.push({
      groupId,
      direction: head.direction,
      gesture: head.gesture,
      sliderPos: head.sliderPos,
      members,
    });
  }
  return { singles, groups };
}

/**
 * Build a ONE-sided volume-automation curve for a fade over `bars` at `bpm`.
 *
 * - `gesture === 'build'` → flat at unity (0 dB). The compositional build in the
 *   MIDI carries the fade; layering a volume ramp on top would double-fade.
 * - `gesture === 'volume'` → an equal-power ramp identical to ONE half of
 *   `buildCrossfadeVolumeCurves`: fade-out ≡ its `origin` curve (unity→floor),
 *   fade-in ≡ its `target` curve (floor→unity). `sliderPos` sets WHERE the −3 dB
 *   midpoint sits in time.
 *
 * Points span [0, durationSeconds] so the engine re-reads them each loop. Returns
 * dB points for `host.setTrackVolumeAutomation`.
 *
 * @since SDK 2.28.0
 */
export function buildFadeVolumeCurve(
  bars: number,
  bpm: number,
  direction: FadeDirection,
  sliderPos: number,
  gesture: FadeGesture,
  steps = 32,
): VolumeAutomationPoint[] {
  const durationSeconds = (bars * 4 * 60) / Math.max(1, bpm);

  // build: the notes do the fade — hold the level flat at unity.
  if (gesture === 'build') {
    return [
      { time: 0, db: 0 },
      { time: Math.round(durationSeconds * 1000) / 1000, db: 0 },
    ];
  }

  // volume: one half of the equal-power crossfade curve.
  const s = Math.min(0.98, Math.max(0.02, sliderPos));
  const round = (n: number): number => Math.round(n * 1000) / 1000;
  const points: VolumeAutomationPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = i / steps; // normalized time 0..1
    const time = round(x * durationSeconds);
    // Piecewise-linear angle so the equal-power midpoint (π/4) lands at x = s.
    const theta = x <= s ? (x / s) * (Math.PI / 4) : Math.PI / 4 + ((x - s) / (1 - s)) * (Math.PI / 4);
    // fade-out follows cos (unity→floor); fade-in follows sin (floor→unity).
    const gain = direction === 'out' ? Math.cos(theta) : Math.sin(theta);
    points.push({ time, db: Math.round(gainToDb(gain) * 100) / 100 });
  }
  return points;
}

/**
 * Roles whose fades default to a `volume` (level) ramp — sustained/textural
 * material that enters/leaves by level in real productions. Everything else
 * defaults to `build` (the notes carry the fade).
 *
 * This is a UI default heuristic over role tokens, NOT the canonical role list
 * (that lives in the app's instrument-classification + `host.getValidRoles()`).
 * There is no textural↔articulated axis in the taxonomy, so this small curated
 * subset lives next to its consumer (the fade modal/panels).
 *
 * @since SDK 2.28.0
 */
export const TEXTURAL_ROLES: ReadonlySet<string> = new Set<string>([
  'pads',
  'pad',
  'strings',
  'atmospheres',
  'atmosphere',
  'atmos',
  'drones',
  'drone',
  'soundscapes',
  'soundscape',
]);

/** Pick the default fade gesture for a track's role (textural → volume, else build). */
export function defaultFadeGesture(role: string | null | undefined): FadeGesture {
  if (!role) return 'build';
  const norm = role.toLowerCase().replace(/[\s_-]+/g, ' ').trim();
  if (TEXTURAL_ROLES.has(norm)) return 'volume';
  for (const token of norm.split(' ')) {
    if (TEXTURAL_ROLES.has(token)) return 'volume';
  }
  return 'build';
}
