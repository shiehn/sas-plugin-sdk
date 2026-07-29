/**
 * panel-core meter-prompt — per-meter-family musical guidance for plugin LLM
 * prompts (the plugin-side counterpart of the app's meter-idioms; P8a of the
 * multi-time-signature program).
 *
 * Plugins keep their existing 4/4 prompts BYTE-IDENTICAL and only APPEND
 * these blocks when the scene meter is not 4/4 — which is why '4/4' (and
 * anything unparseable, which panels degrade to 4/4) returns EMPTY STRINGS:
 * `if (guidance.rhythm) prompt += ...` is the whole integration contract.
 *
 * Family guidance mirrors the app's `meter-idioms.ts` drafts, condensed to
 * generic (role-agnostic) prose any generator prompt can carry:
 *   - 2/4 march (beat 2 = the march backbeat)
 *   - 3/4 waltz — NO beats-2-and-4 backbeat, never 4-on-the-floor
 *   - 5/4, 6/4, 7/4 odd — anchor the group starts; grouping stated explicitly
 *   - 6/8 compound duple — backbeat analogue on the SECOND pulse; flow in threes
 *   - 9/8 compound triple — three dotted-quarter pulses
 *   - 12/8 shuffle — four pulses that feel like a swung 4/4
 *   - 5/8, 7/8 asymmetric — group-start anchoring, keep the asymmetry
 *
 * Pure string building, no I/O.
 *
 * @since SDK 2.50.0
 */

import {
  beatGrouping,
  meterFamily,
  strongSlots,
  tryParseTimeSignature,
  type ParsedTimeSignature,
} from '../utils/time-signature';

export interface PluginMeterGuidance {
  /**
   * The meter family's core rhythmic idiom — what to anchor, what NOT to
   * write (e.g. "no beats-2-and-4 backbeat in 3/4"). Empty for 4/4.
   */
  rhythm: string;
  /**
   * Explicit grouping + strong-beat statement ("grouped 2+2+3; group starts
   * on slots 1, 3 and 5 — 0, 1 and 2 qn into the bar"). Empty for 4/4.
   */
  grouping: string;
  /**
   * Bar arithmetic in quarter notes — the startBeat math the note schema
   * needs ("each bar spans 3.5 quarter notes; one slot = one eighth note =
   * 0.5 qn; bar N covers startBeat 3.5×(N−1) to 3.5×N"). Empty for 4/4.
   */
  barArithmetic: string;
}

const EMPTY_GUIDANCE: PluginMeterGuidance = Object.freeze({
  rhythm: '',
  grouping: '',
  barArithmetic: '',
});

/** Integers clean, halves as ".5" (7/8 bars are 3.5 qn — dyadic, exact). */
function fmtQn(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** "1, 3 and 5" — prose list. */
function joinAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Slot-unit noun for a denominator ("eighth note" for /8). */
function slotUnitName(den: number): string {
  switch (den) {
    case 2: return 'half note';
    case 8: return 'eighth note';
    case 16: return 'sixteenth note';
    default: return 'quarter note';
  }
}

/**
 * Per-family musical guidance for a plugin's LLM generation prompt.
 *
 * `'4/4'` — and any unparseable input, which panels already degrade to 4/4 —
 * returns EMPTY STRINGS so existing 4/4 prompts stay byte-identical; append
 * the fields only when non-empty. All beat/slot numbers are 1-based; qn
 * offsets are quarter notes from the bar start (matching `startBeat`).
 */
export function buildPluginMeterGuidance(ts: string): PluginMeterGuidance {
  const p: ParsedTimeSignature | null = tryParseTimeSignature(ts);
  if (!p || ts === '4/4') return EMPTY_GUIDANCE;

  const family = meterFamily(ts);
  const groups = beatGrouping(ts);
  const strong = strongSlots(ts).map((s) => s + 1); // 1-based
  const groupsText = groups.join('+');
  const strongText = joinAnd(strong.map((s) => String(s)));
  const qnOffsets = joinAnd(strong.map((s) => fmtQn((s - 1) * p.qnPerSlot)));
  const lastStrong = strong[strong.length - 1];
  const lastStrongQn = fmtQn((lastStrong - 1) * p.qnPerSlot);
  const secondPulse = strong.length > 1 ? strong[1] : 1;
  const secondPulseQn = fmtQn((secondPulse - 1) * p.qnPerSlot);
  const unit = slotUnitName(p.den);
  const qnPerBar = fmtQn(p.quarterNotesPerBar);

  const barArithmetic =
    p.den === 4
      ? `Each bar of ${ts} spans ${qnPerBar} quarter notes (NOT 4) — bar N (1-based) covers startBeat ${qnPerBar}×(N−1) up to ${qnPerBar}×N.`
      : `Each bar of ${ts} spans ${qnPerBar} quarter notes (NOT 4); one slot = one ${unit} = ${fmtQn(p.qnPerSlot)} qn. Bar N (1-based) covers startBeat ${qnPerBar}×(N−1) up to ${qnPerBar}×N.`;

  const grouping =
    p.den === 4
      ? `The ${p.num} beats of ${ts} are grouped ${groupsText}; the strong beats (group starts) are ${strongText}.`
      : `The ${p.num} ${unit} slots of ${ts} are grouped ${groupsText}; the pulse/group starts are slots ${strongText} (${qnOffsets} qn into the bar).`;

  switch (family) {
    case 'simple-duple':
      return {
        rhythm: `${ts} is march time: TWO ${unit} beats per bar. Beat 1 is the anchor, beat 2 the march backbeat. Never write patterns that assume beats 3 and 4 — the bar ends after beat 2.`,
        grouping,
        barArithmetic,
      };

    case 'simple-triple':
      return {
        rhythm: `${ts} is waltz time: THREE ${unit} beats per bar with beat 1 as the ONLY strong beat (the "oom"); beats 2 and 3 are light afterbeats ("pah-pah"). There is NO beats-2-and-4 backbeat in ${ts} — never place one — and never write 4-on-the-floor: the bar has only 3 beats.`,
        grouping,
        barArithmetic,
      };

    case 'simple-quadruple':
      return {
        rhythm: `${ts} is simple quadruple: four ${unit} beats per bar with the familiar shape — strong beats 1 and 3, backbeat on 2 and 4 — but each beat is a ${unit} (${fmtQn(p.qnPerSlot)} qn), so scale all rhythms accordingly.`,
        grouping,
        barArithmetic,
      };

    case 'simple-odd':
      return {
        rhythm: `${ts} is an odd meter grouped ${groupsText}: anchor the group-start beats (${strongText}) and keep the ${groupsText} shape audible — do NOT flatten it into an even four-beat feel. The final group start (beat ${lastStrong}) is the meter's backbeat analogue.`,
        grouping,
        barArithmetic,
      };

    case 'compound-duple':
      return {
        rhythm: `${ts} is compound duple: ${p.num} ${unit} slots per bar in TWO dotted pulses, not four beats. The downbeat is slot 1 (0 qn); the backbeat analogue is the SECOND pulse (slot ${secondPulse}, ${secondPulseQn} qn into the bar) — NOT beats 2 and 4. Let subdivisions flow in threes (each slot = ${fmtQn(p.qnPerSlot)} qn).`,
        grouping,
        barArithmetic,
      };

    case 'compound-triple':
      return {
        rhythm: `${ts} is compound triple: ${p.num} ${unit} slots per bar in THREE dotted pulses (slots ${strongText}). Accent the pulse starts and let subdivisions flow in threes — do NOT impose a beats-2-and-4 backbeat; this bar has three pulses.`,
        grouping,
        barArithmetic,
      };

    case 'compound-quadruple':
      return {
        rhythm: `${ts} is a shuffle: ${p.num} ${unit} slots per bar in FOUR dotted pulses (slots ${strongText}) that feel like a swung 4/4. Pulses 1 and 3 (slots ${strong[0]} and ${strong[2]}) are the strong-side anchors; pulses 2 and 4 (slots ${strong[1]} and ${strong[3]}) carry the backbeat analogue. Keep the triplet flow — subdivisions in threes.`,
        grouping,
        barArithmetic,
      };

    case 'asymmetric':
    default:
      return {
        rhythm: `${ts} is asymmetric, grouped ${groupsText}: anchor the group-start slots (${strongText}; ${qnOffsets} qn into the bar) and keep the uneven groups audible — do NOT even them out. The final group start (slot ${lastStrong}, ${lastStrongQn} qn) is the meter's backbeat analogue.`,
        grouping,
        barArithmetic,
      };
  }
}

/**
 * Convenience renderer: the three guidance fields as prompt-ready lines
 * (empty string for 4/4, so callers can unconditionally append).
 * Prefixed by a heading naming the meter.
 */
export function formatPluginMeterGuidance(ts: string): string {
  const g = buildPluginMeterGuidance(ts);
  if (!g.rhythm) return '';
  return [
    `Time signature ${ts} — meter rules:`,
    `- ${g.rhythm}`,
    `- ${g.grouping}`,
    `- ${g.barArithmetic}`,
  ].join('\n');
}
