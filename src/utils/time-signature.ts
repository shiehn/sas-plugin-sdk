/**
 * Time-signature primitives — the single home for meter parsing, the curated
 * meter allowlist, and every bars↔beats↔seconds conversion that depends on the
 * meter. Pure: no I/O, no engine access, importable from main, renderer,
 * tools, and tests alike.
 *
 * WHY ONE FILE: `ALLOWED_SCENE_BARS` ended up defined in four places
 * (transition-bars.ts claims canonical, scene-service.ts is what production
 * imports, plus two stray copies). The meter constant must not fork the same
 * way — everything imports from HERE. The SDK ships a byte-identical twin at
 * `sas-plugin-sdk/src/utils/time-signature.ts`, pinned by a parity test.
 *
 * UNIT MODEL (the invariant everything below encodes):
 * - BPM always counts QUARTER NOTES per minute, for every meter.
 * - A chord-grid SLOT is one DENOMINATOR beat, so a bar has `numerator`
 *   slots (always an integer) and a slot spans `4/denominator` quarter notes.
 * - `quarterNotesPerBar = numerator * 4 / denominator` may be FRACTIONAL
 *   (7/8 → 3.5). Keep it in floating point; never truncate.
 * For 4/4 every derived value degenerates to today's constants
 * (slotsPerBar = 4, qnPerSlot = 1, quarterNotesPerBar = 4), which is the
 * backward-compatibility argument for the whole multi-meter feature.
 *
 * PARSE DOMAIN vs CURATED LIST: `parseTimeSignature` accepts any canonical
 * "N/D" with N in 1..16 and D in {2,4,8,16} — the same shape the Migration
 * 078 DB trigger enforces (see the domain-agreement test). The narrower
 * `ALLOWED_TIME_SIGNATURES` is POLICY (what UI pickers and tool enums offer)
 * and can widen without a migration.
 */

export const DEFAULT_TIME_SIGNATURE = '4/4';

/**
 * Curated meters offered by UI pickers and tool enums. Widening this list is
 * a data-only change (the DB trigger validates shape, not membership).
 * '3/8' is deliberately absent: a 1.5-quarter-note bar undercuts scene-length
 * assumptions (a 2-bar 3/8 scene is 3 qn total); it is parse-legal, so
 * re-adding it later is a one-line change.
 */
export const ALLOWED_TIME_SIGNATURES = [
  '2/4',
  '3/4',
  '4/4',
  '5/4',
  '6/4',
  '7/4',
  '5/8',
  '6/8',
  '7/8',
  '9/8',
  '12/8',
] as const;

export type TimeSignatureId = (typeof ALLOWED_TIME_SIGNATURES)[number];

/** Bounds of the parse domain (mirrored by the Migration 078 triggers). */
export const TIME_SIGNATURE_MAX_NUMERATOR = 16;
export const TIME_SIGNATURE_DENOMINATORS = [2, 4, 8, 16] as const;

export interface ParsedTimeSignature {
  readonly num: number;
  readonly den: number;
  /** num * 4 / den — FRACTIONAL for odd /8 meters (7/8 → 3.5). */
  readonly quarterNotesPerBar: number;
  /** Chord-grid slots per bar = numerator (integer for every meter). */
  readonly slotsPerBar: number;
  /** Quarter notes per slot = 4 / den (1 for /4, 0.5 for /8). */
  readonly qnPerSlot: number;
  /**
   * Default pulse grouping in SLOTS per accent group, e.g. 4/4 → [4],
   * 6/8 → [3, 3], 7/8 → [2, 2, 3]. Sums to `slotsPerBar`. Drives prompt
   * idioms, UI beat emphasis, and cadence-slot math.
   */
  readonly grouping: readonly number[];
}

export type MeterFamily =
  | 'simple-duple'
  | 'simple-triple'
  | 'simple-quadruple'
  | 'simple-odd'
  | 'compound-duple'
  | 'compound-triple'
  | 'compound-quadruple'
  | 'asymmetric';

/** Hand-tuned groupings for the curated meters (front-weighted 5/4 etc.). */
const CURATED_GROUPINGS: Readonly<Record<TimeSignatureId, readonly number[]>> = {
  '2/4': [2],
  '3/4': [3],
  '4/4': [4],
  '5/4': [3, 2],
  '6/4': [3, 3],
  '7/4': [2, 2, 3],
  '5/8': [2, 3],
  '6/8': [3, 3],
  '7/8': [2, 2, 3],
  '9/8': [3, 3, 3],
  '12/8': [3, 3, 3, 3],
};

/** Deterministic grouping for parse-legal meters outside the curated list. */
function defaultGrouping(num: number, den: number): number[] {
  if (den <= 4 && num <= 4) return [num];
  if (num % 3 === 0) return Array.from({ length: num / 3 }, () => 3);
  const groups: number[] = [];
  let remaining = num;
  while (remaining > 3) {
    groups.push(2);
    remaining -= 2;
  }
  groups.push(remaining); // 2 for even numerators, 3 for odd
  return groups;
}

const parseCache = new Map<string, ParsedTimeSignature>();

/**
 * Parse a canonical "N/D" time signature. Throws on anything outside the
 * parse domain: non-canonical text ('04/4', '4/4 ', '4//4', 'waltz'),
 * numerator outside 1..16, or denominator not in {2,4,8,16}.
 */
export function parseTimeSignature(ts: string): ParsedTimeSignature {
  const cached = parseCache.get(ts);
  if (cached) return cached;

  const slash = ts.indexOf('/');
  if (slash <= 0) {
    throw new Error(`Invalid time signature '${ts}' — expected "N/D" (e.g. "3/4")`);
  }
  const numText = ts.slice(0, slash);
  const denText = ts.slice(slash + 1);
  const num = Number(numText);
  const den = Number(denText);
  // Canonical-form check (mirrors the Migration 078 trigger): reconstructing
  // the string from the parsed integers must reproduce the input exactly,
  // which rejects leading zeros, whitespace, signs, and decimals.
  if (
    !Number.isInteger(num) ||
    !Number.isInteger(den) ||
    `${num}/${den}` !== ts ||
    num < 1 ||
    num > TIME_SIGNATURE_MAX_NUMERATOR ||
    !(TIME_SIGNATURE_DENOMINATORS as readonly number[]).includes(den)
  ) {
    throw new Error(
      `Invalid time signature '${ts}' — numerator must be 1..${TIME_SIGNATURE_MAX_NUMERATOR} ` +
        `and denominator one of ${TIME_SIGNATURE_DENOMINATORS.join('/')}`,
    );
  }

  const curated = (CURATED_GROUPINGS as Record<string, readonly number[]>)[ts];
  const parsed: ParsedTimeSignature = Object.freeze({
    num,
    den,
    quarterNotesPerBar: (num * 4) / den,
    slotsPerBar: num,
    qnPerSlot: 4 / den,
    grouping: Object.freeze(curated ? [...curated] : defaultGrouping(num, den)),
  });
  parseCache.set(ts, parsed);
  return parsed;
}

/** Non-throwing parse: null for anything outside the parse domain. */
export function tryParseTimeSignature(ts: unknown): ParsedTimeSignature | null {
  if (typeof ts !== 'string') return null;
  try {
    return parseTimeSignature(ts);
  } catch {
    return null;
  }
}

/** Curated-list membership (policy check — narrower than the parse domain). */
export function isAllowedTimeSignature(ts: string): ts is TimeSignatureId {
  return (ALLOWED_TIME_SIGNATURES as readonly string[]).includes(ts);
}

export function formatMeter(m: { num: number; den: number }): string {
  return `${m.num}/${m.den}`;
}

/** Quarter notes in `bars` bars of the given meter (default 4/4). */
export function barsToQn(bars: number, ts: string = DEFAULT_TIME_SIGNATURE): number {
  return bars * parseTimeSignature(ts).quarterNotesPerBar;
}

/**
 * Seconds spanned by `bars` bars at `bpm` (quarter-note BPM) in the given
 * meter. Omitted meter = 4/4, reproducing the legacy `(bars * 4 * 60) / bpm`
 * exactly. The `max(1, bpm)` guard matches the defensive division the
 * pre-existing helpers used (audio-preview-service, crossfade-meta).
 */
export function barsToSeconds(
  bars: number,
  bpm: number,
  ts: string = DEFAULT_TIME_SIGNATURE,
): number {
  return (bars * parseTimeSignature(ts).quarterNotesPerBar * 60) / Math.max(1, bpm);
}

/** Dense chord-grid length for a scene: bars × numerator (always integer). */
export function denseGridLength(ts: string, bars: number): number {
  return bars * parseTimeSignature(ts).slotsPerBar;
}

/**
 * Classify a meter for prompt-idiom selection. Simple = denominator 2/4
 * (beat = the denominator unit, straight subdivision); compound = /8 or /16
 * with a numerator divisible by 3 (pulse = dotted units of 3 slots);
 * everything else on /8/16 is asymmetric (uneven groups, e.g. 5/8, 7/8).
 */
export function meterFamily(ts: string): MeterFamily {
  const { num, den } = parseTimeSignature(ts);
  if (den <= 4) {
    if (num === 2) return 'simple-duple';
    if (num === 3) return 'simple-triple';
    if (num === 4) return 'simple-quadruple';
    return 'simple-odd';
  }
  if (num % 3 === 0) {
    const pulses = num / 3;
    if (pulses === 2) return 'compound-duple';
    if (pulses === 3) return 'compound-triple';
    if (pulses === 4) return 'compound-quadruple';
  }
  return 'asymmetric';
}

/** Default accent grouping in slots (see ParsedTimeSignature.grouping). */
export function beatGrouping(ts: string): readonly number[] {
  return parseTimeSignature(ts).grouping;
}

/**
 * 0-based slot indices where accent groups begin — the "strong beats" of the
 * bar. 4/4 → [0]; 6/8 → [0, 3]; 7/8 → [0, 2, 4].
 */
export function strongSlots(ts: string): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const g of parseTimeSignature(ts).grouping) {
    out.push(acc);
    acc += g;
  }
  return out;
}

/**
 * How many trailing SLOTS of a final bar a transition's tonic-landing rule
 * overwrites. Even-numerator simple meters use the back half of the bar
 * (4/4 → 2, byte-compatible with the legacy "beats 3-4" rule); everything
 * else uses the final accent group (6/8 → the last 3-slot pulse; 3/4 → the
 * whole 3-slot bar, a full tonic bar being the natural waltz landing).
 */
export function finalCadenceSlotCount(ts: string): number {
  const parsed = parseTimeSignature(ts);
  const family = meterFamily(ts);
  if (family.startsWith('simple') && parsed.num % 2 === 0) {
    return parsed.num / 2;
  }
  const { grouping } = parsed;
  return grouping[grouping.length - 1];
}

/**
 * Does a plugin manifest's `supportedTimeSignatures` declaration cover the
 * given meter?
 * - `undefined` (plugin predates the field) → 4/4 only.
 * - `'*'` → every parse-legal meter (fully meter-agnostic plugin).
 * - Array entries: exact meters ('3/4'), the '*' wildcard, or
 *   denominator-family wildcards ('*\/4', '*\/8' — star-slash-denominator)
 *   so e.g. a quarter-note-beat plugin covers 2/4 through 7/4 without
 *   enumerating them.
 * Unparseable `ts` is never supported.
 */
export function manifestSupportsMeter(
  declared: readonly string[] | '*' | undefined,
  ts: string,
): boolean {
  const parsed = tryParseTimeSignature(ts);
  if (!parsed) return false;
  if (declared === undefined) return ts === DEFAULT_TIME_SIGNATURE;
  if (declared === '*') return true;
  for (const entry of declared) {
    if (entry === '*') return true;
    if (entry === ts) return true;
    if (entry.startsWith('*/') && Number(entry.slice(2)) === parsed.den) return true;
  }
  return false;
}
