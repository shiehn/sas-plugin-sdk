import { formatSongOrder, hasArrangementOutline, sectionsOfScene } from '../arrangement-outline';
import type { ArrangementOutline, PluginHost } from '../../types/plugin-sdk.types';

const OUTLINE: ArrangementOutline = {
  pickupBars: 2,
  sections: [
    { instanceId: 'i1', sceneId: 'verse', sceneName: 'Rain', role: 'verse', startBar: 1, bars: 8, occurrence: 1 },
    { instanceId: 'i2', sceneId: 'chorus', sceneName: 'Lift', startBar: 9, bars: 8, occurrence: 1 },
    { instanceId: 'i3', sceneId: 'verse', sceneName: 'Rain', label: 'Verse 2', role: 'verse', startBar: 17, bars: 8, occurrence: 2 },
    { instanceId: 'i4', sceneId: 'chorus', sceneName: 'Lift', startBar: 25, bars: 8, occurrence: 2 },
    { instanceId: 'i5', sceneId: 'out', sceneName: 'Out', startBar: 33, bars: 1, occurrence: 1 },
  ],
};

describe('hasArrangementOutline', () => {
  it('is true only when the host has the method', async () => {
    const host: Partial<PluginHost> = { getArrangementOutline: async () => null };
    expect(hasArrangementOutline(host)).toBe(true);
    if (hasArrangementOutline(host)) await expect(host.getArrangementOutline()).resolves.toBeNull();
    expect(hasArrangementOutline({})).toBe(false);
    expect(hasArrangementOutline(null)).toBe(false);
  });
});

describe('sectionsOfScene', () => {
  it('returns that scene\'s sections in song order', () => {
    expect(sectionsOfScene(OUTLINE, 'chorus').map((s) => s.instanceId)).toEqual(['i2', 'i4']);
    expect(sectionsOfScene(OUTLINE, 'nowhere')).toEqual([]);
    expect(sectionsOfScene(null, 'chorus')).toEqual([]);
  });
});

describe('formatSongOrder', () => {
  it('lists the song: pickup first, label > role > scene, numbered by occurrence, bars inclusive', () => {
    expect(formatSongOrder(OUTLINE, { currentSceneId: 'chorus' })).toBe(
      [
        'Pickup: 2 bars leading in to section 1',
        '1. Verse 1 · scene "Rain" · bars 1–8',
        '2. Lift 1 · bars 9–16 ← this scene',
        '3. Verse 2 · scene "Rain" · bars 17–24',
        '4. Lift 2 · bars 25–32 ← this scene',
        '5. Out · bar 33',
      ].join('\n'),
    );
  });

  it('says one pickup bar in the singular and leaves out a zero pickup', () => {
    const one = { ...OUTLINE, pickupBars: 1, sections: OUTLINE.sections.slice(4) };
    expect(formatSongOrder(one)).toBe('Pickup: 1 bar leading in to section 1\n1. Out · bar 33');
    expect(formatSongOrder({ ...one, pickupBars: 0 })).toBe('1. Out · bar 33');
  });

  it('is empty without an arrangement or sections', () => {
    expect(formatSongOrder(null)).toBe('');
    expect(formatSongOrder({ sections: [] })).toBe('');
  });
});
