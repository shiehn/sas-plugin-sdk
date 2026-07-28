/**
 * panel-core meter helpers (SDK 2.50.0) — the endTime/maxBeats math the
 * generator + transition hooks feed `writeMidiClip` with. 4/4 (and any
 * absent/garbage meter) must reproduce the legacy `(bars * 4 * 60) / bpm`
 * and `bars * 4` exactly.
 */
import { panelClipEndSeconds, panelMaxBeats, panelMeter } from '../meter';

describe('panelMeter', () => {
  it("returns the context's parse-legal meter", () => {
    expect(panelMeter({ timeSignature: '6/8' })).toBe('6/8');
    expect(panelMeter({ timeSignature: '15/8' })).toBe('15/8'); // parse-legal, uncurated
  });

  it("degrades absent/garbage meters to '4/4' instead of throwing", () => {
    expect(panelMeter({})).toBe('4/4');
    expect(panelMeter({ timeSignature: undefined })).toBe('4/4');
    expect(panelMeter({ timeSignature: '' })).toBe('4/4');
    expect(panelMeter({ timeSignature: 'waltz' })).toBe('4/4');
    expect(panelMeter({ timeSignature: '04/4' })).toBe('4/4');
  });
});

describe('panelClipEndSeconds', () => {
  it('reproduces the legacy (bars * 4 * 60) / bpm for 4/4 and meterless contexts', () => {
    expect(panelClipEndSeconds({ bars: 4, bpm: 120, timeSignature: '4/4' })).toBe((4 * 4 * 60) / 120);
    expect(panelClipEndSeconds({ bars: 8, bpm: 174 })).toBe((8 * 4 * 60) / 174);
  });

  it('sizes the clip window by the scene meter', () => {
    expect(panelClipEndSeconds({ bars: 4, bpm: 120, timeSignature: '3/4' })).toBe(6);
    expect(panelClipEndSeconds({ bars: 4, bpm: 120, timeSignature: '6/8' })).toBe(6);
    expect(panelClipEndSeconds({ bars: 2, bpm: 120, timeSignature: '7/8' })).toBe(3.5);
  });
});

describe('panelMaxBeats', () => {
  it('reproduces the legacy bars * 4 for 4/4 and meterless contexts', () => {
    expect(panelMaxBeats({ bars: 4, bpm: 120, timeSignature: '4/4' })).toBe(16);
    expect(panelMaxBeats({ bars: 16, bpm: 90 })).toBe(64);
  });

  it('counts quarter notes per the meter (fractional-safe for odd /8)', () => {
    expect(panelMaxBeats({ bars: 4, bpm: 120, timeSignature: '6/8' })).toBe(12);
    expect(panelMaxBeats({ bars: 2, bpm: 120, timeSignature: '7/8' })).toBe(7);
  });
});
