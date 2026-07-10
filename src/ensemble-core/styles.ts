/**
 * ensemble-core: style packs. A style = which SOFT rules are violations +
 * a prompt paragraph steering the joint composition. Hard rules (register,
 * per-voice monophony, density caps, root-only anchors) apply to every
 * style — see enforce-voice.ts. Explicitly NOT just baroque: parallels are
 * a defect in `counterpoint` and the whole point of `interlock`.
 *
 * @since SDK 2.42.0
 */

export type EnsembleStyle = 'counterpoint' | 'chorale' | 'interlock';

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
  /** Prompt paragraph injected into the system prompt for this style. */
  promptParagraph: string;
}

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
};
