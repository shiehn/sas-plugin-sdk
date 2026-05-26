/**
 * WAV peak analyzer (Phase 8.10).
 *
 * Reads a WAV file via the plugin host, decodes it via Web Audio,
 * scans every channel for the absolute maximum sample, and returns
 * peak dBFS + a clipped flag (true when the peak >= -1dBFS, matching
 * the engine's hard-limiter ceiling).
 *
 * Used by the recorder's take rows to surface "this take peaked at
 * -8dB" or "this take CLIPPED" without the user having to click play.
 */

import type { PluginHost } from '../types/plugin-sdk.types';

export interface PeakAnalysis {
  peakLinear: number;
  peakDb: number;
  clipped: boolean;
}

/** Threshold matching the engine's -1dBFS hard limiter ceiling. */
const CLIP_THRESHOLD_LINEAR = 0.891;

export async function analyzeWavPeak(
  host: PluginHost,
  filePath: string
): Promise<PeakAnalysis> {
  const bytes = await host.getAudioFileBytes(filePath);
  const ContextCtor: typeof AudioContext =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
  const audioContext = new ContextCtor();
  try {
    const audioBuffer = await audioContext.decodeAudioData(bytes.slice(0));
    let peak = 0;
    for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
      const data = audioBuffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        const a = Math.abs(data[i]);
        if (a > peak) peak = a;
      }
    }
    const peakDb = peak > 1e-6 ? 20 * Math.log10(peak) : -120;
    return {
      peakLinear: peak,
      peakDb,
      clipped: peak >= CLIP_THRESHOLD_LINEAR - 0.005,
    };
  } finally {
    await audioContext.close().catch(() => { /* ignore */ });
  }
}
