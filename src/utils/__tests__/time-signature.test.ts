/**
 * Unit suite for the shared time-signature primitives.
 *
 * The 4/4 identity cases here are load-bearing: they prove that threading
 * these helpers through legacy call sites is a no-op for every existing
 * project (slotsPerBar 4, qnPerSlot 1, quarterNotesPerBar 4, and
 * barsToSeconds reproducing the historic `(bars * 4 * 60) / bpm`).
 */
import {
  ALLOWED_TIME_SIGNATURES,
  DEFAULT_TIME_SIGNATURE,
  barsToQn,
  barsToSeconds,
  beatGrouping,
  denseGridLength,
  finalCadenceSlotCount,
  formatMeter,
  isAllowedTimeSignature,
  manifestSupportsMeter,
  meterFamily,
  parseTimeSignature,
  strongSlots,
  tryParseTimeSignature,
} from '../time-signature';

describe('parseTimeSignature', () => {
  it('degenerates to the legacy 4/4 constants (the back-compat contract)', () => {
    expect(parseTimeSignature('4/4')).toEqual({
      num: 4,
      den: 4,
      quarterNotesPerBar: 4,
      slotsPerBar: 4,
      qnPerSlot: 1,
      grouping: [4],
    });
  });

  it.each([
    ['2/4', 2, 4, 2, 2, 1, [2]],
    ['3/4', 3, 4, 3, 3, 1, [3]],
    ['5/4', 5, 4, 5, 5, 1, [3, 2]],
    ['6/4', 6, 4, 6, 6, 1, [3, 3]],
    ['7/4', 7, 4, 7, 7, 1, [2, 2, 3]],
    ['5/8', 5, 8, 2.5, 5, 0.5, [2, 3]],
    ['6/8', 6, 8, 3, 6, 0.5, [3, 3]],
    ['7/8', 7, 8, 3.5, 7, 0.5, [2, 2, 3]],
    ['9/8', 9, 8, 4.5, 9, 0.5, [3, 3, 3]],
    ['12/8', 12, 8, 6, 12, 0.5, [3, 3, 3, 3]],
  ] as const)(
    'parses %s',
    (ts, num, den, qnPerBar, slots, qnPerSlot, grouping) => {
      const parsed = parseTimeSignature(ts);
      expect(parsed.num).toBe(num);
      expect(parsed.den).toBe(den);
      expect(parsed.quarterNotesPerBar).toBe(qnPerBar);
      expect(parsed.slotsPerBar).toBe(slots);
      expect(parsed.qnPerSlot).toBe(qnPerSlot);
      expect(parsed.grouping).toEqual(grouping);
    },
  );

  it('accepts parse-legal meters outside the curated list', () => {
    expect(parseTimeSignature('3/8').quarterNotesPerBar).toBe(1.5);
    expect(parseTimeSignature('15/8').grouping).toEqual([3, 3, 3, 3, 3]);
    expect(parseTimeSignature('11/8').grouping).toEqual([2, 2, 2, 2, 3]);
    expect(parseTimeSignature('2/2').quarterNotesPerBar).toBe(4);
    expect(parseTimeSignature('4/16').quarterNotesPerBar).toBe(1);
  });

  it.each([
    '04/4', // leading zero — non-canonical
    '4/4 ', // trailing whitespace
    ' 4/4',
    '4//4',
    '4-4',
    'waltz',
    '4/',
    '/4',
    '0/4', // numerator below domain
    '17/4', // numerator above domain
    '4/3', // denominator not a power of two in domain
    '4/32',
    '4.5/4',
    '-3/4',
  ])('rejects %j', (bad) => {
    expect(() => parseTimeSignature(bad)).toThrow(/Invalid time signature/);
    expect(tryParseTimeSignature(bad)).toBeNull();
  });

  it('tryParseTimeSignature returns null for non-strings', () => {
    expect(tryParseTimeSignature(undefined)).toBeNull();
    expect(tryParseTimeSignature(null)).toBeNull();
    expect(tryParseTimeSignature(4)).toBeNull();
    expect(tryParseTimeSignature({ num: 4, den: 4 })).toBeNull();
  });

  it('every parsed grouping sums to slotsPerBar', () => {
    for (const ts of ALLOWED_TIME_SIGNATURES) {
      const parsed = parseTimeSignature(ts);
      expect(parsed.grouping.reduce((a, b) => a + b, 0)).toBe(parsed.slotsPerBar);
    }
  });
});

describe('curated list', () => {
  it('contains 4/4 as the default', () => {
    expect(isAllowedTimeSignature(DEFAULT_TIME_SIGNATURE)).toBe(true);
  });

  it('isAllowedTimeSignature is narrower than the parse domain', () => {
    expect(isAllowedTimeSignature('3/8')).toBe(false); // parse-legal, uncurated
    expect(isAllowedTimeSignature('15/8')).toBe(false);
    expect(isAllowedTimeSignature('6/8')).toBe(true);
    expect(isAllowedTimeSignature('waltz')).toBe(false);
  });

  it('every curated meter is parse-legal', () => {
    for (const ts of ALLOWED_TIME_SIGNATURES) {
      expect(tryParseTimeSignature(ts)).not.toBeNull();
    }
  });
});

describe('conversions', () => {
  it('barsToSeconds reproduces the legacy (bars * 4 * 60) / bpm for 4/4', () => {
    expect(barsToSeconds(4, 120)).toBe((4 * 4 * 60) / 120); // 8s
    expect(barsToSeconds(8, 174)).toBe((8 * 4 * 60) / 174);
    expect(barsToSeconds(2, 90, '4/4')).toBe((2 * 4 * 60) / 90);
  });

  it('barsToSeconds guards degenerate bpm like the legacy helpers (max(1, bpm))', () => {
    expect(barsToSeconds(4, 0)).toBe(4 * 4 * 60);
    expect(barsToSeconds(4, -10)).toBe(4 * 4 * 60);
  });

  it('barsToSeconds under quarter-note BPM for other meters', () => {
    expect(barsToSeconds(4, 120, '3/4')).toBe(6); // 4 bars × 3 qn × 0.5s
    expect(barsToSeconds(4, 120, '6/8')).toBe(6); // durationally identical to 3/4
    expect(barsToSeconds(4, 120, '7/8')).toBe(7); // 4 × 3.5 × 0.5 — fractional-safe
    expect(barsToSeconds(2, 120, '12/8')).toBe(6); // 2 × 6 × 0.5
  });

  it('barsToQn', () => {
    expect(barsToQn(4)).toBe(16);
    expect(barsToQn(4, '6/8')).toBe(12);
    expect(barsToQn(2, '7/8')).toBe(7);
  });

  it('denseGridLength is bars × numerator and always an integer', () => {
    expect(denseGridLength('4/4', 4)).toBe(16);
    expect(denseGridLength('6/8', 2)).toBe(12);
    expect(denseGridLength('7/8', 4)).toBe(28);
    for (const ts of ALLOWED_TIME_SIGNATURES) {
      for (const bars of [2, 4, 8, 16]) {
        expect(Number.isInteger(denseGridLength(ts, bars))).toBe(true);
      }
    }
  });

  it('formatMeter round-trips parse', () => {
    for (const ts of ALLOWED_TIME_SIGNATURES) {
      expect(formatMeter(parseTimeSignature(ts))).toBe(ts);
    }
  });
});

describe('meterFamily', () => {
  it.each([
    ['2/4', 'simple-duple'],
    ['3/4', 'simple-triple'],
    ['4/4', 'simple-quadruple'],
    ['5/4', 'simple-odd'],
    ['6/4', 'simple-odd'],
    ['7/4', 'simple-odd'],
    ['6/8', 'compound-duple'],
    ['9/8', 'compound-triple'],
    ['12/8', 'compound-quadruple'],
    ['5/8', 'asymmetric'],
    ['7/8', 'asymmetric'],
    ['2/2', 'simple-duple'],
    ['11/8', 'asymmetric'],
    ['15/8', 'asymmetric'], // compound quintuple — out of the named union
  ] as const)('%s → %s', (ts, family) => {
    expect(meterFamily(ts)).toBe(family);
  });
});

describe('accent structure', () => {
  it('strongSlots are cumulative grouping starts', () => {
    expect(strongSlots('4/4')).toEqual([0]);
    expect(strongSlots('6/8')).toEqual([0, 3]);
    expect(strongSlots('7/8')).toEqual([0, 2, 4]);
    expect(strongSlots('5/4')).toEqual([0, 3]);
    expect(strongSlots('12/8')).toEqual([0, 3, 6, 9]);
  });

  it('beatGrouping matches the parsed grouping', () => {
    expect(beatGrouping('6/8')).toEqual([3, 3]);
    expect(beatGrouping('7/4')).toEqual([2, 2, 3]);
  });

  it('finalCadenceSlotCount — 4/4 keeps the legacy beats-3-4 rule (k=2)', () => {
    expect(finalCadenceSlotCount('4/4')).toBe(2);
  });

  it.each([
    ['2/4', 1], // even simple → num/2
    ['6/4', 3], // even simple → num/2
    ['3/4', 3], // odd simple → last (only) group: full tonic bar
    ['5/4', 2], // grouping [3,2] → last group
    ['7/4', 3], // grouping [2,2,3] → last group
    ['6/8', 3], // last pulse group
    ['9/8', 3],
    ['12/8', 3],
    ['5/8', 3], // grouping [2,3]
    ['7/8', 3], // grouping [2,2,3]
  ] as const)('%s → %d slots', (ts, k) => {
    expect(finalCadenceSlotCount(ts)).toBe(k);
  });

  it('finalCadenceSlotCount never exceeds the bar', () => {
    for (const ts of ALLOWED_TIME_SIGNATURES) {
      const k = finalCadenceSlotCount(ts);
      expect(k).toBeGreaterThan(0);
      expect(k).toBeLessThanOrEqual(parseTimeSignature(ts).slotsPerBar);
    }
  });
});

describe('manifestSupportsMeter', () => {
  it('undeclared manifests support exactly 4/4 (the back-compat default)', () => {
    expect(manifestSupportsMeter(undefined, '4/4')).toBe(true);
    expect(manifestSupportsMeter(undefined, '3/4')).toBe(false);
    expect(manifestSupportsMeter(undefined, '6/8')).toBe(false);
  });

  it("'*' supports every parse-legal meter but never garbage", () => {
    expect(manifestSupportsMeter('*', '4/4')).toBe(true);
    expect(manifestSupportsMeter('*', '7/8')).toBe(true);
    expect(manifestSupportsMeter('*', '15/8')).toBe(true);
    expect(manifestSupportsMeter('*', 'waltz')).toBe(false);
    expect(manifestSupportsMeter('*', '17/4')).toBe(false);
  });

  it('exact entries', () => {
    expect(manifestSupportsMeter(['4/4', '3/4'], '3/4')).toBe(true);
    expect(manifestSupportsMeter(['4/4', '3/4'], '6/8')).toBe(false);
  });

  it('denominator-family wildcards', () => {
    expect(manifestSupportsMeter(['*/4'], '5/4')).toBe(true);
    expect(manifestSupportsMeter(['*/4'], '6/8')).toBe(false);
    expect(manifestSupportsMeter(['*/8'], '6/8')).toBe(true);
    expect(manifestSupportsMeter(['*/8'], '4/4')).toBe(false);
    expect(manifestSupportsMeter(['4/4', '*/8'], '9/8')).toBe(true);
  });

  it("'*' inside an array works", () => {
    expect(manifestSupportsMeter(['*'], '7/4')).toBe(true);
  });

  it('unparseable targets are never supported', () => {
    expect(manifestSupportsMeter(['*/4'], '04/4')).toBe(false);
    expect(manifestSupportsMeter(['4/4'], '4/4 ')).toBe(false);
  });
});
