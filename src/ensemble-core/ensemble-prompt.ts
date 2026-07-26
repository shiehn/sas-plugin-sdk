/**
 * ensemble-core: the joint-composition system prompt. ONE call composes ALL
 * voices together — the coordination has to be planned across voices, which
 * is exactly what per-track generation can never do. Mirrors the bass
 * plugin's prompt discipline: numbered load-bearing rules, register/density
 * contracts stated per voice, sound selection nowhere in sight (that stays
 * mechanical, host-side).
 *
 * The numbered rules are INSTRUMENTATION-dependent — the two families obey
 * opposite coordination physics:
 *
 *   WOVEN (strings, winds): independent lines that converse — imitation,
 *   contrary motion, staggered entrances, avoid attacking together.
 *
 *   SECTION (horns): one instrument with many bells — every voice attacks
 *   WITH the lead, voiced under it, short and syncopated, biased hard
 *   toward dance/funk (James Brown stabs, rhythmic punches).
 *
 * The musical context (key/BPM/chords/contract) arrives via the host's
 * generateWithLLM(Tools) auto-prefix — this prompt states the ensemble
 * rules and the per-voice contracts only.
 *
 * @since SDK 2.42.0 (section rules @since 2.39.0)
 */

import type { EnsembleVoiceSpec } from './voice-spec';
import { STYLE_RULES, type EnsembleStyle } from './styles';
import type { EnsembleInstrumentation } from './instrumentation';
import { SUBMIT_ENSEMBLE_TOOL_NAME } from './ensemble-schema';

function voiceContractLine(spec: EnsembleVoiceSpec): string {
  const root = spec.rootOnly ? ' ROOT PITCH CLASS ONLY (each bar\'s chord root).' : '';
  return `- Voice ${spec.voiceIndex + 1} (${spec.label}): MIDI ${spec.registerLow}-${spec.registerHigh}, `
    + `max ${spec.maxNotesPerBar} notes/bar, rhythm: ${spec.rhythmPalette}. ${spec.harmonicDiscipline}.${root}`;
}

/** Persona line per woven instrumentation — the rules below are shared. */
const WOVEN_PERSONA: Record<'strings' | 'winds', string> = {
  strings: 'You are an ensemble composer.',
  winds: 'You are a wind-ensemble composer writing for chamber winds (flutes, oboe, clarinet, french horn, bassoon).',
};

function buildWovenPrompt(
  specs: readonly EnsembleVoiceSpec[],
  style: EnsembleStyle,
  instrumentation: 'strings' | 'winds'
): string {
  const styleParagraph = STYLE_RULES[style].promptParagraph;
  return `${WOVEN_PERSONA[instrumentation]} Compose ${specs.length} voices as ONE piece of music — not ${specs.length} independent parts.

Submit your composition by calling the ${SUBMIT_ENSEMBLE_TOOL_NAME} tool with all ${specs.length} voices.

THE ENSEMBLE RULES (most important):
1. The voices are composed TOGETHER. They must relate: imitate and answer each other's motifs, move in contrary or oblique motion against neighbors, and stagger entrances so lines converse.
2. Each voice is a SINGLE monophonic line — within one voice, no two notes overlap in time and no chords. Voices MAY and SHOULD overlap EACH OTHER; that overlap is the music.
3. Complexity decreases downward: the top voice is the most active and ornamented, the bottom voice the sparsest anchor. Respect each voice's register window and notes-per-bar cap exactly.
4. Follow the chord progression in the musical context exactly. Non-chord tones only as passing or neighbor tones on weak beats, resolving by step.
5. Not every voice plays all the time — rests are structural. Avoid all voices attacking the same beat except at phrase boundaries.
6. startBeat/durationBeats are in quarter-note beats from the start of the clip; fill the stated bar length, and make bar 1 land immediately (no long silent intro).

${styleParagraph}

PER-VOICE CONTRACTS:
${specs.map(voiceContractLine).join('\n')}`;
}

function buildSectionPrompt(
  specs: readonly EnsembleVoiceSpec[],
  style: EnsembleStyle
): string {
  const styleParagraph = STYLE_RULES[style].promptParagraph;
  return `You are a funk horn-section arranger. Compose ${specs.length} horn parts as ONE section — ${specs.length} players phrasing like a single instrument, not ${specs.length} independent parts.

Submit your composition by calling the ${SUBMIT_ENSEMBLE_TOOL_NAME} tool with all ${specs.length} voices.

THE SECTION RULES (most important):
1. The section speaks with ONE rhythm: every voice attacks on the same beats as Voice 1 (the lead). Compose the lead line first, then stack the other voices onto its rhythm exactly — the style below dictates chord voicing vs octave doubling.
2. Each voice is a SINGLE monophonic line — within one voice, no two notes overlap in time and no chords. The chord is the STACK of voices hitting together.
3. SPACE IS THE GROOVE: short phrases and punches separated by real rests. Never carpet the bar — the section punctuates around the rhythm section, and the silence between hits is part of the riff.
4. Follow the chord progression in the musical context exactly — every hit is voiced from the chord sounding at that beat.
5. Make it DANCE: this is funk. Syncopate, anticipate downbeats (attack the "and" just before the barline), and accent with velocity — 105-120 on accented hits, 70-90 on lighter punches. Repeat the riff so the clip locks like a loop.
6. startBeat/durationBeats are in quarter-note beats from the start of the clip; respect each voice's register window and notes-per-bar cap exactly; fill the stated bar length and land the first hit in bar 1 (no long silent intro).

${styleParagraph}

PER-VOICE CONTRACTS:
${specs.map(voiceContractLine).join('\n')}`;
}

export function buildEnsembleSystemPrompt(
  specs: readonly EnsembleVoiceSpec[],
  style: EnsembleStyle,
  instrumentation: EnsembleInstrumentation = 'strings'
): string {
  return instrumentation === 'horns'
    ? buildSectionPrompt(specs, style)
    : buildWovenPrompt(specs, style, instrumentation);
}

/**
 * Build the retry user-message suffix from soft-rule violations — one
 * guided second attempt, quota-conscious (callers should not loop).
 */
export function buildViolationRetrySuffix(violations: readonly string[]): string {
  if (violations.length === 0) return '';
  return `\n\nYour previous ensemble had these problems — fix them while keeping everything that worked:\n`
    + violations.map(v => `- ${v}`).join('\n');
}
