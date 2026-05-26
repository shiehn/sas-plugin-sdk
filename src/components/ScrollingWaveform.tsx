/**
 * ScrollingWaveform — live waveform during recording (Phase 8.10).
 *
 * Reads the platform's `peakDb` history and renders it as a horizontal
 * bar-graph that scrolls left as new samples arrive. Two halves: top
 * band shows positive amplitude, bottom band mirrors it (matches the
 * static waveform's min/max layout in `WaveformView`).
 *
 * The data source is a function the caller supplies — typically a ref
 * to the `inputLevelDb` value from `AudioRoutingContext` polled at
 * ~30Hz. The component samples that ref via requestAnimationFrame and
 * shifts a fixed-size float ring buffer one column per frame.
 *
 * Pure presentational + animation logic; no IPC. Stops animating
 * when `active` is false (engine isn't running the audio callback).
 */

import React, { useEffect, useRef } from 'react';

export interface ScrollingWaveformProps {
  /** Function returning the latest peak in dBFS. Called per RAF. */
  getPeakDb: () => number;
  /** True while the audio callback is running; false freezes the wave. */
  active: boolean;
  /** Number of horizontal columns in the ring buffer. */
  columns?: number;
  /** Optional className for sizing. */
  className?: string;
  /** Highlight color for the wave. */
  fillStyle?: string;
}

export const ScrollingWaveform: React.FC<ScrollingWaveformProps> = ({
  getPeakDb,
  active,
  columns = 256,
  className,
  fillStyle,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<Float32Array>(new Float32Array(columns));
  const writeIdxRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // Recreate the ring buffer if `columns` changes — preserve any data
  // that fits.
  useEffect(() => {
    if (ringRef.current.length !== columns) {
      const next = new Float32Array(columns);
      const prev = ringRef.current;
      const copyLen = Math.min(prev.length, columns);
      // Copy the tail of the previous buffer into the head of the new one.
      for (let i = 0; i < copyLen; i++) {
        next[i] = prev[i];
      }
      ringRef.current = next;
      writeIdxRef.current = writeIdxRef.current % columns;
    }
  }, [columns]);

  useEffect(() => {
    if (!active) {
      // Freeze the wave but leave the existing buffer on screen.
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const tick = (): void => {
      const peakDb = getPeakDb();
      // Map dBFS → normalised amplitude [0, 1]. -60dB → 0, 0dB → 1.
      const amp =
        peakDb <= -120
          ? 0
          : Math.max(0, Math.min(1, (peakDb + 60) / 60));
      const ring = ringRef.current;
      ring[writeIdxRef.current] = amp;
      writeIdxRef.current = (writeIdxRef.current + 1) % ring.length;

      // Draw.
      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        const cssW = canvas.clientWidth;
        const cssH = canvas.clientHeight;
        if (cssW > 0 && cssH > 0) {
          if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
            canvas.width = Math.floor(cssW * dpr);
            canvas.height = Math.floor(cssH * dpr);
          }
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, cssW, cssH);
            ctx.fillStyle = fillStyle ?? '#6af2c5';
            const mid = cssH / 2;
            const cols = ring.length;
            const colW = cssW / cols;
            // Read the ring oldest → newest so the wave scrolls left.
            const start = writeIdxRef.current; // oldest sample
            for (let x = 0; x < cols; x++) {
              const ringIdx = (start + x) % cols;
              const a = ring[ringIdx];
              const half = a * mid;
              ctx.fillRect(x * colW, mid - half, Math.max(1, colW), Math.max(1, half * 2));
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [active, getPeakDb, fillStyle]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="scrolling-waveform"
      className={className ?? 'w-full h-12'}
    />
  );
};

export default ScrollingWaveform;
