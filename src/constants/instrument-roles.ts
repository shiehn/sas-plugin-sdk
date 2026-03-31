/**
 * Valid instrument roles for synth track generation.
 * Used in LLM prompts and preset selection.
 * Canonical source — imported by both plugin SDK and core services.
 */
export const VALID_INSTRUMENT_ROLES: readonly string[] = [
  'bass', 'kick', 'snare', 'hat', '808', 'percussion',
  'lead', 'pad', 'keys', 'piano', 'organ', 'pluck',
  'strings', 'brass', 'winds', 'bell', 'mallet', 'guitar',
  'synth', 'atmosphere', 'drone', 'rhythm', 'soundscape',
  'vocal', 'fx',
] as const;
