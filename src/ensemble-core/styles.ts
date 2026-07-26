/**
 * ensemble-core: style packs. A style = which SOFT rules are violations +
 * a prompt paragraph steering the joint composition. Hard rules (register,
 * per-voice monophony, density caps, root-only anchors) apply to every
 * style — see enforce-voice.ts. Explicitly NOT just baroque: parallels are
 * a defect in `counterpoint`, the whole point of `interlock`, and the very
 * mechanism of the horn-section styles (`stabs` / `riffs` / `unison`),
 * which additionally INVERT the coordination rule — togetherness is
 * required, not forbidden (`maxOnsetIndependence`).
 *
 * Which styles are offered under which parent instrumentation lives in
 * instrumentation.ts (STYLES_FOR_INSTRUMENTATION).
 *
 * @since SDK 2.42.0 (horn-section styles @since 2.39.0 — see instrumentation.ts)
 */

export type EnsembleStyle =
  | 'counterpoint'
  | 'chorale'
  | 'interlock'
  | 'stabs'
  | 'riffs'
  | 'unison';

/**
 * The WOVEN (strings/winds) trio. Kept under the historical name because
 * pre-instrumentation stored configs and consumers validate against it;
 * per-mode lists live in instrumentation.ts.
 */
export const ENSEMBLE_STYLES: readonly EnsembleStyle[] = ['counterpoint', 'chorale', 'interlock'];

export interface EnsembleStyleRules {
  /** Consecutive perfect 5ths/octaves between adjacent voices are violations. */
  forbidParallelPerfects: boolean;
  /** A nominally-upper voice sounding below its neighbor is a violation. */
  forbidVoiceCrossing: boolean;
  /**
   * Minimum fraction of an upper voice's onsets that must NOT coincide with
   * its lower neighbor (0 = homorhythm fine, 1 = fully independent).
   */
  minOnsetIndependence: number;
  /**
   * Section styles only: the CEILING on that same fraction — a pair whose
   * upper voice attacks apart from its lower neighbor more than this is a
   * violation (the section must hit together). Absent = no ceiling.
   */
  maxOnsetIndependence?: number;
  /**
   * Mechanical per-note duration ceiling in beats, enforced by
   * enforceVoice (stab styles — a punch must not become a pad). Absent =
   * no cap.
   */
  maxNoteDurationBeats?: number;
  /** Prompt paragraph injected into the system prompt for this style. */
  promptParagraph: string;
}

/**
 * Section-style togetherness ceilings + the stab length, exported in the
 * bass-plugin tradition — tune by ear, not by refactor. Independence is the
 * fraction of an upper voice's onsets its lower neighbor does NOT share:
 * 0.25 tolerates a stray pickup note per phrase, 0.15 demands lockstep.
 */
export const STAB_MAX_ONSET_INDEPENDENCE = 0.25;
export const RIFF_MAX_ONSET_INDEPENDENCE = 0.3;
export const UNISON_MAX_ONSET_INDEPENDENCE = 0.15;
/** A stab longer than a quarter note is a pad — mechanically trimmed. */
export const STAB_MAX_NOTE_DURATION_BEATS = 1;

export const STYLE_RULES: Record<EnsembleStyle, EnsembleStyleRules> = {
  counterpoint: {
    forbidParallelPerfects: true,
    forbidVoiceCrossing: true,
    minOnsetIndependence: 0.35,
    promptParagraph:
      'STYLE — COUNTERPOINT (modern, not strict species): independent singable lines. '
      + 'Favor contrary and oblique motion between neighbors; approach perfect intervals '
      + 'by contrary motion; imitate motifs between voices a bar apart; stagger entrances '
      + 'so voices converse instead of speaking at once.',
  },
  chorale: {
    forbidParallelPerfects: true,
    forbidVoiceCrossing: true,
    minOnsetIndependence: 0,
    promptParagraph:
      'STYLE — CHORALE: homorhythmic block harmony. Voices move together on the same '
      + 'rhythm with smooth voice-leading — nearest chord tone, common tones held, '
      + 'no leaps larger than a fifth in inner voices.',
  },
  interlock: {
    forbidParallelPerfects: false,
    forbidVoiceCrossing: false,
    minOnsetIndependence: 0.6,
    promptParagraph:
      'STYLE — INTERLOCK (minimal / systems music): short repeating cells that mesh like '
      + 'gears. Each voice keeps its own ostinato; onsets rarely coincide with the '
      + 'neighboring voice; parallel motion and doubling are welcome when the composite '
      + 'rhythm stays busy and even.',
  },
  stabs: {
    forbidParallelPerfects: false,
    forbidVoiceCrossing: true,
    minOnsetIndependence: 0,
    maxOnsetIndependence: STAB_MAX_ONSET_INDEPENDENCE,
    maxNoteDurationBeats: STAB_MAX_NOTE_DURATION_BEATS,
    promptParagraph:
      'STYLE — STABS (James Brown funk-45 horn punches): short accented chord hits — '
      + 'single punches and two-to-four-note kicks — placed on the groove\'s pressure '
      + 'points: the one, off-beat "ands", and the pickup into the next bar. Every hit is '
      + 'staccato (a 16th to an 8th long) and voiced as ONE tight chord under the lead. '
      + 'Leave REAL space between hits — the section punctuates the groove, it never '
      + 'carpets it.',
  },
  riffs: {
    forbidParallelPerfects: false,
    forbidVoiceCrossing: true,
    minOnsetIndependence: 0,
    maxOnsetIndependence: RIFF_MAX_ONSET_INDEPENDENCE,
    promptParagraph:
      'STYLE — RIFFS (funk/soul section soli): ONE syncopated 8th/16th riff, one or two '
      + 'bars long, repeated with small variations for the whole clip — the entire '
      + 'section plays it together, harmonized in tight close voicings under the lead. '
      + 'Anticipate downbeats (attack the "and" just before the barline), leave air at '
      + 'phrase ends, and let the final hit of a phrase ring a little longer.',
  },
  unison: {
    forbidParallelPerfects: false,
    forbidVoiceCrossing: false,
    minOnsetIndependence: 0,
    maxOnsetIndependence: UNISON_MAX_ONSET_INDEPENDENCE,
    promptParagraph:
      'STYLE — UNISON (the Cold Sweat power line): every voice doubles the SAME riff in '
      + 'octaves — no harmony, one line, maximum punch. Keep it syncopated and '
      + 'riff-based with space between phrases; octave doubling and parallel motion are '
      + 'the entire point.',
  },
};
