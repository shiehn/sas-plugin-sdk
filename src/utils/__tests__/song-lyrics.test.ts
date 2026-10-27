import {
  SONG_LYRICS_LIMITS,
  SONG_LYRICS_PATCH_KEYS,
  SONG_LYRICS_WRITE_FAILURES,
  SONG_ROLE_SUGGESTIONS,
  applySongDescription,
  applySongLyricsPatch,
  emptySongLyrics,
  hasSongLyrics,
  isSectionTakeStale,
  resolveSectionLines,
  songLinesSignature,
  songLyricsInOrder,
  type SongLyricsWriteContext,
  type SongLyricsWriteResult,
} from '../song-lyrics';
import type { ArrangementOutline, SongLyrics, SongLyricsSectionPatch, SongRole } from '../../types/plugin-sdk.types';

const OUTLINE: ArrangementOutline = {
  sections: [
    { instanceId: 'v1', sceneId: 'verse', sceneName: 'Rain', startBar: 1, bars: 8, occurrence: 1 },
    { instanceId: 'c1', sceneId: 'chorus', sceneName: 'Lift', startBar: 9, bars: 8, occurrence: 1 },
    { instanceId: 'v2', sceneId: 'verse', sceneName: 'Rain', label: 'Verse 2', startBar: 17, bars: 8, occurrence: 2 },
    { instanceId: 'c2', sceneId: 'chorus', sceneName: 'Lift', startBar: 25, bars: 8, occurrence: 2 },
    { instanceId: 'c3', sceneId: 'chorus', sceneName: 'Lift', startBar: 33, bars: 8, occurrence: 3 },
  ],
};
const CTX: SongLyricsWriteContext = { arrangementId: 'arr-1', placements: OUTLINE.sections, now: 1000 };

function ok(r: SongLyricsWriteResult) {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}: ${r.detail}`);
  return r;
}
function write(doc: SongLyrics | null, id: string, patch: SongLyricsSectionPatch, now = 1000) {
  return ok(applySongLyricsPatch(doc, { ...CTX, now }, id, patch)).doc;
}
function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.values(o as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}

describe('constants', () => {
  it('pins the caps the docs promise', () => {
    expect(SONG_LYRICS_LIMITS).toEqual({
      maxLinesPerSection: 64,
      maxLineChars: 300,
      maxHintsPerSection: 40,
      maxHintChars: 600,
      maxDescriptionChars: 2000,
      maxRoleChars: 40,
      maxSigChars: 256,
    });
  });

  it('lists every failure and patch field', () => {
    expect(SONG_LYRICS_WRITE_FAILURES).toHaveLength(9);
    expect([...SONG_LYRICS_PATCH_KEYS].sort()).toEqual(
      ['hints', 'lines', 'locks', 'renderedSig', 'role', 'sameAs', 'take', 'voiceTrackDbId'].sort(),
    );
  });

  it('suggests lower-case roles, and a role is free text', () => {
    for (const r of SONG_ROLE_SUGGESTIONS) expect(r).toBe(r.toLowerCase());
    const custom: SongRole = 'spoken-word tag';
    expect(custom).toBe('spoken-word tag');
  });
});

describe('hasSongLyrics', () => {
  const all = {
    getSongLyrics: async () => null,
    setSectionLyrics: async () => undefined,
    setSongDescription: async () => undefined,
    onSongLyricsChanged: () => () => undefined,
  };
  it('needs all four methods', () => {
    expect(hasSongLyrics(all)).toBe(true);
    expect(hasSongLyrics({ ...all, onSongLyricsChanged: undefined })).toBe(false);
    expect(hasSongLyrics({ getSongLyrics: all.getSongLyrics })).toBe(false);
    expect(hasSongLyrics(null)).toBe(false);
    expect(hasSongLyrics(undefined)).toBe(false);
  });
});

describe('songLinesSignature / isSectionTakeStale', () => {
  it('ignores case and spacing inside a line, not order or count', () => {
    const s = songLinesSignature(['The tide climbs', 'the tower']);
    expect(songLinesSignature(['  the TIDE   climbs ', 'the tower'])).toBe(s);
    expect(songLinesSignature(['the tower', 'The tide climbs'])).not.toBe(s);
    expect(songLinesSignature(['The tide climbs', 'the tower', ''])).not.toBe(s);
    expect(songLinesSignature([])).toMatch(/^sl1:[0-9a-f]{16}:0$/);
  });

  it('is stale only when rendered and the words moved since', () => {
    let doc = write(null, 'v1', { lines: ['a', 'b'] });
    expect(isSectionTakeStale(doc, 'v1')).toBe(false); // never rendered
    doc = write(doc, 'v1', { renderedSig: songLinesSignature(['a', 'b']), take: 0 });
    expect(isSectionTakeStale(doc, 'v1')).toBe(false);
    doc = write(doc, 'v1', { lines: ['a', 'c'] });
    expect(isSectionTakeStale(doc, 'v1')).toBe(true);
    expect(isSectionTakeStale(doc, 'nowhere')).toBe(false);
    expect(isSectionTakeStale(null, 'v1')).toBe(false);
  });
});

describe('reading', () => {
  it('resolves sameAs chains and falls back on a missing target or a loop', () => {
    const doc = emptySongLyrics('arr-1', 0);
    const sec = (lines: string[], sameAs?: string) => ({ sceneId: 'chorus', voiceTrackDbId: null, lines, locks: [], hints: [], ...(sameAs ? { sameAs } : {}) });
    doc.sections = { c1: sec(['hook']), c2: sec(['stale'], 'c1'), c3: sec(['stale'], 'c2'), x: sec(['own'], 'gone'), l1: sec(['l1'], 'l2'), l2: sec(['l2'], 'l1') };
    expect(resolveSectionLines(doc, 'c3')).toEqual(['hook']);
    expect(resolveSectionLines(doc, 'x')).toEqual(['own']);
    expect(resolveSectionLines(doc, 'l1')).toEqual(['l2']);
    expect(resolveSectionLines(doc, 'missing')).toEqual([]);
    expect(resolveSectionLines(null, 'c1')).toEqual([]);
  });

  it('lists the song in play order with each placement\'s words', () => {
    const doc = write(write(null, 'c1', { lines: ['hook'] }), 'c2', { sameAs: 'c1' });
    const order = songLyricsInOrder(OUTLINE, doc);
    expect(order.map((o) => [o.section.instanceId, o.lines])).toEqual([
      ['v1', []],
      ['c1', ['hook']],
      ['v2', []],
      ['c2', ['hook']],
      ['c3', []],
    ]);
    expect(order[0].lyrics).toBeNull();
    expect(songLyricsInOrder(null, doc)).toEqual([]);
  });
});

describe('applySongLyricsPatch: shape', () => {
  it('needs an arrangement and a placed section', () => {
    expect(applySongLyricsPatch(null, { ...CTX, arrangementId: null }, 'v1', { lines: ['a'] })).toMatchObject({ ok: false, reason: 'no-arrangement' });
    expect(applySongLyricsPatch(null, CTX, 'gone', { lines: ['a'] })).toMatchObject({ ok: false, reason: 'unknown-section' });
  });

  it('refuses unknown fields, so a renamed field fails loudly', () => {
    const r = applySongLyricsPatch(null, CTX, 'v1', { locked: [0] } as unknown as SongLyricsSectionPatch);
    expect(r).toMatchObject({ ok: false, reason: 'invalid-patch', detail: 'Unknown field "locked"' });
    expect(applySongLyricsPatch(null, CTX, 'v1', null as unknown as SongLyricsSectionPatch)).toMatchObject({ ok: false, reason: 'invalid-patch' });
  });

  it.each<[SongLyricsSectionPatch, string]>([
    [{ lines: 'a' as unknown as string[] }, 'invalid-patch'],
    [{ lines: ['a', 3 as unknown as string] }, 'invalid-patch'],
    [{ lines: ['one\ntwo'] }, 'invalid-patch'],
    [{ lines: Array(65).fill('x') }, 'too-long'],
    [{ lines: ['x'.repeat(301)] }, 'too-long'],
    [{ locks: [-1] }, 'invalid-patch'],
    [{ locks: [0.5] }, 'invalid-patch'],
    [{ hints: [{ role: 'system' as 'user', text: 'x', at: 1 }] }, 'invalid-patch'],
    [{ hints: [{ role: 'user', text: 'x', at: NaN }] }, 'invalid-patch'],
    [{ role: 7 as unknown as string }, 'invalid-patch'],
    [{ role: 'r'.repeat(41) }, 'too-long'],
    [{ sameAs: '' }, 'invalid-patch'],
    [{ take: -1 }, 'invalid-patch'],
    [{ take: 1.5 }, 'invalid-patch'],
    [{ renderedSig: 's'.repeat(257) }, 'too-long'],
    [{ voiceTrackDbId: '' }, 'invalid-patch'],
  ])('refuses %j (%s)', (patch, reason) => {
    expect(applySongLyricsPatch(null, CTX, 'v1', patch)).toMatchObject({ ok: false, reason });
  });

  it('accepts the caps exactly', () => {
    expect(applySongLyricsPatch(null, CTX, 'v1', { lines: Array(64).fill('x'.repeat(300)) }).ok).toBe(true);
  });
});

describe('applySongLyricsPatch: writing', () => {
  it('creates the document and the section on first write', () => {
    const r = ok(applySongLyricsPatch(null, CTX, 'v2', { lines: ['Rain on the harbour', 'Lights on the tide'], role: '  Verse ' }));
    expect(r.changed).toBe(true);
    expect(r.change).toEqual({ instanceIds: ['v2'] });
    expect(r.doc).toEqual({
      version: 1,
      arrangementId: 'arr-1',
      description: '',
      spare: [],
      updatedAt: 1000,
      sections: {
        v2: { sceneId: 'verse', voiceTrackDbId: null, role: 'verse', lines: ['Rain on the harbour', 'Lights on the tide'], locks: [], hints: [], writtenAt: 1000 },
      },
    });
  });

  it('changes only the fields given, null clears, and never mutates its input', () => {
    const doc = deepFreeze(write(null, 'v1', { lines: ['a', 'b', 'c'], role: 'verse', take: 2, renderedSig: 'sig', voiceTrackDbId: 't1' }));
    const next = write(doc, 'v1', { role: null, take: null, renderedSig: null, voiceTrackDbId: null }, 2000);
    expect(next.sections.v1).toEqual({ sceneId: 'verse', voiceTrackDbId: null, lines: ['a', 'b', 'c'], locks: [], hints: [], writtenAt: 1000 });
    expect(next.updatedAt).toBe(2000);
    expect(doc.sections.v1.role).toBe('verse');
    expect(write(doc, 'v1', { role: '' }).sections.v1.role).toBeUndefined();
  });

  it('keeps locks sorted, unique and inside the lines, also when the lines shrink', () => {
    let doc = write(null, 'v1', { lines: ['a', 'b', 'c', 'd'], locks: [3, 1, 1, 9] });
    expect(doc.sections.v1.locks).toEqual([1, 3]);
    doc = write(doc, 'v1', { lines: ['a', 'b'] });
    expect(doc.sections.v1.locks).toEqual([1]);
  });

  it('keeps the latest hints and cuts long ones', () => {
    const hints = Array.from({ length: 45 }, (_, i) => ({ role: (i % 2 ? 'model' : 'user') as 'user' | 'model', text: `h${i}`, at: i }));
    hints[44] = { role: 'user', text: 'y'.repeat(700), at: 44 };
    const s = write(null, 'v1', { hints }).sections.v1;
    expect(s.hints).toHaveLength(40);
    expect(s.hints[0].text).toBe('h5');
    expect(s.hints[39].text).toHaveLength(600);
  });

  it('reports no change for an empty patch or the same values', () => {
    const doc = write(null, 'v1', { lines: ['a'], role: 'verse' });
    const same = ok(applySongLyricsPatch(doc, { ...CTX, now: 5000 }, 'v1', { lines: ['a'], role: 'Verse' }));
    expect(same).toMatchObject({ changed: false, change: {} });
    expect(same.doc).toBe(doc);
    expect(ok(applySongLyricsPatch(doc, CTX, 'v1', {})).changed).toBe(false);
    expect(ok(applySongLyricsPatch(null, CTX, 'v1', {})).changed).toBe(false);
  });

  it('moves writtenAt only when the lines change', () => {
    let doc = write(null, 'v1', { role: 'verse' }, 1000);
    expect(doc.sections.v1.writtenAt).toBeUndefined();
    doc = write(doc, 'v1', { lines: ['a'] }, 2000);
    doc = write(doc, 'v1', { take: 0 }, 3000);
    expect(doc.sections.v1.writtenAt).toBe(2000);
  });
});

describe('applySongLyricsPatch: sameAs', () => {
  const base = () => write(null, 'c1', { lines: ['Hold the light', 'hold it high'] });

  it('mirrors the repeated section\'s lines', () => {
    const r = ok(applySongLyricsPatch(base(), CTX, 'c2', { sameAs: 'c1', role: 'chorus' }));
    expect(r.doc.sections.c2).toMatchObject({ sameAs: 'c1', lines: ['Hold the light', 'hold it high'], role: 'chorus' });
  });

  it('refuses itself, an unplaced section, another scene, and a loop', () => {
    const doc = write(base(), 'c2', { sameAs: 'c1' });
    expect(applySongLyricsPatch(doc, CTX, 'c1', { sameAs: 'c1' })).toMatchObject({ ok: false, reason: 'same-as-unknown' });
    expect(applySongLyricsPatch(doc, CTX, 'c1', { sameAs: 'gone' })).toMatchObject({ ok: false, reason: 'same-as-unknown' });
    expect(applySongLyricsPatch(doc, CTX, 'v1', { sameAs: 'c1' })).toMatchObject({ ok: false, reason: 'same-as-other-scene' });
    expect(applySongLyricsPatch(doc, CTX, 'c1', { sameAs: 'c2' })).toMatchObject({ ok: false, reason: 'same-as-cycle' });
    const deeper = write(doc, 'c3', { sameAs: 'c2' });
    expect(applySongLyricsPatch(deeper, CTX, 'c1', { sameAs: 'c3' })).toMatchObject({ ok: false, reason: 'same-as-cycle' });
  });

  it('refuses lines on a repeat unless the same patch clears sameAs (make it unique)', () => {
    const doc = write(base(), 'c2', { sameAs: 'c1' });
    expect(applySongLyricsPatch(doc, CTX, 'c2', { lines: ['new'] })).toMatchObject({ ok: false, reason: 'same-as-lines' });
    const unique = write(doc, 'c2', { sameAs: null, lines: ['Let the light go'] });
    expect(unique.sections.c2.sameAs).toBeUndefined();
    expect(unique.sections.c2.lines).toEqual(['Let the light go']);
    const kept = write(doc, 'c2', { sameAs: null });
    expect(kept.sections.c2.lines).toEqual(['Hold the light', 'hold it high']);
  });

  it('carries a rewrite to every repeat, at any depth, and lists them', () => {
    let doc = write(write(base(), 'c2', { sameAs: 'c1' }), 'c3', { sameAs: 'c2' });
    const r = ok(applySongLyricsPatch(doc, { ...CTX, now: 7000 }, 'c1', { lines: ['Hold the line'] }));
    doc = r.doc;
    expect(r.change.instanceIds).toEqual(['c1', 'c2', 'c3']);
    expect(doc.sections.c2.lines).toEqual(['Hold the line']);
    expect(doc.sections.c3.lines).toEqual(['Hold the line']);
    expect(doc.sections.c3.writtenAt).toBe(7000);
  });
});

describe('applySongDescription', () => {
  it('trims, clears, caps and reports no-ops', () => {
    const r = ok(applySongDescription(null, CTX, '  a late-night confession  '));
    expect(r.doc.description).toBe('a late-night confession');
    expect(r.change).toEqual({ description: true });
    expect(ok(applySongDescription(r.doc, CTX, 'a late-night confession')).changed).toBe(false);
    expect(ok(applySongDescription(r.doc, CTX, '')).doc.description).toBe('');
    expect(ok(applySongDescription(null, CTX, '   ')).changed).toBe(false);
    expect(applySongDescription(null, CTX, 'x'.repeat(2001))).toMatchObject({ ok: false, reason: 'too-long' });
    expect(applySongDescription(null, { ...CTX, arrangementId: null }, 'x')).toMatchObject({ ok: false, reason: 'no-arrangement' });
    expect(applySongDescription(null, CTX, 3 as unknown as string)).toMatchObject({ ok: false, reason: 'invalid-patch' });
  });
});
