/**
 * Render the scene's musical context as the prompt block every generating
 * panel needs.
 *
 * Key, tempo, meter, chords and the scene contract are what make a generated
 * part fit the song rather than merely fit its own track, so each panel has
 * been hand-rolling the same list of lines. Same information, slightly
 * different wording per plugin, and a new panel has to rediscover which
 * fields matter — `contractPrompt` especially, which is easy to miss.
 *
 * The chord line is rendered in quarter-note beats to match
 * `PluginChordTiming`, and the time-signature line appears ONLY for non-4/4
 * scenes, matching the convention the panels already follow.
 */

import type { MusicalContext } from '../types/plugin-sdk.types';
import { panelQuarterNotesPerBar } from '../panel-core/meter';

export interface FormatMusicalContextOptions {
  /** Heading line. Defaults to 'Musical Context:'. */
  heading?: string;
  /**
   * Extra lines appended inside the block (e.g. panel-specific settings).
   * Falsy entries are dropped, so callers can inline conditionals.
   */
  extraLines?: (string | null | undefined | false)[];
  /**
   * Omit the chord progression. For percussion roles chords are noise the
   * model does not need — an unpitched part has no harmony to follow.
   */
  includeChords?: boolean;
}

export function formatMusicalContext(
  musical: MusicalContext,
  options: FormatMusicalContextOptions = {},
): string {
  const {
    heading = 'Musical Context:',
    extraLines = [],
    includeChords = true,
  } = options;

  const bars = musical.bars > 0 ? musical.bars : 4;
  const bpm = musical.bpm > 0 ? musical.bpm : 120;
  const qnPerBar = panelQuarterNotesPerBar(musical);
  const meter = musical.timeSignature || '4/4';

  const chordText = (musical.chordProgression ?? [])
    .map((c) => `${c.symbol} (beats ${c.startQn}-${c.endQn})`)
    .join(', ');

  const lines: (string | null | undefined | false)[] = [
    heading,
    `- Key: ${musical.key} ${musical.mode}`,
    `- BPM: ${bpm}`,
    `- Bars: ${bars} (clip = ${bars * qnPerBar} quarter-note beats)`,
    meter !== '4/4'
      ? `- Time signature: ${meter} (each bar = ${qnPerBar} quarter notes)`
      : null,
    musical.genre ? `- Genre: ${musical.genre}` : null,
    includeChords && chordText ? `- Chord Progression: ${chordText}` : null,
    musical.contractPrompt ? `- Scene Contract: ${musical.contractPrompt}` : null,
    ...extraLines,
  ];

  return lines.filter(Boolean).join('\n');
}
