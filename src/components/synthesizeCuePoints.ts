/**
 * Synthesize a PluginCuePoints object from raw BPM/sample-rate inputs.
 *
 * The OffsetScrubber consumes PluginCuePoints — a beat grid plus
 * per-beat sample positions, normally produced by Lyria's onset
 * detector. The recorder doesn't have detected cue points (live
 * recordings have no detection pass), but it always knows the project
 * BPM, the engine sample rate, and the loop length in bars. That's
 * enough to construct a synthetic grid where every beat sits on a
 * regular interval — which is exactly what the scrubber needs to
 * provide tick marks + snap behavior for nudging the take's offset.
 */

import type { PluginCuePoints } from '../types/plugin-sdk.types';

export interface SynthesizeCuePointsOptions {
  bpm: number;
  sampleRate: number;
  /** Total bars in the clip (e.g. 4 for a 4-bar loop). */
  bars: number;
  /** Beats per bar. Defaults to 4 (4/4). */
  meter?: number;
}

export function synthesizeCuePoints({
  bpm,
  sampleRate,
  bars,
  meter = 4,
}: SynthesizeCuePointsOptions): PluginCuePoints {
  const safeBpm = bpm > 0 ? bpm : 120;
  const safeSampleRate = sampleRate > 0 ? sampleRate : 48000;
  const samplesPerBeat = Math.round((60 / safeBpm) * safeSampleRate);
  const totalBeats = Math.max(1, Math.round(bars * meter));
  const beats: number[] = [];
  for (let i = 0; i < totalBeats; i++) {
    beats.push(i * samplesPerBeat);
  }
  return {
    schema: 1,
    sample_rate: safeSampleRate,
    detected_bpm: safeBpm,
    downbeat_sample: 0,
    beats,
    detected_at: new Date().toISOString(),
  };
}
