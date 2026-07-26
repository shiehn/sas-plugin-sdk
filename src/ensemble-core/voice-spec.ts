/**
 * ensemble-core: voice specifications — the register + complexity hierarchy
 * as DATA, one table set per INSTRUMENTATION (see instrumentation.ts). The
 * first live per-voice register map in the platform (the only prior
 * per-role [low,high] table, MusicTheory.getSuggestedRegister, was dead
 * code).
 *
 * The WOVEN families (strings, winds) encode the original product intent:
 * the TOP voice is the highest-pitched and most complex line; complexity
 * decreases with register; the bottom voice is a sparse anchor. The
 * SECTION family (horns) deliberately breaks that pyramid: every player
 * shares the lead's rhythm, so caps are EQUAL and generous — density
 * thinning is a runaway guard there, never a shaping tool (unequal caps
 * would punch holes in unison hits).
 *
 * Horn/wind registers are REAL instrument ranges in concert pitch
 * (comfortable working tessitura, not extremes) — the Surge XT patch is a
 * placeholder and users re-target sampled libraries, so the MIDI must sit
 * where actual sections play.
 *
 * All thresholds are exported constants in the bass-plugin tradition —
 * tune by ear, not by refactor. Roles are plain strings validated by the
 * host at stamp time (`host.getValidRoles()`); the SDK deliberately ships
 * no role list.
 *
 * @since SDK 2.42.0 (horns/winds tables @since 2.39.0)
 */

import type { EnsembleInstrumentation } from './instrumentation';

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

// ── HORNS — the funk/soul section (all 'brass', concert pitch) ───────────────
//
// Every horn shares the lead's rhythm palette and an EQUAL density cap: the
// section speaks as one instrument, so per-voice complexity shaping would
// fight the style instead of serving it.

/** Equal per-voice cap for horn tables — a runaway guard, not a shaper. */
export const HORN_MAX_NOTES_PER_BAR = 12;

const HORN_FOLLOW_PALETTE =
  'EXACTLY the lead voice\'s rhythm — every attack lands together with voice 1';

const HORN_LEAD: Omit<EnsembleVoiceSpec, 'voiceIndex'> = {
  label: 'lead trumpet',
  role: 'brass',
  registerLow: 60, // C4
  registerHigh: 84, // C6
  maxNotesPerBar: HORN_MAX_NOTES_PER_BAR,
  rhythmPalette:
    'tight funk syncopation — 8ths and 16ths, staccato punches, off-beat anticipations',
  harmonicDiscipline:
    'the section\'s melodic top — chord tones on every hit; quick chromatic approach tones only on pickups',
  monoPreference: 'high',
};

const HORN_TRUMPET_2: Omit<EnsembleVoiceSpec, 'voiceIndex'> = {
  label: 'second trumpet',
  role: 'brass',
  registerLow: 55, // G3
  registerHigh: 79, // G5
  maxNotesPerBar: HORN_MAX_NOTES_PER_BAR,
  rhythmPalette: HORN_FOLLOW_PALETTE,
  harmonicDiscipline: 'nearest chord tone directly below voice 1 — tight close voicing',
  monoPreference: 'high',
};

const HORN_ALTO: Omit<EnsembleVoiceSpec, 'voiceIndex'> = {
  label: 'alto sax',
  role: 'brass',
  registerLow: 53, // F3
  registerHigh: 77, // F5
  maxNotesPerBar: HORN_MAX_NOTES_PER_BAR,
  rhythmPalette: HORN_FOLLOW_PALETTE,
  harmonicDiscipline: 'chord tone below the trumpets — keep the upper stack inside one octave',
  monoPreference: 'high',
};

const HORN_TENOR: Omit<EnsembleVoiceSpec, 'voiceIndex'> = {
  label: 'tenor sax',
  role: 'brass',
  registerLow: 46, // Bb2
  registerHigh: 72, // C5
  maxNotesPerBar: HORN_MAX_NOTES_PER_BAR,
  rhythmPalette: HORN_FOLLOW_PALETTE,
  harmonicDiscipline: 'chord tone under the upper horns — complete the chord',
  monoPreference: 'low',
};

const HORN_TROMBONE: Omit<EnsembleVoiceSpec, 'voiceIndex'> = {
  label: 'trombone',
  role: 'brass',
  registerLow: 43, // G2
  registerHigh: 67, // G4
  maxNotesPerBar: HORN_MAX_NOTES_PER_BAR,
  rhythmPalette: HORN_FOLLOW_PALETTE,
  harmonicDiscipline: 'chord tone or root below the saxes — weight in the middle-low stack',
  monoPreference: 'low',
};

const HORN_BARI: Omit<EnsembleVoiceSpec, 'voiceIndex'> = {
  label: 'baritone sax',
  role: 'brass',
  registerLow: 36, // C2
  registerHigh: 60, // C4
  maxNotesPerBar: HORN_MAX_NOTES_PER_BAR,
  rhythmPalette: HORN_FOLLOW_PALETTE,
  harmonicDiscipline: 'chord roots and lower chord tones — the section\'s bottom anchor',
  monoPreference: 'low',
};

// ── WINDS — chamber winds (all 'winds', concert pitch) ──────────────────────

const WIND_FLUTE: Omit<EnsembleVoiceSpec, 'voiceIndex'> = {
  label: 'flute',
  role: 'winds',
  registerLow: 60, // C4
  registerHigh: 93, // A6
  maxNotesPerBar: 8,
  rhythmPalette: '8ths and 16ths; runs, turns and trills welcome',
  harmonicDiscipline:
    'freest voice — non-chord tones as passing/neighbor tones on weak beats, resolving by step',
  monoPreference: 'high',
};

const WIND_FLUTE_2: Omit<EnsembleVoiceSpec, 'voiceIndex'> = {
  label: 'second flute',
  role: 'winds',
  registerLow: 60, // C4
  registerHigh: 86, // D6
  maxNotesPerBar: 5,
  rhythmPalette: 'quarters with occasional 8th-note motion',
  harmonicDiscipline: 'chord tones; fill gaps the other inner voices leave',
  monoPreference: 'high',
};

const WIND_OBOE: Omit<EnsembleVoiceSpec, 'voiceIndex'> = {
  label: 'oboe',
  role: 'winds',
  registerLow: 58, // Bb3
  registerHigh: 84, // C6
  maxNotesPerBar: 6,
  rhythmPalette: '8ths and quarters; move when the flute rests',
  harmonicDiscipline: 'mostly chord tones; may imitate the flute\'s motifs a bar later',
  monoPreference: 'high',
};

const WIND_CLARINET: Omit<EnsembleVoiceSpec, 'voiceIndex'> = {
  label: 'clarinet',
  role: 'winds',
  registerLow: 50, // D3
  registerHigh: 81, // A5
  maxNotesPerBar: 4,
  rhythmPalette: 'quarters and halves',
  harmonicDiscipline: 'chord tones with smooth stepwise motion between them',
  monoPreference: 'high',
};

const WIND_FRENCH_HORN: Omit<EnsembleVoiceSpec, 'voiceIndex'> = {
  label: 'french horn',
  role: 'winds',
  registerLow: 41, // F2
  registerHigh: 72, // C5
  maxNotesPerBar: 4,
  rhythmPalette: 'quarters and halves; long held tones welcome',
  harmonicDiscipline: 'chord tones — the warm glue in the middle of the ensemble',
  monoPreference: 'low',
};

const WIND_BASSOON: Omit<EnsembleVoiceSpec, 'voiceIndex'> = {
  label: 'bassoon',
  role: 'winds',
  registerLow: 34, // Bb1
  registerHigh: 62, // D4
  maxNotesPerBar: 3,
  rhythmPalette: 'quarters and halves; brief walking figures at cadences',
  harmonicDiscipline: 'roots and fifths emphasized; passing tones only between chord tones',
  monoPreference: 'low',
};

/** Supported ensemble sizes. */
export const ENSEMBLE_MIN_VOICES = 2;
export const ENSEMBLE_MAX_VOICES = 6;

type SpecTable = Record<number, Array<Omit<EnsembleVoiceSpec, 'voiceIndex'>>>;

const STRINGS_SPEC_TABLES: SpecTable = {
  2: [TOP, BASS],
  3: [TOP, INNER, BASS],
  4: [TOP, COUNTER, TENOR, BASS],
  5: [TOP, COUNTER, INNER, TENOR, SUB],
  6: [TOP, COUNTER, INNER_2, INNER, TENOR, SUB],
};

// 2 = the classic trumpet+tenor two-piece; 3 = the J.B.'s trio;
// 5 adds trombone; 6 is a big-band section.
const HORNS_SPEC_TABLES: SpecTable = {
  2: [HORN_LEAD, HORN_TENOR],
  3: [HORN_LEAD, HORN_TENOR, HORN_BARI],
  4: [HORN_LEAD, HORN_TRUMPET_2, HORN_TENOR, HORN_BARI],
  5: [HORN_LEAD, HORN_TRUMPET_2, HORN_TENOR, HORN_TROMBONE, HORN_BARI],
  6: [HORN_LEAD, HORN_TRUMPET_2, HORN_ALTO, HORN_TENOR, HORN_TROMBONE, HORN_BARI],
};

// 5 = the wind quintet.
const WINDS_SPEC_TABLES: SpecTable = {
  2: [WIND_FLUTE, WIND_BASSOON],
  3: [WIND_FLUTE, WIND_CLARINET, WIND_BASSOON],
  4: [WIND_FLUTE, WIND_OBOE, WIND_FRENCH_HORN, WIND_BASSOON],
  5: [WIND_FLUTE, WIND_OBOE, WIND_CLARINET, WIND_FRENCH_HORN, WIND_BASSOON],
  6: [WIND_FLUTE, WIND_FLUTE_2, WIND_OBOE, WIND_CLARINET, WIND_FRENCH_HORN, WIND_BASSOON],
};

const SPEC_TABLES_BY_INSTRUMENTATION: Record<EnsembleInstrumentation, SpecTable> = {
  strings: STRINGS_SPEC_TABLES,
  horns: HORNS_SPEC_TABLES,
  winds: WINDS_SPEC_TABLES,
};

/**
 * Default voice specs for an N-voice ensemble of the given instrumentation,
 * top voice first. Clamps N to the supported range; instrumentation
 * defaults to 'strings' (the pre-instrumentation behavior, unchanged).
 * Returned objects are fresh copies — callers may override fields (e.g.
 * style packs narrowing registers) without touching the tables.
 */
export function defaultVoiceSpecs(
  voiceCount: number,
  instrumentation: EnsembleInstrumentation = 'strings'
): EnsembleVoiceSpec[] {
  const n = Math.max(ENSEMBLE_MIN_VOICES, Math.min(ENSEMBLE_MAX_VOICES, Math.round(voiceCount)));
  return SPEC_TABLES_BY_INSTRUMENTATION[instrumentation][n].map((spec, voiceIndex) => ({ ...spec, voiceIndex }));
}
