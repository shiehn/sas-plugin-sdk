/**
 * ensemble-core: HARD per-voice enforcement — the mechanical layer between
 * the LLM's jointly-composed voices and the clips that get written. In the
 * platform's bass-plugin tradition, everything here is deterministic
 * analysis/repair of written notes, never LLM intention:
 *
 *   clip clamp → octave-fold into the voice's register window →
 *   root-only pinning (anchor voices) → in-scale snap (optional) →
 *   per-voice monophony sweep → per-bar density thinning
 *
 * Each voice stays a single line (monophonic); OVERLAP BETWEEN voices is the
 * point of counterpoint and is never touched here. Soft, style-dependent
 * rules (parallels, crossings, onset independence) live in
 * analyze-ensemble.ts — they are reported, not repaired.
 *
 * Pure functions; inputs are never mutated. @since SDK 2.42.0
 */

import type { EnsembleVoiceSpec } from './voice-spec';

/** Structural match for PluginMidiNote — keeps this module dependency-free. */
export interface EnsembleNote {
  pitch: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
  channel?: number;
}

export interface EnforceVoiceOptions {
  /** Clip length in bars (4/4 assumed, matching the platform grid). */
  bars: number;
  /**
   * Chord-root pitch class (0-11) for a given bar, or null when unknown.
   * Required for `rootOnly` voices to mean anything; when absent, rootOnly
   * degrades to plain register enforcement.
   */
  chordRootPcAtBar?: (bar: number) => number | null;
  /**
   * Scale pitch classes (0-11) for the scene key. When provided, non-scale
   * pitches snap to the nearest scale pitch class (chord tones supplied via
   * `chordPcsAtBar` are exempt — a sounding 7th over its chord is not an
   * error even outside the scale).
   */
  scalePcs?: ReadonlySet<number>;
  /** Chord-tone pitch classes for a bar — exemptions for the scale snap. */
  chordPcsAtBar?: (bar: number) => ReadonlySet<number> | null;
}

export interface EnforceVoiceResult {
  notes: EnsembleNote[];
  /** Human/LLM-readable descriptions of every repair performed. */
  repairs: string[];
}

export const MIN_NOTE_DURATION_BEATS = 0.0625;
const BEATS_PER_BAR = 4;

/** Octave-fold a pitch into [low, high], preserving pitch class when possible. */
export function foldPitchToRegister(pitch: number, low: number, high: number): number {
  let p = pitch;
  while (p < low) p += 12;
  while (p > high) p -= 12;
  // Window narrower than an octave can overshoot — clamp as a last resort.
  if (p < low) p = low;
  if (p > high) p = high;
  return p;
}

/** Nearest pitch within [low, high] having pitch class `pc` (ties go low). */
export function nearestPitchWithPc(reference: number, pc: number, low: number, high: number): number {
  let best: number | null = null;
  for (let p = low; p <= high; p++) {
    if (((p % 12) + 12) % 12 !== pc) continue;
    if (best === null || Math.abs(p - reference) < Math.abs(best - reference)) best = p;
  }
  // Window without that pc at all (< an octave wide): fall back to the fold.
  return best ?? foldPitchToRegister(reference, low, high);
}

function snapToNearestPc(pitch: number, pcs: ReadonlySet<number>): number {
  if (pcs.size === 0) return pitch;
  for (let d = 0; d <= 6; d++) {
    // Prefer downward on ties — resolving down reads as less intrusive.
    if (pcs.has((((pitch - d) % 12) + 12) % 12)) return pitch - d;
    if (pcs.has((((pitch + d) % 12) + 12) % 12)) return pitch + d;
  }
  return pitch;
}

/**
 * Enforce one voice's hard contract. Order matters: register first (so
 * root-only/scale snaps operate in-window), monophony before density (the
 * sweep can merge/trim what thinning would otherwise count).
 */
export function enforceVoice(
  rawNotes: readonly EnsembleNote[],
  spec: EnsembleVoiceSpec,
  opts: EnforceVoiceOptions
): EnforceVoiceResult {
  const repairs: string[] = [];
  const clipEnd = opts.bars * BEATS_PER_BAR;

  // 1. Clip bounds + duration floor.
  let notes: EnsembleNote[] = [];
  for (const n of rawNotes) {
    if (!Number.isFinite(n.pitch) || !Number.isFinite(n.startBeat) || !Number.isFinite(n.durationBeats)) continue;
    if (n.startBeat >= clipEnd || n.startBeat < 0) {
      repairs.push(`voice ${spec.voiceIndex}: dropped note outside the ${opts.bars}-bar clip (start ${n.startBeat})`);
      continue;
    }
    const durationBeats = Math.max(
      MIN_NOTE_DURATION_BEATS,
      Math.min(n.durationBeats, clipEnd - n.startBeat)
    );
    notes.push({ ...n, durationBeats });
  }

  // 2. Register fold.
  notes = notes.map(n => {
    const folded = foldPitchToRegister(Math.round(n.pitch), spec.registerLow, spec.registerHigh);
    if (folded !== n.pitch) {
      repairs.push(`voice ${spec.voiceIndex}: folded pitch ${n.pitch} into register ${spec.registerLow}-${spec.registerHigh} (${folded})`);
    }
    return { ...n, pitch: folded };
  });

  // 3. Root-only anchor voices: pin every note to the bar's chord root.
  if (spec.rootOnly && opts.chordRootPcAtBar) {
    notes = notes.map(n => {
      const bar = Math.floor(n.startBeat / BEATS_PER_BAR);
      const rootPc = opts.chordRootPcAtBar!(bar);
      if (rootPc === null) return n;
      const pinned = nearestPitchWithPc(n.pitch, rootPc, spec.registerLow, spec.registerHigh);
      if (pinned !== n.pitch) {
        repairs.push(`voice ${spec.voiceIndex}: pinned bar ${bar + 1} note to the chord root (${n.pitch} → ${pinned})`);
      }
      return { ...n, pitch: pinned };
    });
  }

  // 4. In-scale snap (chord tones exempt).
  if (opts.scalePcs && opts.scalePcs.size > 0 && !spec.rootOnly) {
    notes = notes.map(n => {
      const pc = ((n.pitch % 12) + 12) % 12;
      if (opts.scalePcs!.has(pc)) return n;
      const bar = Math.floor(n.startBeat / BEATS_PER_BAR);
      const chordPcs = opts.chordPcsAtBar?.(bar);
      if (chordPcs?.has(pc)) return n; // chordal color survives the key filter
      const snapped = foldPitchToRegister(
        snapToNearestPc(n.pitch, opts.scalePcs!),
        spec.registerLow,
        spec.registerHigh
      );
      if (snapped !== n.pitch) {
        repairs.push(`voice ${spec.voiceIndex}: snapped out-of-key pitch ${n.pitch} → ${snapped}`);
      }
      return { ...n, pitch: snapped };
    });
  }

  // 5. Per-voice monophony: sort by onset; at equal onsets keep the spec's
  //    preferred extreme; trim any note that overlaps its successor.
  notes.sort((a, b) => a.startBeat - b.startBeat || (spec.monoPreference === 'high' ? b.pitch - a.pitch : a.pitch - b.pitch));
  const mono: EnsembleNote[] = [];
  for (const n of notes) {
    const prev = mono[mono.length - 1];
    if (prev && Math.abs(prev.startBeat - n.startBeat) < 1e-9) {
      repairs.push(`voice ${spec.voiceIndex}: dropped simultaneous note ${n.pitch} at beat ${n.startBeat} (voice is one line)`);
      continue;
    }
    if (prev && prev.startBeat + prev.durationBeats > n.startBeat) {
      prev.durationBeats = Math.max(MIN_NOTE_DURATION_BEATS, n.startBeat - prev.startBeat);
    }
    mono.push({ ...n });
  }

  // 6. Per-bar density thinning: drop the weakest notes (short, quiet,
  //    weak-beat) until each bar fits the spec's cap.
  const byBar = new Map<number, EnsembleNote[]>();
  for (const n of mono) {
    const bar = Math.floor(n.startBeat / BEATS_PER_BAR);
    const bucket = byBar.get(bar) ?? [];
    bucket.push(n);
    byBar.set(bar, bucket);
  }
  const kept = new Set<EnsembleNote>(mono);
  for (const [bar, bucket] of byBar) {
    if (bucket.length <= spec.maxNotesPerBar) continue;
    const strength = (n: EnsembleNote): number => {
      const beatInBar = n.startBeat - bar * BEATS_PER_BAR;
      const onDownbeat = Math.abs(beatInBar % 1) < 1e-9 ? 1 : 0;
      return n.durationBeats * 4 + n.velocity / 127 + onDownbeat * 2;
    };
    const ranked = [...bucket].sort((a, b) => strength(a) - strength(b));
    const excess = bucket.length - spec.maxNotesPerBar;
    for (let i = 0; i < excess; i++) {
      kept.delete(ranked[i]);
    }
    repairs.push(`voice ${spec.voiceIndex}: thinned bar ${bar + 1} from ${bucket.length} to ${spec.maxNotesPerBar} notes (density cap)`);
  }

  return { notes: mono.filter(n => kept.has(n)), repairs };
}
