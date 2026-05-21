/**
 * Format the cross-plugin concurrent-track context into a prose block
 * that's safe to drop straight into an LLM user-prompt. Both the synth
 * and drum builtin panels use this so the rendered prompt stays
 * consistent across generators — and so a single change here propagates
 * to every plugin that calls `host.getGenerationContext()`.
 *
 * Per-track payload follows the user's preferred shape (raw note JSON
 * grouped by chord) so the model sees velocity / start-beat /
 * duration / pitch verbatim and can reason about feel + harmony.
 *
 * Returns the empty string when there are no concurrent tracks — call
 * sites can `if (block) push(block)` rather than baking in a placeholder.
 */

import type {
  PluginGenerationContext,
  PluginChordSegment,
  PluginMidiNote,
} from '../types/plugin-sdk.types';

export function formatConcurrentTracks(ctx: PluginGenerationContext): string {
  const tracks = ctx.concurrentTracks;
  if (!tracks || tracks.length === 0) return '';

  const lines: string[] = [`Concurrent tracks in scene (already generated):`];

  for (const track of tracks) {
    const promptStr = track.prompt
      ? ` prompt="${escapeQuotes(track.prompt)}"`
      : '';
    lines.push(`  - role=${track.role ?? 'unknown'}${promptStr}`);

    if (track.notesByChord.length === 0) {
      lines.push(`    (no notes)`);
    } else {
      for (const segment of track.notesByChord) {
        if (segment.notes.length === 0) continue;
        lines.push(`    ${formatChordSegment(segment)}`);
      }
    }

    if (track.truncated && typeof track.originalNoteCount === 'number') {
      const dropped = track.originalNoteCount - sumKeptNotes(track.notesByChord);
      if (dropped > 0) {
        lines.push(`    … (${dropped} more notes truncated)`);
      }
    }
  }

  if (ctx.truncatedTrackCount && ctx.truncatedTrackCount > 0) {
    lines.push(
      `  … (${ctx.truncatedTrackCount} additional track${ctx.truncatedTrackCount === 1 ? '' : 's'} omitted to fit token budget)`,
    );
  }

  return lines.join('\n');
}

function formatChordSegment(segment: PluginChordSegment): string {
  const [start, end] = segment.chordRangeQn;
  const notesJson = JSON.stringify(segment.notes.map(compactNote));
  return `${segment.chord} (beats ${start}-${end}): ${notesJson}`;
}

/**
 * Strip channel and other rarely-relevant fields so the LLM sees only
 * the four properties that drive perception: pitch, startBeat,
 * durationBeats, velocity.
 */
function compactNote(n: PluginMidiNote): {
  pitch: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
} {
  return {
    pitch: n.pitch,
    startBeat: n.startBeat,
    durationBeats: n.durationBeats,
    velocity: n.velocity,
  };
}

function escapeQuotes(s: string): string {
  return s.replace(/"/g, '\\"');
}

function sumKeptNotes(segments: PluginChordSegment[]): number {
  let total = 0;
  for (const s of segments) total += s.notes.length;
  return total;
}
