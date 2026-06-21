/**
 * Crossfade MIDI inpainting — builds the LLM user-prompt for a bridge that
 * MORPHS the ORIGIN part into the TARGET part.
 *
 * A normal scene generation composes a part standalone from the scene's chords.
 * A crossfade bridge is different: it is INPAINTING between two fixed endpoints.
 * The generated part must begin feeling continuous with the origin pattern and
 * end feeling continuous with the target pattern, transforming between them
 * across the transition's bars.
 *
 * The harmonic frame — Key / mode / BPM / bars / the transition chord
 * progression (with beat timing) / scene contract — is injected AUTOMATICALLY by
 * `host.generateWithLLM` (it prepends the active scene's "Musical Context" block
 * unless `skipContextPrefix` is set). So this prompt does NOT restate key/bpm/
 * chords — it adds only the two endpoint patterns + the morph instructions, and
 * references the harmonic frame as "given above".
 *
 * REPRESENTATION (researched for Gemini): ABC notation is the LLM-native format
 * for melodic generation, but it's weak for percussion, would need a separate
 * output parser (our output is JSON note-events, already proven with Gemini),
 * and an inpainting task wants input/output FORMAT SYMMETRY. So each endpoint is
 * given as the exact JSON note-events PLUS a pitch-named, bar-structured "gloss"
 * — the transferable wins from the research (pitch NAMES over raw MIDI numbers,
 * explicit bar/beat structure) layered on the precise, symmetric JSON. Drums
 * (uniform pitch) get a rhythmic gloss instead of pitch names.
 *
 * This changes only the LLM INPUT framing: the OUTPUT schema is unchanged, so the
 * calling panel keeps its system prompt + parser (and, for drums, its flatten step).
 *
 * @since SDK 2.24.0
 */
import type { PluginMidiNote } from './types/plugin-sdk.types';

export interface CrossfadeInpaintInput {
  /** Musical role of the bridge part (e.g. 'bass'). '' falls back to "melodic". */
  role: string;
  /** Transition length in bars (the morph timeline). */
  bars: number;
  /** Display name of the ORIGIN source track (the part the bridge begins from). */
  originName: string;
  /** Display name of the TARGET source track (the part the bridge arrives at). */
  targetName: string;
  /** ORIGIN source scene's key label (e.g. "G minor"). Null/omitted = unknown. */
  originKey?: string | null;
  /** TARGET source scene's key label. Null/omitted = unknown. */
  targetKey?: string | null;
  /** ORIGIN pattern notes (beat-based; from the FROM scene). May be empty. */
  originNotes: readonly PluginMidiNote[];
  /** TARGET pattern notes (beat-based; from the TO scene). May be empty. */
  targetNotes: readonly PluginMidiNote[];
  /** Drums: pitch is uniform (flattened), so gloss RHYTHM instead of pitch names. */
  percussive?: boolean;
}

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Round to 3 dp, dropping trailing-zero noise. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** MIDI number → scientific pitch name (60 → C4), the app's octave convention. */
function pitchName(p: number): string {
  return `${PITCH_NAMES[((p % 12) + 12) % 12]}${Math.floor(p / 12) - 1}`;
}

/** Compact a note to the 4 fields the LLM needs (drops channel), beats rounded. */
function compactNote(n: PluginMidiNote): { pitch: number; startBeat: number; durationBeats: number; velocity: number } {
  return { pitch: n.pitch, startBeat: round3(n.startBeat), durationBeats: round3(n.durationBeats), velocity: n.velocity };
}

/** One-line shape summary so the LLM grasps register/density before the detail. */
function summarize(notes: readonly PluginMidiNote[], percussive: boolean): string {
  if (notes.length === 0) return 'empty (no notes)';
  const span = round3(Math.max(...notes.map((n) => n.startBeat + n.durationBeats)));
  if (percussive) return `${notes.length} hits, spans ~${span} beats`;
  const pitches = notes.map((n) => n.pitch);
  return `${notes.length} notes, ${pitchName(Math.min(...pitches))}–${pitchName(Math.max(...pitches))}, spans ~${span} beats`;
}

/** Pitch-named (melodic) or rhythmic (drums) gloss, grouped by inferred bar. */
function gloss(notes: readonly PluginMidiNote[], percussive: boolean): string {
  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat);
  const maxEnd = Math.max(...sorted.map((n) => n.startBeat + n.durationBeats));
  const bars = Math.max(1, Math.ceil(maxEnd / 4));
  const lines: string[] = [];
  for (let b = 0; b < bars; b++) {
    const inBar = sorted.filter((n) => n.startBeat >= b * 4 && n.startBeat < (b + 1) * 4);
    if (inBar.length === 0) continue;
    const body = percussive
      ? inBar.map((n) => `${round3(n.startBeat)}(v${n.velocity})`).join(' ')
      : inBar.map((n) => `${pitchName(n.pitch)}@${round3(n.startBeat)}`).join(' ');
    lines.push(`    Bar ${b + 1}: ${body}`);
  }
  return lines.join('\n');
}

function patternBlock(
  label: string,
  name: string,
  key: string | null | undefined,
  notes: readonly PluginMidiNote[],
  percussive: boolean,
): string {
  const keyLabel = key ? ` in ${key}` : '';
  const header = `${label} — "${name}"${keyLabel} (${summarize(notes, percussive)}):`;
  if (notes.length === 0) return `${header}\n  (no notes — treat this end as open)`;
  return `${header}\n${gloss(notes, percussive)}\n    exact JSON: ${JSON.stringify(notes.map(compactNote))}`;
}

/**
 * Build the inpainting user-prompt. The result is the prompt BODY only — pass it
 * as `request.user` to `host.generateWithLLM` with the panel's normal system
 * prompt and `responseFormat: 'json'`; the harmonic context auto-prefixes.
 */
export function buildCrossfadeInpaintPrompt(input: CrossfadeInpaintInput): string {
  const { role, bars, originName, targetName, originKey, targetKey, originNotes, targetNotes } = input;
  const percussive = input.percussive ?? false;
  const part = role || (percussive ? 'drum' : 'melodic');
  const modulation =
    originKey && targetKey
      ? originKey === targetKey
        ? `stays in ${targetKey}`
        : `modulates from ${originKey} toward ${targetKey}`
      : 'resolves toward the destination key';

  const lines: string[] = [
    `TASK — TRANSITION BRIDGE (musical inpainting).`,
    `Compose a ${part} part that MORPHS from the ORIGIN pattern into the TARGET pattern across the ${bars} bars`,
    `of this transition. The Key / BPM / chord progression are given above — it ${modulation}; honour that`,
    `frame, don't restate it. Each pattern below is shown as a pitch/rhythm gloss for musicality plus its exact`,
    `JSON; output your bridge in the same JSON note schema (per the system prompt).`,
    ``,
    patternBlock('ORIGIN pattern (where the bridge BEGINS)', originName, originKey, originNotes, percussive),
    ``,
    patternBlock('TARGET pattern (where the bridge must ARRIVE)', targetName, targetKey, targetNotes, percussive),
    ``,
    `Requirements:`,
    `- The FIRST bar feels continuous with the ORIGIN — borrow its register, rhythm, and contour so the seam`,
    `  from the previous scene is seamless.`,
    `- Across the middle bars, gradually transform toward the TARGET (shift register / rhythm / motifs step by step).`,
    `- The LAST bar lands on the TARGET's material and resolves onto the destination chord, so the seam into the`,
    `  next scene is seamless.`,
    `- Stay within the transition chord progression above; favour chord tones at the bar boundaries.`,
    `- This is inpainting between two FIXED endpoints — a listener should not be able to point to where the`,
    `  origin ends or the target begins.`,
  ];

  if (originNotes.length === 0 || targetNotes.length === 0) {
    lines.push(
      ``,
      originNotes.length === 0 && targetNotes.length === 0
        ? `(Both endpoints are empty — compose a short ${part} bridge from the chords alone.)`
        : originNotes.length === 0
          ? `(The ORIGIN is empty — begin sparse and grow INTO the TARGET.)`
          : `(The TARGET is empty — begin from the ORIGIN and dissolve toward the destination chord.)`,
    );
  }

  return lines.join('\n');
}
