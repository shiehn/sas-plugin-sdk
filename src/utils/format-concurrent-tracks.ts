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
 * Tracks pinned via `PluginGenerationContextOptions.pinTrackDbIds` render
 * FIRST under a REFERENCE TRACKS header with an explicit counterpoint
 * instruction — they are the parts the caller asked to write against,
 * not merely ambient context.
 *
 * Returns the empty string when there are no concurrent tracks — call
 * sites can `if (block) push(block)` rather than baking in a placeholder.
 *
 * NOTE: maintained as byte-identical copies in
 * `sas-plugin-sdk/src/utils/format-concurrent-tracks.ts` (panels) and
 * `sas-app/src/shared/utils/format-concurrent-tracks.ts` (main process,
 * which must not import SDK runtime). The parity test
 * `format-concurrent-tracks-parity.test.ts` pins the two together.
 */

import type {
  PluginGenerationContext,
  PluginConcurrentTrackInfo,
  PluginChordSegment,
  PluginMidiNote,
} from '../types/plugin-sdk.types';

export function formatConcurrentTracks(ctx: PluginGenerationContext): string {
  const tracks = ctx.concurrentTracks;
  if (!tracks || tracks.length === 0) return '';

  const pinned = tracks.filter((t: PluginConcurrentTrackInfo) => t.pinned);
  const ambient = tracks.filter((t: PluginConcurrentTrackInfo) => !t.pinned);
  const lines: string[] = [];

  if (pinned.length > 0) {
    lines.push(
      'REFERENCE TRACKS (write in counterpoint against these — interlock with their rhythm, avoid doubling their onsets, favor contrary or oblique motion):',
    );
    for (const track of pinned) pushTrackLines(lines, track);
  }

  if (ambient.length > 0) {
    lines.push(`Concurrent tracks in scene (already generated):`);
    for (const track of ambient) pushTrackLines(lines, track);
  }

  if (ctx.truncatedTrackCount && ctx.truncatedTrackCount > 0) {
    lines.push(
      `  … (${ctx.truncatedTrackCount} additional track${ctx.truncatedTrackCount === 1 ? '' : 's'} omitted to fit token budget)`,
    );
  }

  return lines.join('\n');
}

function pushTrackLines(lines: string[], track: PluginConcurrentTrackInfo): void {
  const nameStr = track.name ? ` name="${escapeQuotes(track.name)}"` : '';
  const promptStr = track.prompt
    ? ` prompt="${escapeQuotes(track.prompt)}"`
    : '';
  lines.push(`  - role=${track.role ?? 'unknown'}${nameStr}${promptStr}`);

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
