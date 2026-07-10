/**
 * ensemble-core: the joint-composition system prompt. ONE call composes ALL
 * voices together — the coordination (imitation, staggered entrances,
 * contrary motion) has to be planned across voices, which is exactly what
 * per-track generation can never do. Mirrors the bass plugin's prompt
 * discipline: numbered load-bearing rules, register/density contracts
 * stated per voice, sound selection nowhere in sight (that stays
 * mechanical, host-side).
 *
 * The musical context (key/BPM/chords/contract) arrives via the host's
 * generateWithLLM(Tools) auto-prefix — this prompt states the ENSEMBLE
 * rules and the per-voice contracts only.
 *
 * @since SDK 2.42.0
 */

import type { EnsembleVoiceSpec } from './voice-spec';
import { STYLE_RULES, type EnsembleStyle } from './styles';
import { SUBMIT_ENSEMBLE_TOOL_NAME } from './ensemble-schema';

function voiceContractLine(spec: EnsembleVoiceSpec): string {
  const root = spec.rootOnly ? ' ROOT PITCH CLASS ONLY (each bar\'s chord root).' : '';
  return `- Voice ${spec.voiceIndex + 1} (${spec.label}): MIDI ${spec.registerLow}-${spec.registerHigh}, `
    + `max ${spec.maxNotesPerBar} notes/bar, rhythm: ${spec.rhythmPalette}. ${spec.harmonicDiscipline}.${root}`;
}

export function buildEnsembleSystemPrompt(
  specs: readonly EnsembleVoiceSpec[],
  style: EnsembleStyle
): string {
  const styleParagraph = STYLE_RULES[style].promptParagraph;
  return `You are an ensemble composer. Compose ${specs.length} voices as ONE piece of music — not ${specs.length} independent parts.

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

/**
 * Build the retry user-message suffix from soft-rule violations — one
 * guided second attempt, quota-conscious (callers should not loop).
 */
export function buildViolationRetrySuffix(violations: readonly string[]): string {
  if (violations.length === 0) return '';
  return `\n\nYour previous ensemble had these problems — fix them while keeping everything that worked:\n`
    + violations.map(v => `- ${v}`).join('\n');
}
