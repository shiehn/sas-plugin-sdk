/**
 * Track onsets (SDK 3.24.0): the limits and the pure finishing step of
 * `PluginHost.readTrackOnsets`, shared by plugins (feature probe, `maxCount`
 * rule) and the host (raw detector output → the reading a plugin sees), so both
 * halves apply one tested rule set. React-free: also the subpath
 * `@signalsandsorcery/plugin-sdk/track-onsets`.
 */

import type {
  PluginHost,
  ReadTrackOnsetsOptions,
  TrackOnset,
  TrackOnsets,
  TrackOnsetsBusyReason,
} from '../types/plugin-sdk.types';

// The reading types, so the subpath's users (the host's main process) need not load the React-typed root.
export type { ReadTrackOnsetsOptions, TrackOnset, TrackOnsets, TrackOnsetsBusyReason } from '../types/plugin-sdk.types';

export const TRACK_ONSETS_LIMITS = {
  /** `maxCount` when the caller gives none. */
  defaultMaxCount: 512,
  /** The largest `maxCount` a caller may ask for. */
  maxCount: 4096,
} as const;

/**
 * The `details.reason` values of a busy `readTrackOnsets` rejection. Each
 * comes with `details.retryable: true`: `TRANSPORT_PLAYING` means retry once
 * the transport stops; `TRANSITION_RENDER_IN_PROGRESS` means retry once the
 * other render finishes.
 */
export const TRACK_ONSETS_BUSY_REASONS = [
  'TRANSPORT_PLAYING',
  'TRANSITION_RENDER_IN_PROGRESS',
] as const satisfies readonly TrackOnsetsBusyReason[];

// Compile-time: the list names every reason.
type MissingBusyReason = Exclude<TrackOnsetsBusyReason, (typeof TRACK_ONSETS_BUSY_REASONS)[number]>;
const everyBusyReasonListed: MissingBusyReason extends never ? true : never = true;
void everyBusyReasonListed;

/** Onsets closer than this (seconds) are one hit; the stronger one stays. */
const SAME_HIT_SEC = 0.001;

/** The host lists the active scene's sample and audio tracks (`listSceneAudioTracks`, SDK 3.24.0). */
export function hasSceneAudioTracks(
  host: Partial<Pick<PluginHost, 'listSceneAudioTracks'>> | null | undefined,
): host is Required<Pick<PluginHost, 'listSceneAudioTracks'>> {
  return !!host && typeof host.listSceneAudioTracks === 'function';
}

export function hasTrackOnsets(
  host: Partial<Pick<PluginHost, 'readTrackOnsets'>> | null | undefined,
): host is Required<Pick<PluginHost, 'readTrackOnsets'>> {
  return !!host && typeof host.readTrackOnsets === 'function';
}

/**
 * The `maxCount` a reading uses: the default when absent, `null` when the
 * value is not an integer from 1 to `TRACK_ONSETS_LIMITS.maxCount` (the host
 * rejects that call with `VALIDATION_ERROR`).
 */
export function resolveTrackOnsetsMaxCount(opts?: ReadTrackOnsetsOptions | null): number | null {
  const n = opts?.maxCount;
  if (n === undefined) return TRACK_ONSETS_LIMITS.defaultMaxCount;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > TRACK_ONSETS_LIMITS.maxCount) return null;
  return n;
}

/** What an onset detector gives the host, before `finishTrackOnsets`. */
export interface RawTrackOnsets {
  /** Onset times in seconds from the scene's first downbeat, any order. */
  times: readonly number[];
  /**
   * Parallel to `times`: any non-negative measure of each hit's size (flux
   * peak, peak level). Absent, or a missing entry, counts as equal strength.
   */
  strengths?: readonly number[];
  sampleRate: number;
  durationSec: number;
  bpm: number;
}

const round = (v: number, places: number) => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};

/**
 * Turn a detector's output into the reading `readTrackOnsets` resolves:
 * drops times that are not finite or fall outside `[0, durationSec)`, merges
 * hits closer than 1 ms (the stronger stays), scales strengths so the loudest
 * is 1 (all 1 when none is above 0), keeps the strongest `maxCount` (earlier
 * wins a tie), and sorts by time. Rounds `timeSec` and `strength` to 3
 * places, `beat` to 4. Throws a `RangeError` on a bad `sampleRate`,
 * `durationSec`, `bpm` or `maxCount`: those are host bugs, not plugin input.
 */
export function finishTrackOnsets(raw: RawTrackOnsets, opts?: ReadTrackOnsetsOptions | null): TrackOnsets {
  const { sampleRate, durationSec, bpm } = raw;
  if (!(Number.isFinite(sampleRate) && sampleRate > 0)) throw new RangeError(`bad sampleRate ${sampleRate}`);
  if (!(Number.isFinite(durationSec) && durationSec >= 0)) throw new RangeError(`bad durationSec ${durationSec}`);
  if (!(Number.isFinite(bpm) && bpm > 0)) throw new RangeError(`bad bpm ${bpm}`);
  const maxCount = resolveTrackOnsetsMaxCount(opts);
  if (maxCount === null) throw new RangeError(`bad maxCount ${String(opts?.maxCount)}`);

  const hits: Array<{ t: number; s: number }> = [];
  raw.times.forEach((t, i) => {
    if (!Number.isFinite(t) || t < 0 || t >= durationSec) return;
    const s = raw.strengths?.[i];
    hits.push({ t, s: s === undefined ? 1 : Number.isFinite(s) && s > 0 ? s : 0 });
  });
  hits.sort((a, b) => a.t - b.t);

  const merged: typeof hits = [];
  for (const h of hits) {
    const last = merged[merged.length - 1];
    if (last && h.t - last.t < SAME_HIT_SEC) {
      if (h.s > last.s) last.s = h.s;
    } else {
      merged.push({ ...h });
    }
  }

  let kept = merged;
  const truncated = merged.length > maxCount;
  if (truncated) {
    kept = merged
      .map((h, i) => ({ h, i }))
      .sort((a, b) => b.h.s - a.h.s || a.i - b.i)
      .slice(0, maxCount)
      .sort((a, b) => a.i - b.i)
      .map(({ h }) => h);
  }

  const loudest = kept.reduce((m, h) => Math.max(m, h.s), 0);
  const onsets: TrackOnset[] = kept.map((h) => ({
    timeSec: round(h.t, 3),
    beat: round((h.t * bpm) / 60, 4),
    strength: loudest > 0 ? round(h.s / loudest, 3) : 1,
  }));

  return { source: 'audio', sampleRate, durationSec, bpm, onsets, truncated };
}
