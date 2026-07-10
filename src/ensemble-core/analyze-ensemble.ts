/**
 * ensemble-core: SOFT cross-voice analysis — the "do the voices actually
 * talk to each other?" metrics. Nothing here repairs notes; violations are
 * REPORTED so the caller can (a) feed them back to the LLM for one guided
 * retry and (b) surface honest telemetry. Which findings count as
 * violations is style-dependent (see styles.ts) — parallels are a defect in
 * counterpoint and a feature in minimal interlock.
 *
 * Pure functions; deterministic; fixture-testable without an LLM.
 * @since SDK 2.42.0
 */

import type { EnsembleNote } from './enforce-voice';

export type MotionKind = 'contrary' | 'oblique' | 'similar' | 'parallel';

export interface AdjacentPairAnalysis {
  /** Upper voice index of the pair (pairs with upperVoice + 1). */
  upperVoice: number;
  /** Fraction of the upper voice's onsets NOT shared with the lower voice. */
  onsetIndependence: number;
  /** Distribution of motion kinds across consecutive shared onsets. */
  motion: Record<MotionKind, number>;
  /** Consecutive perfect 5ths/octaves moving in similar motion. */
  parallelPerfects: Array<{ atBeat: number; intervalPc: 0 | 7 }>;
  /** Beats where the nominally-upper voice sounds BELOW the lower voice. */
  crossings: number[];
}

export interface EnsembleAnalysis {
  pairs: AdjacentPairAnalysis[];
  /** Fraction of ALL onsets (across voices) that land on a shared beat. */
  homorhythmScore: number;
}

const EPS = 1e-6;

function pitchAt(voice: readonly EnsembleNote[], beat: number): number | null {
  for (const n of voice) {
    if (n.startBeat - EPS <= beat && beat < n.startBeat + n.durationBeats - EPS) return n.pitch;
  }
  return null;
}

function onsetSet(voice: readonly EnsembleNote[]): number[] {
  return [...new Set(voice.map(n => Math.round(n.startBeat * 96) / 96))].sort((a, b) => a - b);
}

/**
 * Analyze adjacent voice pairs (voice i against voice i+1, top-down order).
 * Voices with no notes yield neutral entries rather than poisoning the run.
 */
export function analyzeEnsemble(voices: ReadonlyArray<readonly EnsembleNote[]>): EnsembleAnalysis {
  const pairs: AdjacentPairAnalysis[] = [];

  for (let i = 0; i + 1 < voices.length; i++) {
    const upper = voices[i];
    const lower = voices[i + 1];
    const upperOnsets = onsetSet(upper);
    const lowerOnsets = new Set(onsetSet(lower));

    const shared = upperOnsets.filter(b => lowerOnsets.has(b));
    const onsetIndependence = upperOnsets.length === 0
      ? 1
      : 1 - shared.length / upperOnsets.length;

    // Motion between consecutive SHARED onsets — the moments both voices move.
    const motion: Record<MotionKind, number> = { contrary: 0, oblique: 0, similar: 0, parallel: 0 };
    const parallelPerfects: AdjacentPairAnalysis['parallelPerfects'] = [];
    for (let s = 0; s + 1 < shared.length; s++) {
      const [b0, b1] = [shared[s], shared[s + 1]];
      const u0 = pitchAt(upper, b0); const u1 = pitchAt(upper, b1);
      const l0 = pitchAt(lower, b0); const l1 = pitchAt(lower, b1);
      if (u0 === null || u1 === null || l0 === null || l1 === null) continue;
      const du = Math.sign(u1 - u0);
      const dl = Math.sign(l1 - l0);
      let kind: MotionKind;
      if (du === 0 || dl === 0) kind = 'oblique';
      else if (du !== dl) kind = 'contrary';
      else {
        // Same direction: parallel when the interval is preserved exactly.
        kind = (u1 - l1) === (u0 - l0) ? 'parallel' : 'similar';
      }
      motion[kind] += 1;

      if (kind === 'parallel') {
        const intervalPc = ((((u1 - l1) % 12) + 12) % 12);
        if (intervalPc === 0 || intervalPc === 7) {
          parallelPerfects.push({ atBeat: b1, intervalPc: intervalPc as 0 | 7 });
        }
      }
    }

    // Voice crossings — sampled at every onset of either voice.
    const crossings: number[] = [];
    for (const b of [...upperOnsets, ...onsetSet(lower)]) {
      const u = pitchAt(upper, b);
      const l = pitchAt(lower, b);
      if (u !== null && l !== null && u < l) crossings.push(b);
    }

    pairs.push({
      upperVoice: i,
      onsetIndependence,
      motion,
      parallelPerfects,
      crossings: [...new Set(crossings)].sort((a, b) => a - b),
    });
  }

  // Homorhythm: how often the whole ensemble attacks together.
  const allOnsets = voices.map(onsetSet);
  const union = new Set(allOnsets.flat());
  let sharedByAll = 0;
  for (const b of union) {
    if (allOnsets.every(o => o.length === 0 || o.includes(b))) sharedByAll += 1;
  }
  const homorhythmScore = union.size === 0 ? 0 : sharedByAll / union.size;

  return { pairs, homorhythmScore };
}

/**
 * Render style-filtered violations as short instructions an LLM can act on
 * in a retry ("Between voice 1 and voice 2, avoid parallel octaves at beat
 * 6"). Empty array = the ensemble passes this style's soft rules.
 */
export function describeViolations(
  analysis: EnsembleAnalysis,
  rules: {
    forbidParallelPerfects: boolean;
    forbidVoiceCrossing: boolean;
    minOnsetIndependence: number;
  }
): string[] {
  const out: string[] = [];
  for (const pair of analysis.pairs) {
    const label = `between voice ${pair.upperVoice + 1} and voice ${pair.upperVoice + 2}`;
    if (rules.forbidParallelPerfects) {
      for (const p of pair.parallelPerfects) {
        out.push(`Parallel ${p.intervalPc === 0 ? 'octaves' : 'fifths'} ${label} at beat ${p.atBeat} — approach perfect intervals by contrary or oblique motion.`);
      }
    }
    if (rules.forbidVoiceCrossing && pair.crossings.length > 0) {
      out.push(`Voice crossing ${label} at beat${pair.crossings.length > 1 ? 's' : ''} ${pair.crossings.join(', ')} — keep each voice inside its register lane.`);
    }
    if (pair.onsetIndependence < rules.minOnsetIndependence) {
      out.push(`Voices ${pair.upperVoice + 1} and ${pair.upperVoice + 2} attack together too often (independence ${pair.onsetIndependence.toFixed(2)} < ${rules.minOnsetIndependence}) — stagger entrances and let one voice move while the other holds.`);
    }
  }
  return out;
}
