/**
 * ensemble-core: voice specifications — the register + complexity hierarchy
 * as DATA. The first live per-voice register map in the platform (the only
 * prior per-role [low,high] table, MusicTheory.getSuggestedRegister, was
 * dead code).
 *
 * The shape encodes the product intent: the TOP voice is the highest-pitched
 * and most complex line; complexity decreases with register; the bottom
 * voice is a sparse anchor (root pitch classes only when `rootOnly`).
 *
 * All thresholds are exported constants in the bass-plugin tradition —
 * tune by ear, not by refactor. Roles are plain strings validated by the
 * host at stamp time (`host.getValidRoles()`); the SDK deliberately ships
 * no role list.
 *
 * @since SDK 2.42.0
 */

export interface EnsembleVoiceSpec {
  /** 0 = top voice; increases downward. */
  voiceIndex: number;
  /** Human label for the track row + prompt ("high florid line"). */
  label: string;
  /** InstrumentType to stamp on the voice's track (drives preset category). */
  role: string;
  /** Playable window (MIDI note numbers, inclusive). Enforced by octave-fold. */
  registerLow: number;
  registerHigh: number;
  /** Density budget — hard cap, enforced by weakest-note thinning. */
  maxNotesPerBar: number;
  /** Prompt text: rhythmic vocabulary for this voice. */
  rhythmPalette: string;
  /** Prompt text: harmonic discipline for this voice. */
  harmonicDiscipline: string;
  /** When true the voice plays ONLY each bar's chord-root pitch class. */
  rootOnly?: boolean;
  /**
   * Equal-onset survivor during the per-voice monophony sweep: top voices
   * keep the highest pitch, bottom voices the lowest (mirrors how ears
   * track outer voices).
   */
  monoPreference: 'high' | 'low';
}

const TOP: Omit<EnsembleVoiceSpec, 'voiceIndex'> = {
  label: 'high florid line',
  role: 'lead',
  registerLow: 72,
  registerHigh: 96,
  maxNotesPerBar: 8,
  rhythmPalette: '8ths and 16ths; melisma and short runs welcome',
  harmonicDiscipline:
    'freest voice — non-chord tones as passing/neighbor tones on weak beats, resolving by step',
  monoPreference: 'high',
};

const COUNTER: Omit<EnsembleVoiceSpec, 'voiceIndex'> = {
  label: 'countermelody',
  role: 'strings',
  registerLow: 65,
  registerHigh: 86,
  maxNotesPerBar: 6,
  rhythmPalette: '8ths and quarters; move when the top voice rests',
  harmonicDiscipline: 'mostly chord tones; may imitate the top voice\'s motifs a bar later',
  monoPreference: 'high',
};

const INNER: Omit<EnsembleVoiceSpec, 'voiceIndex'> = {
  label: 'inner voice',
  role: 'strings',
  registerLow: 55,
  registerHigh: 76,
  maxNotesPerBar: 4,
  rhythmPalette: 'quarters and halves',
  harmonicDiscipline: 'chord tones with smooth stepwise motion between them',
  monoPreference: 'high',
};

const INNER_2: Omit<EnsembleVoiceSpec, 'voiceIndex'> = {
  label: 'second inner voice',
  role: 'strings',
  registerLow: 60,
  registerHigh: 81,
  maxNotesPerBar: 5,
  rhythmPalette: 'quarters with occasional 8th-note motion',
  harmonicDiscipline: 'chord tones; fill gaps the other inner voice leaves',
  monoPreference: 'high',
};

const TENOR: Omit<EnsembleVoiceSpec, 'voiceIndex'> = {
  label: 'low counterline',
  role: 'strings',
  registerLow: 43,
  registerHigh: 64,
  maxNotesPerBar: 3,
  rhythmPalette: 'quarters and halves; brief walking figures at cadences',
  harmonicDiscipline: 'roots and fifths emphasized; passing tones only between chord tones',
  monoPreference: 'low',
};

const BASS: Omit<EnsembleVoiceSpec, 'voiceIndex'> = {
  label: 'bassline',
  role: 'bass',
  registerLow: 36,
  registerHigh: 60,
  maxNotesPerBar: 3,
  rhythmPalette: 'quarters and halves',
  harmonicDiscipline: 'chord roots and fifths; stepwise approaches into chord changes',
  monoPreference: 'low',
};

const SUB: Omit<EnsembleVoiceSpec, 'voiceIndex'> = {
  label: 'sub anchor',
  role: '808s',
  registerLow: 24,
  registerHigh: 43,
  maxNotesPerBar: 2,
  rhythmPalette: 'halves and whole notes; sustain into the bar',
  harmonicDiscipline: 'ROOT pitch class only — the harmonic anchor',
  rootOnly: true,
  monoPreference: 'low',
};

/** Supported ensemble sizes. */
export const ENSEMBLE_MIN_VOICES = 2;
export const ENSEMBLE_MAX_VOICES = 6;

const SPEC_TABLES: Record<number, Array<Omit<EnsembleVoiceSpec, 'voiceIndex'>>> = {
  2: [TOP, BASS],
  3: [TOP, INNER, BASS],
  4: [TOP, COUNTER, TENOR, BASS],
  5: [TOP, COUNTER, INNER, TENOR, SUB],
  6: [TOP, COUNTER, INNER_2, INNER, TENOR, SUB],
};

/**
 * Default voice specs for an N-voice ensemble, top voice first. Clamps N to
 * the supported range. Returned objects are fresh copies — callers may
 * override fields (e.g. style packs narrowing registers) without touching
 * the tables.
 */
export function defaultVoiceSpecs(voiceCount: number): EnsembleVoiceSpec[] {
  const n = Math.max(ENSEMBLE_MIN_VOICES, Math.min(ENSEMBLE_MAX_VOICES, Math.round(voiceCount)));
  return SPEC_TABLES[n].map((spec, voiceIndex) => ({ ...spec, voiceIndex }));
}
