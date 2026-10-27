import {
  TRACK_ONSETS_BUSY_REASONS,
  TRACK_ONSETS_LIMITS,
  finishTrackOnsets,
  hasSceneAudioTracks,
  hasTrackOnsets,
  resolveTrackOnsetsMaxCount,
} from '../track-onsets';
import type { PluginHost, SceneAudioTrackSummary, TrackOnsets } from '../../types/plugin-sdk.types';

const BASE = { sampleRate: 44100, durationSec: 4, bpm: 120 };

describe('hasTrackOnsets', () => {
  it('needs the method', () => {
    expect(hasTrackOnsets(null)).toBe(false);
    expect(hasTrackOnsets({})).toBe(false);
    const reading: TrackOnsets = { source: 'audio', ...BASE, onsets: [], truncated: false };
    const host: Partial<PluginHost> = { readTrackOnsets: async () => reading };
    expect(hasTrackOnsets(host)).toBe(true);
  });
});

describe('hasSceneAudioTracks', () => {
  it('needs the method, and listSceneTracks alone is not enough', () => {
    expect(hasSceneAudioTracks(undefined)).toBe(false);
    const midiOnly: Partial<PluginHost> = { listSceneTracks: async () => [] };
    expect(hasSceneAudioTracks(midiOnly)).toBe(false);
    const loop: SceneAudioTrackSummary = { dbId: 's1', name: 'Splice drums 140', kind: 'sample', category: 'drums', tags: ['loop'] };
    const host: Partial<PluginHost> = { listSceneAudioTracks: async () => [loop] };
    expect(hasSceneAudioTracks(host)).toBe(true);
  });
});

describe('TRACK_ONSETS_BUSY_REASONS', () => {
  it('names the two busy reasons a host rejects with', () => {
    expect([...TRACK_ONSETS_BUSY_REASONS]).toEqual(['TRANSPORT_PLAYING', 'TRANSITION_RENDER_IN_PROGRESS']);
  });
});

describe('resolveTrackOnsetsMaxCount', () => {
  it('defaults, accepts integers in range, refuses the rest', () => {
    expect(resolveTrackOnsetsMaxCount()).toBe(TRACK_ONSETS_LIMITS.defaultMaxCount);
    expect(resolveTrackOnsetsMaxCount({})).toBe(TRACK_ONSETS_LIMITS.defaultMaxCount);
    expect(resolveTrackOnsetsMaxCount({ maxCount: 1 })).toBe(1);
    expect(resolveTrackOnsetsMaxCount({ maxCount: TRACK_ONSETS_LIMITS.maxCount })).toBe(TRACK_ONSETS_LIMITS.maxCount);
    for (const bad of [0, -1, 2.5, NaN, Infinity, TRACK_ONSETS_LIMITS.maxCount + 1, '8' as unknown as number]) {
      expect(resolveTrackOnsetsMaxCount({ maxCount: bad })).toBeNull();
    }
  });
});

describe('finishTrackOnsets', () => {
  it('sorts, counts beats at the scene tempo, and scales strength to the loudest', () => {
    const r = finishTrackOnsets({ ...BASE, times: [1.5, 0, 1], strengths: [2, 8, 4] });
    expect(r).toEqual({
      source: 'audio',
      ...BASE,
      truncated: false,
      onsets: [
        { timeSec: 0, beat: 0, strength: 1 },
        { timeSec: 1, beat: 2, strength: 0.5 },
        { timeSec: 1.5, beat: 3, strength: 0.25 },
      ],
    });
  });

  it('reads a half-time backbeat: 140 bpm, snare on beat 3', () => {
    const beatSec = 60 / 140;
    const times = [0, 2 * beatSec, 4 * beatSec, 6 * beatSec];
    const r = finishTrackOnsets({ sampleRate: 48000, durationSec: 8 * beatSec, bpm: 140, times, strengths: [1, 0.9, 1, 0.9] });
    expect(r.onsets.map((o) => o.beat)).toEqual([0, 2, 4, 6]);
  });

  it('drops times outside one loop and non-finite ones', () => {
    const r = finishTrackOnsets({ ...BASE, times: [-0.1, 0.5, 4, 9, NaN, Infinity] });
    expect(r.onsets.map((o) => o.timeSec)).toEqual([0.5]);
  });

  it('treats missing strengths as equal, and all-zero strengths as equal', () => {
    expect(finishTrackOnsets({ ...BASE, times: [0, 1] }).onsets.map((o) => o.strength)).toEqual([1, 1]);
    expect(finishTrackOnsets({ ...BASE, times: [0, 1], strengths: [0, -3] }).onsets.map((o) => o.strength)).toEqual([1, 1]);
    expect(finishTrackOnsets({ ...BASE, times: [0, 1, 2], strengths: [4] }).onsets.map((o) => o.strength)).toEqual([1, 0.25, 0.25]);
    expect(finishTrackOnsets({ ...BASE, times: [0, 1], strengths: [2, NaN] }).onsets.map((o) => o.strength)).toEqual([1, 0]);
  });

  it('merges hits under 1 ms apart, keeping the stronger', () => {
    const r = finishTrackOnsets({ ...BASE, times: [1, 1.0004, 2], strengths: [1, 3, 3] });
    expect(r.onsets).toEqual([
      { timeSec: 1, beat: 2, strength: 1 },
      { timeSec: 2, beat: 4, strength: 1 },
    ]);
  });

  it('keeps the strongest past maxCount, in time order, earlier first on a tie', () => {
    const r = finishTrackOnsets({ ...BASE, times: [0, 0.5, 1, 1.5, 2], strengths: [1, 5, 1, 5, 3] }, { maxCount: 3 });
    expect(r.truncated).toBe(true);
    expect(r.onsets.map((o) => o.timeSec)).toEqual([0.5, 1.5, 2]);
    const tie = finishTrackOnsets({ ...BASE, times: [0, 1, 2] }, { maxCount: 2 });
    expect(tie.onsets.map((o) => o.timeSec)).toEqual([0, 1]);
    expect(finishTrackOnsets({ ...BASE, times: [0, 1] }, { maxCount: 2 }).truncated).toBe(false);
  });

  it('rounds timeSec and strength to 3 places, beat to 4', () => {
    const r = finishTrackOnsets({ ...BASE, bpm: 137, times: [0.123456, 1], strengths: [1, 3] });
    expect(r.onsets[0]).toEqual({ timeSec: 0.123, beat: 0.2819, strength: 0.333 });
  });

  it('reads an empty or silent track as no onsets', () => {
    expect(finishTrackOnsets({ ...BASE, times: [] }).onsets).toEqual([]);
    expect(finishTrackOnsets({ ...BASE, durationSec: 0, times: [0] }).onsets).toEqual([]);
  });

  it('throws on host bugs', () => {
    expect(() => finishTrackOnsets({ ...BASE, bpm: 0, times: [] })).toThrow(RangeError);
    expect(() => finishTrackOnsets({ ...BASE, sampleRate: NaN, times: [] })).toThrow(RangeError);
    expect(() => finishTrackOnsets({ ...BASE, durationSec: -1, times: [] })).toThrow(RangeError);
    expect(() => finishTrackOnsets({ ...BASE, times: [] }, { maxCount: 0 })).toThrow(RangeError);
  });

  it('does not touch its input', () => {
    const times = [1, 0];
    const strengths = [1, 2];
    finishTrackOnsets({ ...BASE, times, strengths }, { maxCount: 1 });
    expect(times).toEqual([1, 0]);
    expect(strengths).toEqual([1, 2]);
  });
});
