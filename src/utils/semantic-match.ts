/**
 * Lightweight, dependency-free semantic matching for sample selection.
 *
 * Sample generators (drums, instruments) ship a short StableAudio text
 * prompt next to every sample ("tight 909-style kick one shot, hard click
 * transient, short punchy body, dry, no hi hats, no loop"). When the user
 * asks for "a 1950s style boom bap kick" we want to pick the sample whose
 * prompt is closest to that intent — instead of a uniform random draw —
 * while still preserving variety so a vague "give me a kick" doesn't return
 * the identical sample every time.
 *
 * Design notes:
 *   - Pure functions, no I/O, no SDK-type dependencies → trivially unit
 *     testable with an injected `rng`, and safe to call from either the
 *     main or renderer process.
 *   - Scoring is IDF-weighted query-coverage (a TF-IDF / BM25-lite). The
 *     IDF is derived from the candidate pool itself, so it is STRUCTURAL —
 *     no hand-maintained synonym tables. Rare, discriminating tokens in the
 *     prompts ("909", "dusty", "tube") dominate; corpus-universal filler
 *     ("one", "shot", "dry") washes out to ~zero IDF on its own.
 *   - The near-universal negative clauses StableAudio prompts carry
 *     ("no hi hats", "no loop", "no melody") are stripped before tokenizing;
 *     they are pure noise for matching.
 *   - Selection is softmax-weighted random among the top-k. Flat scores →
 *     ~uniform (≈ the old random behavior); a clear winner → tight
 *     convergence. The all-zero (no-signal) case is intentionally left to
 *     the caller to fall back to its existing random path over the full
 *     pool — see `scorePromptMatch`'s contract below.
 */

/**
 * Function words + a few imperative-request fillers that should never count
 * as matchable intent. Kept deliberately SMALL — IDF already neutralizes
 * corpus-universal words, and query tokens that appear in no candidate are
 * dropped during scoring, so this list only needs the words that would
 * otherwise be both query-frequent AND coincidentally present in prompts.
 */
const STOP_WORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'with', 'for', 'to', 'of', 'in', 'on',
  'at', 'by', 'is', 'it', 'this', 'that', 'i', 'my', 'me', 'make', 'please',
  'give', 'want', 'need', 'some', 'like', 'get', 'something',
]);

/**
 * Tokenize a prompt or query into matchable lowercase tokens.
 *
 *   1. Drop comma-delimited negative clauses ("no hi hats", "no loop").
 *   2. Lowercase, split on any non-alphanumeric run.
 *   3. Drop stop-words and 1–2 digit numeric noise ("01", "02") while
 *      keeping meaningful numerics ("808", "909", "1950").
 */
export function tokenizePrompt(text: string): string[] {
  if (!text) return [];
  const withoutNegatives = text
    .split(',')
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0 && !/^no\s/i.test(clause))
    .join(' ');

  return withoutNegatives
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((tok) => {
      if (!tok) return false;
      if (STOP_WORDS.has(tok)) return false;
      if (/^\d{1,2}$/.test(tok)) return false; // "01", "02" — sequence noise
      return true;
    });
}

/**
 * Score each candidate prompt against the query, returning a parallel array
 * of scores in [0, 1] (1 = the candidate covers all of the query's
 * discriminating intent).
 *
 * Contract: a returned max of 0 means the query shares NO matchable token
 * with any candidate (no signal). Callers should treat that as "fall back to
 * the existing uniform-random pick over the full pool" so vague queries keep
 * today's variety rather than biasing toward an arbitrary top-k slice.
 */
export function scorePromptMatch(
  query: string,
  candidatePrompts: ReadonlyArray<string>,
): number[] {
  const n = candidatePrompts.length;
  if (n === 0) return [];

  const queryTokens = Array.from(new Set(tokenizePrompt(query)));
  if (queryTokens.length === 0) return candidatePrompts.map(() => 0);

  const candidateTokenSets = candidatePrompts.map((p) => new Set(tokenizePrompt(p)));

  // IDF for each query token, derived from the candidate pool. Tokens that
  // appear in no candidate are unmatchable → excluded from both the score
  // numerator and the normalization denominator.
  const idf = new Map<string, number>();
  for (const token of queryTokens) {
    let df = 0;
    for (const set of candidateTokenSets) {
      if (set.has(token)) df += 1;
    }
    if (df > 0) idf.set(token, Math.log(1 + n / df));
  }

  let denominator = 0;
  for (const weight of idf.values()) denominator += weight;
  if (denominator === 0) return candidatePrompts.map(() => 0);

  return candidateTokenSets.map((set) => {
    let numerator = 0;
    for (const [token, weight] of idf) {
      if (set.has(token)) numerator += weight;
    }
    return numerator / denominator;
  });
}

/** One scored candidate. `key` (if present) is what `excludeKeys` matches on. */
export interface ScoredCandidate<T> {
  item: T;
  score: number;
  key?: string;
}

export interface PickTopKOptions {
  /** Consider only the top-k by score (default 5). */
  k?: number;
  /**
   * Softmax temperature (default 0.3). Lower → sharper preference for the
   * top match; higher → flatter (more variety). Scores are in [0, 1].
   */
  temperature?: number;
  /** Candidate keys to exclude (e.g. shuffle history). */
  excludeKeys?: ReadonlySet<string>;
  /** Injectable RNG in [0, 1) for deterministic tests (default Math.random). */
  rng?: () => number;
}

/**
 * Pick one candidate via softmax-weighted random selection among the top-k
 * by score. Returns null only when the pool is empty after exclusion.
 *
 * Equal scores → equal weights → uniform pick among the top-k, so this
 * degrades gracefully toward random when the query gives no preference.
 */
export function pickTopKWeighted<T>(
  scored: ReadonlyArray<ScoredCandidate<T>>,
  options: PickTopKOptions = {},
): T | null {
  const { k = 5, temperature = 0.3, excludeKeys, rng = Math.random } = options;

  let pool = scored;
  if (excludeKeys && excludeKeys.size > 0) {
    pool = pool.filter((c) => c.key === undefined || !excludeKeys.has(c.key));
  }
  if (pool.length === 0) return null;

  const sorted = [...pool].sort((a, b) => b.score - a.score);
  const top = sorted.slice(0, Math.max(1, k));

  // Softmax with a max-subtraction for numerical stability.
  const maxScore = top[0].score;
  const safeTemp = Math.max(1e-6, temperature);
  const weights = top.map((c) => Math.exp((c.score - maxScore) / safeTemp));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  let threshold = rng() * totalWeight;
  for (let i = 0; i < top.length; i += 1) {
    threshold -= weights[i];
    if (threshold <= 0) return top[i].item;
  }
  return top[top.length - 1].item;
}
