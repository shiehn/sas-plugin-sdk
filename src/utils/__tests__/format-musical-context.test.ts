import { formatMusicalContext } from '../format-musical-context';
import type { MusicalContext } from '../../types/plugin-sdk.types';

const base: MusicalContext = {
  key: 'C',
  mode: 'minor',
  bpm: 120,
  bars: 4,
  genre: 'Techno',
  timeSignature: '4/4',
  chordProgression: [
    { symbol: 'Cm7', startQn: 0, endQn: 4 },
    { symbol: 'Ab', startQn: 4, endQn: 8 },
  ],
  contractPrompt: 'dark, driving',
};

describe('formatMusicalContext', () => {
  it('renders the fields that make a part fit the song', () => {
    const out = formatMusicalContext(base);
    expect(out).toContain('Musical Context:');
    expect(out).toContain('- Key: C minor');
    expect(out).toContain('- BPM: 120');
    expect(out).toContain('- Bars: 4 (clip = 16 quarter-note beats)');
    expect(out).toContain('- Genre: Techno');
    expect(out).toContain('- Chord Progression: Cm7 (beats 0-4), Ab (beats 4-8)');
    expect(out).toContain('- Scene Contract: dark, driving');
  });

  it('omits the time-signature line on 4/4', () => {
    // 4/4 scenes keep the byte-for-byte prompt panels produced before this
    // helper existed, so a shared formatter cannot regress their output
    expect(formatMusicalContext(base)).not.toContain('Time signature');
  });

  it('states the meter and bar length on odd meters', () => {
    const out = formatMusicalContext({ ...base, timeSignature: '7/8' });
    expect(out).toContain('- Time signature: 7/8 (each bar = 3.5 quarter notes)');
    expect(out).toContain('clip = 14 quarter-note beats');
  });

  it('drops absent optional fields rather than printing null', () => {
    const out = formatMusicalContext({
      ...base,
      genre: null,
      contractPrompt: null,
    });
    expect(out).not.toContain('Genre');
    expect(out).not.toContain('Scene Contract');
    expect(out).not.toContain('null');
  });

  it('can omit chords, for parts with no harmony to follow', () => {
    const out = formatMusicalContext(base, { includeChords: false });
    expect(out).not.toContain('Chord Progression');
    expect(out).toContain('- Key: C minor');
  });

  it('appends caller lines and skips falsy ones', () => {
    const out = formatMusicalContext(base, {
      extraLines: ['- Voices: 3', false, null, '- Rests: off'],
    });
    expect(out).toContain('- Voices: 3');
    expect(out).toContain('- Rests: off');
    expect(out).not.toContain('false');
  });

  it('falls back to sane numbers on an empty scene', () => {
    const out = formatMusicalContext({
      ...base,
      bars: 0,
      bpm: 0,
      chordProgression: [],
    });
    expect(out).toContain('- BPM: 120');
    expect(out).toContain('- Bars: 4');
    expect(out).not.toContain('Chord Progression');
  });
});
