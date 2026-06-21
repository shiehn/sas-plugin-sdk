/**
 * Crossfade-pair metadata — family-agnostic types + parsing shared by every
 * generator panel that supports transition crossfades (synth / drum / instrument).
 *
 * A crossfade pair is two normal tracks linked by a shared `groupId`, persisted
 * in scene plugin_data under `track:<dbId>:crossfade`. Both members play the
 * same MIDI; one wears the origin preset, the other the target preset. The panel
 * owns the family-specific create flow (how a preset/sample is copied) and the
 * render; this module owns only the shape + the scene-data → pairs parse so the
 * logic can't drift across the three panels.
 *
 * @since SDK 2.23.0
 */

/** Which half of the pair a per-layer control / member targets. */
export type CrossfadeSlot = 'origin' | 'target';

/**
 * Equal-power center gain (~-3 dB, 1/√2) applied to BOTH crossfade layers so a
 * centered, non-functional slider already sounds like a midpoint blend. The
 * per-layer volume sliders start here; a later phase's fader drives them.
 */
export const EQUAL_POWER_GAIN = 0.707;

/**
 * Per-member crossfade metadata (one scene-data value per member track). The two
 * members (origin/target) of a pair share a `groupId`.
 */
export interface CrossfadeMeta {
  groupId: string;
  slot: CrossfadeSlot;
  /** DB id of the partner member track. */
  partnerDbId: string;
  /** DB id of the SOURCE track this layer's preset/sample was copied from. */
  sourceTrackDbId: string;
  /** DB id of the scene the source track lives in (the from/to scene). */
  sourceSceneId: string;
  /** Source track display name (shown in the caption). */
  sourceName: string;
  /** Copied preset/sample label (shown in the caption). */
  soundLabel: string;
  /** Crossfade position 0..1 (kept identical on both members). */
  sliderPos: number;
}

/** A complete crossfade pair (both members present), keyed by groupId. */
export interface CrossfadePairMeta {
  groupId: string;
  sliderPos: number;
  originDbId: string;
  targetDbId: string;
  /** DB id of the ORIGIN source track (in the from scene) — drives the "used once" exclusion. */
  originSourceDbId: string;
  /** DB id of the TARGET source track (in the to scene). */
  targetSourceDbId: string;
  originSourceName: string;
  originSoundLabel: string;
  targetSourceName: string;
  targetSoundLabel: string;
}

/** Narrow an unknown scene-data value to CrossfadeMeta (defensive — survives partial blobs). */
export function asCrossfadeMeta(val: unknown): CrossfadeMeta | null {
  if (!val || typeof val !== 'object') return null;
  const m = val as Partial<CrossfadeMeta>;
  if (typeof m.groupId !== 'string' || (m.slot !== 'origin' && m.slot !== 'target')) return null;
  if (typeof m.partnerDbId !== 'string') return null;
  return {
    groupId: m.groupId,
    slot: m.slot,
    partnerDbId: m.partnerDbId,
    sourceTrackDbId: typeof m.sourceTrackDbId === 'string' ? m.sourceTrackDbId : '',
    sourceSceneId: typeof m.sourceSceneId === 'string' ? m.sourceSceneId : '',
    sourceName: typeof m.sourceName === 'string' ? m.sourceName : '',
    soundLabel: typeof m.soundLabel === 'string' ? m.soundLabel : '',
    sliderPos: typeof m.sliderPos === 'number' ? m.sliderPos : 0.5,
  };
}

/**
 * Scan all `track:<dbId>:crossfade` keys in a scene's plugin_data and assemble
 * COMPLETE pairs (both origin + target present). A half-broken group (partner
 * deleted underneath) is omitted, so its surviving member falls back to a normal
 * row instead of vanishing.
 */
export function parseCrossfadePairs(sceneData: Record<string, unknown>): CrossfadePairMeta[] {
  const groups = new Map<
    string,
    { origin?: { dbId: string; meta: CrossfadeMeta }; target?: { dbId: string; meta: CrossfadeMeta } }
  >();
  for (const [key, val] of Object.entries(sceneData)) {
    const match = /^track:(.+):crossfade$/.exec(key);
    if (!match) continue;
    const meta = asCrossfadeMeta(val);
    if (!meta) continue;
    const dbId = match[1];
    const g = groups.get(meta.groupId) ?? {};
    if (meta.slot === 'origin') g.origin = { dbId, meta };
    else g.target = { dbId, meta };
    groups.set(meta.groupId, g);
  }
  const pairs: CrossfadePairMeta[] = [];
  for (const [groupId, g] of groups) {
    if (!g.origin || !g.target) continue;
    pairs.push({
      groupId,
      sliderPos: g.origin.meta.sliderPos,
      originDbId: g.origin.dbId,
      targetDbId: g.target.dbId,
      originSourceDbId: g.origin.meta.sourceTrackDbId,
      targetSourceDbId: g.target.meta.sourceTrackDbId,
      originSourceName: g.origin.meta.sourceName,
      originSoundLabel: g.origin.meta.soundLabel,
      targetSourceName: g.target.meta.sourceName,
      targetSoundLabel: g.target.meta.soundLabel,
    });
  }
  return pairs;
}

// ============================================================================
// Crossfade volume automation (Phase 3 — the functional fader)
// ============================================================================

/** One volume-automation point: a dB value at a time offset (seconds from clip start). */
export interface VolumeAutomationPoint {
  time: number; // seconds
  db: number; // gain in dB (-80 ≈ silent, 0 = unity)
}

/** Origin + target volume curves for one crossfade pair. */
export interface CrossfadeVolumeCurves {
  origin: VolumeAutomationPoint[];
  target: VolumeAutomationPoint[];
}

const FADE_FLOOR_DB = -80;

function gainToDb(gain: number): number {
  return gain <= 1e-4 ? FADE_FLOOR_DB : Math.max(FADE_FLOOR_DB, 20 * Math.log10(gain));
}

/**
 * Equal-power crossfade volume curves over a transition of `bars` at `bpm`.
 * The ORIGIN layer fades OUT and the TARGET fades IN; `sliderPos` (0..1) sets
 * WHERE in time the equal-power (-3 dB) crossover sits — 0 = hand off near the
 * start, 1 = hold the origin until near the end. Points span the clip window
 * [0, durationSeconds] so the engine re-reads them each loop (re-fade per loop).
 * `steps`+1 points with linear interpolation approximate the cos/sin curve.
 *
 * Returns dB point arrays for `host.setTrackVolumeAutomation` — origin on the top
 * layer, target on the bottom. @since SDK 2.25.0
 */
export function buildCrossfadeVolumeCurves(
  bars: number,
  bpm: number,
  sliderPos: number,
  steps = 32,
): CrossfadeVolumeCurves {
  const durationSeconds = (bars * 4 * 60) / Math.max(1, bpm);
  // Keep the crossover off the exact ends so there's always an actual fade.
  const s = Math.min(0.98, Math.max(0.02, sliderPos));
  const round = (n: number): number => Math.round(n * 1000) / 1000;
  const origin: VolumeAutomationPoint[] = [];
  const target: VolumeAutomationPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = i / steps; // normalized time 0..1
    const time = round(x * durationSeconds);
    // Piecewise-linear angle so the equal-power crossover (π/4) lands at x = s.
    const theta = x <= s ? (x / s) * (Math.PI / 4) : Math.PI / 4 + ((x - s) / (1 - s)) * (Math.PI / 4);
    origin.push({ time, db: Math.round(gainToDb(Math.cos(theta)) * 100) / 100 });
    target.push({ time, db: Math.round(gainToDb(Math.sin(theta)) * 100) / 100 });
  }
  return { origin, target };
}
