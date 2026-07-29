/**
 * buildPluginMeterGuidance (SDK 2.50.0) — the per-meter-family prompt
 * guidance plugins append on non-4/4 scenes.
 *
 * The load-bearing contract: '4/4' (and unparseable input) returns EMPTY
 * strings, because every plugin's integration is "append only when
 * non-empty" — that is what keeps 4/4 prompts byte-identical.
 */
import {
  buildPluginMeterGuidance,
  formatPluginMeterGuidance,
} from '../meter-prompt';
import { ALLOWED_TIME_SIGNATURES } from '../../utils/time-signature';

describe('buildPluginMeterGuidance', () => {
  it("returns EMPTY strings for '4/4' (the byte-identity contract)", () => {
    expect(buildPluginMeterGuidance('4/4')).toEqual({
      rhythm: '',
      grouping: '',
      barArithmetic: '',
    });
  });

  it('returns EMPTY strings for unparseable input (panels degrade to 4/4)', () => {
    for (const bad of ['', 'waltz', '04/4', '4/4 ', '4/5']) {
      expect(buildPluginMeterGuidance(bad)).toEqual({
        rhythm: '',
        grouping: '',
        barArithmetic: '',
      });
    }
  });

  it('produces non-empty guidance for every curated non-4/4 meter', () => {
    for (const ts of ALLOWED_TIME_SIGNATURES) {
      if (ts === '4/4') continue;
      const g = buildPluginMeterGuidance(ts);
      expect(g.rhythm.length).toBeGreaterThan(0);
      expect(g.grouping.length).toBeGreaterThan(0);
      expect(g.barArithmetic.length).toBeGreaterThan(0);
      // Every field names the meter it describes at least once overall.
      expect(`${g.rhythm} ${g.grouping} ${g.barArithmetic}`).toContain(ts);
    }
  });

  it('3/4 is the waltz: no beats-2-and-4 backbeat, never 4-on-the-floor', () => {
    const g = buildPluginMeterGuidance('3/4');
    expect(g.rhythm).toContain('waltz');
    expect(g.rhythm).toContain('NO beats-2-and-4 backbeat');
    expect(g.rhythm).toContain('4-on-the-floor');
    expect(g.barArithmetic).toContain('3 quarter notes');
  });

  it('2/4 is the march with beat 2 as the backbeat', () => {
    const g = buildPluginMeterGuidance('2/4');
    expect(g.rhythm).toContain('march');
    expect(g.rhythm).toContain('beat 2 the march backbeat');
    expect(g.barArithmetic).toContain('2 quarter notes');
  });

  it('6/8 is compound duple: second-pulse backbeat (slot 4, 1.5 qn) + threes', () => {
    const g = buildPluginMeterGuidance('6/8');
    expect(g.rhythm).toContain('compound duple');
    expect(g.rhythm).toContain('SECOND pulse');
    expect(g.rhythm).toContain('slot 4');
    expect(g.rhythm).toContain('1.5 qn');
    expect(g.rhythm).toContain('threes');
    expect(g.grouping).toContain('3+3');
    expect(g.barArithmetic).toContain('one slot = one eighth note = 0.5 qn');
  });

  it('9/8 is compound triple: three pulses on slots 1, 4 and 7', () => {
    const g = buildPluginMeterGuidance('9/8');
    expect(g.rhythm).toContain('compound triple');
    expect(g.rhythm).toContain('THREE dotted pulses');
    expect(g.rhythm).toContain('1, 4 and 7');
    expect(g.grouping).toContain('3+3+3');
  });

  it('12/8 is the shuffle: four pulses, swung-4/4 feel, backbeat analogue on slots 4 and 10', () => {
    const g = buildPluginMeterGuidance('12/8');
    expect(g.rhythm).toContain('shuffle');
    expect(g.rhythm).toContain('swung 4/4');
    expect(g.rhythm).toContain('slots 4 and 10');
    expect(g.grouping).toContain('3+3+3+3');
  });

  it('odd /4 meters anchor the stated grouping (5/4 → 3+2, beats 1 and 4)', () => {
    const g = buildPluginMeterGuidance('5/4');
    expect(g.rhythm).toContain('3+2');
    expect(g.rhythm).toContain('1 and 4');
    expect(g.rhythm).toContain('backbeat analogue');
    expect(g.grouping).toContain('grouped 3+2');
    expect(g.barArithmetic).toContain('5 quarter notes');
  });

  it('asymmetric /8 meters state grouping + qn offsets (7/8 → 2+2+3; slots 1, 3 and 5)', () => {
    const g = buildPluginMeterGuidance('7/8');
    expect(g.rhythm).toContain('2+2+3');
    expect(g.rhythm).toContain('1, 3 and 5');
    expect(g.rhythm).toContain('do NOT even them out');
    expect(g.grouping).toContain('0, 1 and 2 qn into the bar');
    expect(g.barArithmetic).toContain('3.5 quarter notes');
  });

  it('5/8 groups 2+3 with group starts on slots 1 and 3', () => {
    const g = buildPluginMeterGuidance('5/8');
    expect(g.rhythm).toContain('2+3');
    expect(g.grouping).toContain('slots 1 and 3');
    expect(g.barArithmetic).toContain('2.5 quarter notes');
  });

  it('bar arithmetic states the startBeat math (bar N cover formula)', () => {
    const g = buildPluginMeterGuidance('6/4');
    expect(g.barArithmetic).toContain('6×(N−1)');
    expect(g.barArithmetic).toContain('up to 6×N');
  });
});

describe('formatPluginMeterGuidance', () => {
  it("renders '' for 4/4 so callers can append unconditionally", () => {
    expect(formatPluginMeterGuidance('4/4')).toBe('');
    expect(formatPluginMeterGuidance('garbage')).toBe('');
  });

  it('renders a heading + the three guidance lines for non-4/4', () => {
    const text = formatPluginMeterGuidance('6/8');
    const g = buildPluginMeterGuidance('6/8');
    expect(text.startsWith('Time signature 6/8 — meter rules:')).toBe(true);
    expect(text).toContain(`- ${g.rhythm}`);
    expect(text).toContain(`- ${g.grouping}`);
    expect(text).toContain(`- ${g.barArithmetic}`);
  });
});
