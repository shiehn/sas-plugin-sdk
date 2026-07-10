/**
 * ensemble-core: the `submit_ensemble` function-calling contract — how the
 * ONE joint LLM call returns all voices as structured JSON. Built for
 * `host.generateWithLLMTools` with `functionCallingConfig.mode: 'ANY'` +
 * `allowedFunctionNames: [SUBMIT_ENSEMBLE_TOOL_NAME]`, which forces a
 * schema-constrained call instead of free text (the `generateWithLLM`
 * `responseFormat` field is a dead letter — this is the reliable path).
 *
 * Parsing is defensive: the model's args pass through structural checks and
 * per-note validation; a voice the model omits comes back as an empty note
 * list so the caller can decide whether that is acceptable for the style.
 *
 * @since SDK 2.42.0
 */

import type { EnsembleNote } from './enforce-voice';

export const SUBMIT_ENSEMBLE_TOOL_NAME = 'submit_ensemble';

/**
 * JSON-Schema `parameters` for the submit_ensemble tool. Gemini function
 * calling accepts standard JSON Schema here.
 */
export function buildSubmitEnsembleParameters(voiceCount: number): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      voices: {
        type: 'array',
        description: `Exactly ${voiceCount} voices, voiceIndex 0 (top) through ${voiceCount - 1} (bottom).`,
        items: {
          type: 'object',
          properties: {
            voiceIndex: { type: 'integer', description: '0 = top voice' },
            notes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  pitch: { type: 'integer', description: 'MIDI note number 0-127' },
                  startBeat: { type: 'number', description: 'quarter-note beats from clip start' },
                  durationBeats: { type: 'number', description: 'duration in quarter-note beats' },
                  velocity: { type: 'integer', description: '1-127' },
                },
                required: ['pitch', 'startBeat', 'durationBeats', 'velocity'],
              },
            },
          },
          required: ['voiceIndex', 'notes'],
        },
      },
    },
    required: ['voices'],
  };
}

export interface ParsedEnsemble {
  /** Index-aligned: entry v = notes for voiceIndex v (possibly empty). */
  voiceNotes: EnsembleNote[][];
  /** Structural oddities worth logging (wrong count, dropped notes…). */
  warnings: string[];
}

/**
 * Validate + normalize the functionCall args into per-voice note lists.
 * Returns null only when nothing usable came back.
 */
export function parseEnsembleArgs(args: unknown, voiceCount: number): ParsedEnsemble | null {
  if (typeof args !== 'object' || args === null) return null;
  const voicesRaw = (args as { voices?: unknown }).voices;
  if (!Array.isArray(voicesRaw)) return null;

  const warnings: string[] = [];
  const voiceNotes: EnsembleNote[][] = Array.from({ length: voiceCount }, () => []);

  for (const v of voicesRaw) {
    if (typeof v !== 'object' || v === null) continue;
    const idxRaw = (v as { voiceIndex?: unknown }).voiceIndex;
    const idx = typeof idxRaw === 'number' ? Math.round(idxRaw) : NaN;
    if (!Number.isInteger(idx) || idx < 0 || idx >= voiceCount) {
      warnings.push(`ignored voice with out-of-range voiceIndex ${String(idxRaw)}`);
      continue;
    }
    const notesRaw = (v as { notes?: unknown }).notes;
    if (!Array.isArray(notesRaw)) continue;
    const notes: EnsembleNote[] = [];
    let dropped = 0;
    for (const n of notesRaw) {
      const note = n as Partial<EnsembleNote>;
      if (
        typeof note?.pitch === 'number' &&
        typeof note?.startBeat === 'number' &&
        typeof note?.durationBeats === 'number' &&
        typeof note?.velocity === 'number' &&
        note.durationBeats > 0 &&
        note.startBeat >= 0
      ) {
        notes.push({
          pitch: Math.max(0, Math.min(127, Math.round(note.pitch))),
          startBeat: note.startBeat,
          durationBeats: note.durationBeats,
          velocity: Math.max(1, Math.min(127, Math.round(note.velocity))),
        });
      } else {
        dropped += 1;
      }
    }
    if (dropped > 0) warnings.push(`voice ${idx}: dropped ${dropped} malformed note(s)`);
    voiceNotes[idx] = notes;
  }

  const returned = voicesRaw.length;
  if (returned !== voiceCount) {
    warnings.push(`model returned ${returned} voices for a ${voiceCount}-voice ensemble`);
  }
  const anyNotes = voiceNotes.some(v => v.length > 0);
  return anyNotes ? { voiceNotes, warnings } : null;
}
