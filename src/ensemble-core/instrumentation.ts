/**
 * ensemble-core: the INSTRUMENTATION axis — which family of ensemble the
 * voices model. The parent selection gates the style list (a funk horn
 * section has no 'chorale'; a string ensemble has no 'stabs') and picks the
 * voice-spec table (registers, roles, rhythm palettes — see voice-spec.ts).
 *
 * Sound coupling stays category-level ONLY: specs stamp the generally
 * correct role ('strings' / 'brass' / 'winds') and registers use REAL
 * instrument ranges — users routinely swap the placeholder Surge XT patch
 * for a sampled library (Kontakt, Omnisphere), so the written MIDI must sit
 * where real sections play, not where any particular synth patch flatters.
 *
 * @since SDK 2.39.0
 */

import type { EnsembleStyle } from './styles';

export type EnsembleInstrumentation = 'strings' | 'horns' | 'winds';

export const ENSEMBLE_INSTRUMENTATIONS: readonly EnsembleInstrumentation[] = [
  'strings',
  'horns',
  'winds',
];

/**
 * Styles selectable under each parent instrumentation. Strings and winds
 * share the WOVEN trio (independent/held-line writing); horns get the
 * SECTION trio (rhythmic-unison funk writing) — the two families obey
 * opposite coordination rules (see ensemble-prompt.ts).
 */
export const STYLES_FOR_INSTRUMENTATION: Record<EnsembleInstrumentation, readonly EnsembleStyle[]> = {
  strings: ['counterpoint', 'chorale', 'interlock'],
  horns: ['stabs', 'riffs', 'unison'],
  winds: ['counterpoint', 'chorale', 'interlock'],
};

export const DEFAULT_STYLE_FOR_INSTRUMENTATION: Record<EnsembleInstrumentation, EnsembleStyle> = {
  strings: 'counterpoint',
  horns: 'stabs',
  winds: 'chorale',
};

/** Clamp an arbitrary stored/hinted value into the closed instrumentation domain. */
export function normalizeInstrumentation(raw: unknown): EnsembleInstrumentation {
  return (ENSEMBLE_INSTRUMENTATIONS as readonly string[]).includes(raw as string)
    ? (raw as EnsembleInstrumentation)
    : 'strings';
}

/**
 * Clamp a stored/hinted style into the instrumentation's own list — a group
 * switched from Strings to Horns with 'counterpoint' still stored lands on
 * the horn default instead of a style the mode can't honor.
 */
export function styleForInstrumentation(
  instrumentation: EnsembleInstrumentation,
  rawStyle: string | undefined | null
): EnsembleStyle {
  const allowed = STYLES_FOR_INSTRUMENTATION[instrumentation];
  return (allowed as readonly string[]).includes(rawStyle ?? '')
    ? (rawStyle as EnsembleStyle)
    : DEFAULT_STYLE_FOR_INSTRUMENTATION[instrumentation];
}
