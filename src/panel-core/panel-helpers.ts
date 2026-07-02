/**
 * Small pure helpers shared by every generator panel — moved verbatim out of
 * the three panel monoliths (synth/drum/instrument each carried a copy of
 * pluginFxToToggleFx and an LLM note-response parser).
 *
 * @since SDK 2.35.0
 */

import type {
  PluginTrackFxDetailState,
  PluginFxCategoryDetailState,
  PluginMidiNote,
} from '../types/plugin-sdk.types';
import { EMPTY_FX_DETAIL_STATE, type TrackFxDetailState } from '../types/fx-toggle.types';

/**
 * Build a scene plugin_data key for a track-scoped value. Scene-data keys are
 * ALWAYS constructed from the stable DB UUID (`handle.dbId`) — never the
 * engine id, which changes on project reload. This is the ONLY key builder
 * panels and generation strategies should use.
 */
export function trackDataKey(dbId: string, suffix: string): string {
  return `track:${dbId}:${suffix}`;
}

/** Convert SDK PluginTrackFxDetailState to the FxToggleBar's expected TrackFxDetailState. */
export function pluginFxToToggleFx(sdkState: PluginTrackFxDetailState): TrackFxDetailState {
  const result = { ...EMPTY_FX_DETAIL_STATE };
  for (const category of ['eq', 'compressor', 'chorus', 'phaser', 'delay', 'reverb'] as const) {
    const sdkCat = sdkState[category] as PluginFxCategoryDetailState | undefined;
    if (sdkCat) {
      result[category] = {
        enabled: sdkCat.enabled,
        presetIndex: sdkCat.presetIndex,
        dryWet: sdkCat.dryWet,
      };
    }
  }
  return result;
}

/** Shape of the parsed flat LLM JSON note response. */
export interface LLMNoteResponse {
  notes: PluginMidiNote[];
  role?: string;
}

/**
 * Parse the LLM JSON response and extract valid MIDI notes (flat
 * `{notes:[...], role?}` schema). Handles markdown code fences; silently
 * filters invalid notes; returns null when nothing parses.
 */
export function parseLLMNoteResponse(content: string): LLMNoteResponse | null {
  try {
    // Try to extract JSON from the response (handle markdown code fences)
    let jsonStr = content.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed: unknown = JSON.parse(jsonStr);
    if (typeof parsed !== 'object' || parsed === null || !('notes' in parsed)) {
      return null;
    }

    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.notes)) {
      return null;
    }

    const validNotes: PluginMidiNote[] = [];
    for (const raw of obj.notes) {
      if (typeof raw !== 'object' || raw === null) continue;
      const note = raw as Record<string, unknown>;

      const pitch = typeof note.pitch === 'number' ? note.pitch : NaN;
      const startBeat = typeof note.startBeat === 'number' ? note.startBeat : NaN;
      const durationBeats = typeof note.durationBeats === 'number' ? note.durationBeats : NaN;
      const velocity = typeof note.velocity === 'number' ? note.velocity : NaN;

      if (
        !isNaN(pitch) && pitch >= 0 && pitch <= 127 &&
        !isNaN(startBeat) && startBeat >= 0 &&
        !isNaN(durationBeats) && durationBeats > 0 &&
        !isNaN(velocity) && velocity >= 1 && velocity <= 127
      ) {
        validNotes.push({
          pitch: Math.round(pitch),
          startBeat,
          durationBeats,
          velocity: Math.round(velocity),
        });
      }
    }

    const role = typeof obj.role === 'string' ? obj.role : undefined;

    return { notes: validNotes, role };
  } catch {
    return null;
  }
}
