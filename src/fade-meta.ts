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
  return {
    direction: m.direction,
    gesture: m.gesture,
    sourceTrackDbId: typeof m.sourceTrackDbId === 'string' ? m.sourceTrackDbId : '',
    sourceSceneId: typeof m.sourceSceneId === 'string' ? m.sourceSceneId : '',
    sourceName: typeof m.sourceName === 'string' ? m.sourceName : '',
    soundLabel: typeof m.soundLabel === 'string' ? m.soundLabel : '',
    sliderPos: typeof m.sliderPos === 'number' ? m.sliderPos : 0.5,
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
