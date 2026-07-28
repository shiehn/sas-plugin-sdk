/**
 * panel-core meter helpers — the ONE place panels convert a scene's
 * `MusicalContext` (bars + bpm + timeSignature) into clip-window numbers.
 *
 * Panels write MIDI clips whose container spans the scene loop
 * (`startTime: 0 → endTime: seconds`) with notes in QUARTER-NOTE beats.
 * Both conversions depend on the meter: a 4-bar 6/8 scene is 12 quarter
 * notes, not 16. `mc.timeSignature` is defensively gated through
 * `tryParseTimeSignature` — a host handing back a malformed value degrades
 * to '4/4' (today's behavior) instead of throwing mid-generation.
 *
 * @since SDK 2.50.0
 */

import type { MusicalContext } from '../types/plugin-sdk.types';
import {
  DEFAULT_TIME_SIGNATURE,
  barsToQn,
  barsToSeconds,
  tryParseTimeSignature,
} from '../utils/time-signature';

/** The slice of MusicalContext the meter math needs (timeSignature optional for hand-built inputs). */
export type PanelMeterContext = Pick<MusicalContext, 'bars' | 'bpm'> & {
  timeSignature?: string;
};

/** The context's meter, gated to parse-legal — anything else degrades to '4/4'. */
export function panelMeter(mc: { timeSignature?: string }): string {
  return mc.timeSignature && tryParseTimeSignature(mc.timeSignature)
    ? mc.timeSignature
    : DEFAULT_TIME_SIGNATURE;
}

/**
 * Seconds spanned by the scene loop — the MIDI clip container's `endTime`.
 * 4/4 reproduces the legacy `(bars * 4 * 60) / bpm` exactly.
 */
export function panelClipEndSeconds(mc: PanelMeterContext): number {
  return barsToSeconds(mc.bars, mc.bpm, panelMeter(mc));
}

/**
 * Quarter notes spanned by the scene loop — the clamp ceiling for note
 * `startBeat`/`durationBeats`. 4/4 reproduces the legacy `bars * 4` exactly
 * (fractional for odd /8 meters, e.g. 2 bars of 7/8 → 7).
 */
export function panelMaxBeats(mc: PanelMeterContext): number {
  return barsToQn(mc.bars, panelMeter(mc));
}
