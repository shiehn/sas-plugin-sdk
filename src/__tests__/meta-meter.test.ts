/**
 * Meter cases for the transition curve builders (SDK 2.50.0).
 *
 * The load-bearing assertions are the OMITTED-param identities: with no
 * `timeSignature` the builders must reproduce the legacy
 * `(bars * 4 * 60) / max(1, bpm)` window byte-for-byte — that is the
 * dark-ship contract for every existing 4/4 project.
 */
import { buildCrossfadeVolumeCurves } from '../crossfade-meta';
import { buildFadeVolumeCurve } from '../fade-meta';
import { barsToSeconds } from '../utils/time-signature';

const lastTime = (points: Array<{ time: number }>): number => points[points.length - 1].time;

describe('buildCrossfadeVolumeCurves — meter', () => {
  it('omitted meter is byte-identical to the explicit-4/4 and legacy windows', () => {
    const legacy = buildCrossfadeVolumeCurves(4, 120, 0.5);
    const explicit = buildCrossfadeVolumeCurves(4, 120, 0.5, 32, '4/4');
    expect(explicit).toEqual(legacy);
    expect(lastTime(legacy.origin)).toBe((4 * 4 * 60) / 120); // 8s
  });

  it('3/4 shrinks the window to bars × 3 qn', () => {
    const curves = buildCrossfadeVolumeCurves(4, 120, 0.5, 32, '3/4');
    expect(lastTime(curves.origin)).toBe(6); // 4 bars × 3 qn × 0.5s
    expect(lastTime(curves.target)).toBe(6);
    expect(curves.origin).toHaveLength(33); // steps unchanged
  });

  it('7/8 is fractional-safe (3.5 qn per bar)', () => {
    const curves = buildCrossfadeVolumeCurves(2, 120, 0.5, 32, '7/8');
    expect(lastTime(curves.origin)).toBe(barsToSeconds(2, 120, '7/8')); // 3.5s
  });

  it('only the time axis changes with meter — the dB shape is identical', () => {
    const m44 = buildCrossfadeVolumeCurves(4, 120, 0.3, 32, '4/4');
    const m68 = buildCrossfadeVolumeCurves(4, 120, 0.3, 32, '6/8');
    expect(m68.origin.map((p) => p.db)).toEqual(m44.origin.map((p) => p.db));
    expect(m68.target.map((p) => p.db)).toEqual(m44.target.map((p) => p.db));
  });
});

describe('buildFadeVolumeCurve — meter', () => {
  it('omitted meter is byte-identical to explicit 4/4 (volume + build gestures)', () => {
    expect(buildFadeVolumeCurve(4, 120, 'out', 0.5, 'volume')).toEqual(
      buildFadeVolumeCurve(4, 120, 'out', 0.5, 'volume', 32, '4/4'),
    );
    expect(buildFadeVolumeCurve(4, 120, 'in', 0.5, 'build')).toEqual(
      buildFadeVolumeCurve(4, 120, 'in', 0.5, 'build', 32, '4/4'),
    );
  });

  it('6/8 sizes the window like 3/4 (durationally identical meters)', () => {
    const p68 = buildFadeVolumeCurve(4, 120, 'out', 0.5, 'volume', 32, '6/8');
    const p34 = buildFadeVolumeCurve(4, 120, 'out', 0.5, 'volume', 32, '3/4');
    expect(p68).toEqual(p34);
    expect(lastTime(p68)).toBe(6);
  });

  it('build gesture stays a flat 2-point unity line spanning the meter window', () => {
    const points = buildFadeVolumeCurve(2, 100, 'in', 0.5, 'build', 32, '12/8');
    expect(points).toEqual([
      { time: 0, db: 0 },
      { time: Math.round(barsToSeconds(2, 100, '12/8') * 1000) / 1000, db: 0 },
    ]);
  });

  it('fade halves still equal the crossfade halves under a meter', () => {
    const curves = buildCrossfadeVolumeCurves(4, 120, 0.5, 32, '3/4');
    expect(buildFadeVolumeCurve(4, 120, 'out', 0.5, 'volume', 32, '3/4')).toEqual(curves.origin);
    expect(buildFadeVolumeCurve(4, 120, 'in', 0.5, 'volume', 32, '3/4')).toEqual(curves.target);
  });
});
