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
 * FIRST — they are the parts the caller asked to write against, not merely
 * ambient context. Pinned tracks split by ROLE into two headers, because the
 * right instruction is the opposite for each:
 *
 *   RHYTHM ANCHORS  (kick/sub family) — LOCK TO these. Sharing an onset with
 *                   the kick is the point; a part that dodges every anchor
 *                   hit reads as drift.
 *   REFERENCE TRACKS (everything else) — write in COUNTERPOINT, avoid
 *                   doubling their onsets.
 *
 * The split exists because groove-leader auto-pinning (sas-app
 * generation-context-service) pins the kick for every generation that has no
 * explicit pins. Under the old single header that handed the bass panel
 * "avoid doubling their onsets" about the kick — the exact opposite of what a
 * bassline should do — and produced lines uniformly displaced off the kick
 * grid. When no rhythm anchor is pinned the output is byte-identical to the
 * pre-split behavior.
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
    const anchors = pinned.filter((t: PluginConcurrentTrackInfo) => isRhythmAnchorRole(t.role));
    const counterpoint = pinned.filter(
      (t: PluginConcurrentTrackInfo) => !isRhythmAnchorRole(t.role),
    );
    if (anchors.length > 0) {
      lines.push(
        'RHYTHM ANCHORS (lock to these — land your hits ON their onsets wherever the style allows; sharing an onset with the rhythm section is the point, not a collision. Do NOT displace every note off their grid: a part that dodges every anchor hit reads as drift, not groove):',
      );
      for (const track of anchors) pushTrackLines(lines, track);
    }
    if (counterpoint.length > 0) {
      lines.push(
        'REFERENCE TRACKS (write in counterpoint against these — interlock with their rhythm, avoid doubling their onsets, favor contrary or oblique motion):',
      );
      for (const track of counterpoint) pushTrackLines(lines, track);
    }
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

/**
 * Rhythm-section anchor roles — the parts a new line LOCKS TO rather than
 * writes around. Deliberately self-contained (the app copy must not import
 * SDK runtime, and the two files are byte-identical), and deliberately wider
 * than the app's KICK_ROLES/BASS_ROLES: the drum panel writes raw on-disk
 * folder names ('kick') alongside the normalized role ('kicks'), and both
 * reach this formatter unnormalized.
 */
const RHYTHM_ANCHOR_ROLES: ReadonlySet<string> = new Set<string>([
  'kick',
  'kicks',
  'drums',
  '808',
  '808s',
  'bass',
  'sub',
]);

/**
 * Whole-token, case/whitespace-insensitive membership test — mirrors the
 * app classifier's `roleInSet` policy so `"808 bass"` matches via either
 * token.
 */
function isRhythmAnchorRole(role: string | null | undefined): boolean {
  if (!role) return false;
  const normalized = role.toLowerCase().replace(/[\s_-]+/g, ' ').trim();
  if (RHYTHM_ANCHOR_ROLES.has(normalized)) return true;
  return normalized.split(/\s+/).some((token) => RHYTHM_ANCHOR_ROLES.has(token));
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
