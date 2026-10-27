import { createSongLyricsTestHost } from '../song-lyrics-test-host';
import { hasSongLyrics } from '../song-lyrics';
import { PluginError } from '../../types/plugin-sdk.types';
import type { ArrangementOutline, PluginHost } from '../../types/plugin-sdk.types';

const OUTLINE: ArrangementOutline = {
  sections: [
    { instanceId: 'v1', sceneId: 'verse', sceneName: 'Rain', startBar: 1, bars: 8, occurrence: 1 },
    { instanceId: 'c1', sceneId: 'chorus', sceneName: 'Lift', startBar: 9, bars: 8, occurrence: 1 },
  ],
};

async function rejection(p: Promise<unknown>): Promise<PluginError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof PluginError) return e;
    throw e;
  }
  throw new Error('expected a rejection');
}

describe('createSongLyricsTestHost', () => {
  it('is a song-lyrics host that fits a PluginHost', () => {
    const { host } = createSongLyricsTestHost();
    const asHost: Partial<PluginHost> = host;
    expect(hasSongLyrics(asHost)).toBe(true);
  });

  it('starts empty, writes, and hands out copies', async () => {
    const t = createSongLyricsTestHost({ outline: OUTLINE, now: () => 42 });
    expect(await t.host.getSongLyrics()).toBeNull();
    await t.host.setSectionLyrics('v1', { lines: ['Rain on the harbour'] });
    const doc = await t.host.getSongLyrics();
    expect(doc?.sections.v1.lines).toEqual(['Rain on the harbour']);
    doc!.sections.v1.lines.push('leak');
    expect(t.document()?.sections.v1.lines).toEqual(['Rain on the harbour']);
    expect(await t.host.getArrangementOutline()).toEqual(OUTLINE);
  });

  it('tells listeners who wrote what, and stops after unsubscribe', async () => {
    const t = createSongLyricsTestHost({ outline: OUTLINE, pluginId: 'synthv' });
    const seen: unknown[] = [];
    const off = t.host.onSongLyricsChanged((doc, change) => seen.push([doc?.description, change]));
    await t.host.setSongDescription('a confession');
    t.hostWrite('c1', { lines: ['Hold the light'] });
    await t.host.setSectionLyrics('c1', { lines: ['Hold the light'] }); // no change: no event
    off();
    await t.host.setSongDescription('another');
    expect(seen).toEqual([
      ['a confession', { description: true, byPluginId: 'synthv' }],
      ['a confession', { instanceIds: ['c1'] }],
    ]);
    expect(t.events).toHaveLength(3);
  });

  it('rejects with PluginError VALIDATION_ERROR and the reason', async () => {
    const t = createSongLyricsTestHost({ outline: OUTLINE });
    const e = await rejection(t.host.setSectionLyrics('gone', { lines: ['x'] }));
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.details).toEqual({ reason: 'unknown-section' });
    const none = createSongLyricsTestHost({ arrangementId: null });
    expect((await rejection(none.host.setSongDescription('x'))).details).toEqual({ reason: 'no-arrangement' });
    expect(await none.host.getArrangementOutline()).toBeNull();
  });

  describe('ownership', () => {
    const make = () =>
      createSongLyricsTestHost({
        outline: OUTLINE,
        pluginId: 'synthv',
        ownedTrackDbIds: ['mine'],
        otherTrackOwners: { theirs: 'other-vocal' },
      });

    it('claims a section only with a track this plugin owns', async () => {
      const t = make();
      await t.host.setSectionLyrics('v1', { voiceTrackDbId: 'mine' });
      expect(t.document()?.sections.v1.voiceTrackDbId).toBe('mine');
      for (const id of ['theirs', 'nobody']) {
        const e = await rejection(t.host.setSectionLyrics('c1', { voiceTrackDbId: id }));
        expect(e.code).toBe('NOT_OWNED');
        expect(e.details).toEqual({ reason: 'not-owned' });
      }
    });

    it('can\'t write a section another plugin\'s track sings, until that track is gone', async () => {
      const t = createSongLyricsTestHost({ outline: OUTLINE, pluginId: 'synthv', otherTrackOwners: { theirs: 'other-vocal' } });
      t.hostWrite('c1', { voiceTrackDbId: 'theirs', lines: ['their words'] });
      expect((await rejection(t.host.setSectionLyrics('c1', { lines: ['mine'] }))).code).toBe('NOT_OWNED');
      expect((await rejection(t.host.setSectionLyrics('c1', { voiceTrackDbId: null }))).code).toBe('NOT_OWNED');
      const gone = createSongLyricsTestHost({ outline: OUTLINE, pluginId: 'synthv', doc: t.document() });
      await gone.host.setSectionLyrics('c1', { lines: ['mine now'] });
      expect(gone.document()?.sections.c1.lines).toEqual(['mine now']);
    });
  });

  it('unbinds to null and rebinds with a new outline', async () => {
    const t = createSongLyricsTestHost({ outline: OUTLINE });
    await t.host.setSongDescription('x');
    const seen: unknown[] = [];
    t.host.onSongLyricsChanged((doc) => seen.push(doc));
    t.unbind();
    expect(seen).toEqual([null]);
    expect(await t.host.getSongLyrics()).toBeNull();
    t.setOutline(OUTLINE, 'arr-2');
    await t.host.setSectionLyrics('v1', { lines: ['fresh'] });
    expect(t.document()?.arrangementId).toBe('arr-2');
  });
});
