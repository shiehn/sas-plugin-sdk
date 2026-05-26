/**
 * OffsetScrubber — manual sample-offset slider for Lyria-generated audio.
 *
 * Renders a thin horizontal track with one tick per detected beat (tall
 * tick on the downbeat) and a draggable thumb. Drag distance maps to a
 * sample offset that is applied to the audio clip via
 * `host.setAudioOffsetSamples(trackId, n)`.
 *
 * Snap behavior:
 *   - Default: snap to the nearest beat in `cuePoints.beats`.
 *   - Hold Shift: bypass snap (free 1-sample resolution).
 *   - Click on a tick mark: jump to that beat exactly.
 *
 * The visible range is one bar (= meter beats) on each side of bar 1.
 * For a 4-bar / 4/4 clip at 44100 Hz, one bar at 120 BPM is 88_200
 * samples — so the slider covers ±88_200 samples, ~2 s either way. That
 * matches the alignment errors we observe from Lyria detection misses
 * (typically <1 beat off).
 *
 * BPM mismatch chip: shown when `cuePoints.detected_bpm` is more than
 * 1 BPM away from the project BPM, since the beat ticks won't line up
 * with the project grid in that case.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PluginCuePoints } from '../types/plugin-sdk.types';

const SLIDER_HEIGHT_PX = 28;
const TICK_HEIGHT_PX = 14;
const DOWNBEAT_TICK_HEIGHT_PX = 22;
const THUMB_WIDTH_PX = 4;

export interface OffsetScrubberProps {
  /** Detected beat positions + sample rate. Slider is disabled when null. */
  cuePoints: PluginCuePoints | null;
  /** Current offset, in samples (signed). */
  offsetSamples: number;
  /** Project BPM — used to compute the visible range and the mismatch chip. */
  projectBpm: number;
  /** Beats per bar, defaults to 4. */
  meter?: number;
  /** Called on drag-end with the resolved offset (already snapped). */
  onChange: (offsetSamples: number) => void;
  /** Disable interaction (e.g., during generation / split). */
  disabled?: boolean;
}

export function OffsetScrubber({
  cuePoints,
  offsetSamples,
  projectBpm,
  meter = 4,
  onChange,
  disabled = false,
}: OffsetScrubberProps): React.ReactElement {
  const trackRef = useRef<HTMLDivElement | null>(null);
  // Local optimistic offset during drag — committed on mouseup
  const [draftOffset, setDraftOffset] = useState<number>(offsetSamples);
  const [isDragging, setIsDragging] = useState(false);

  // Keep the draft synced with the parent prop when not dragging.
  useEffect(() => {
    if (!isDragging) setDraftOffset(offsetSamples);
  }, [offsetSamples, isDragging]);

  // Range is ±1 bar of samples around the downbeat.
  // beats are 60 / bpm seconds; bar = meter beats.
  const sampleRate = cuePoints?.sample_rate ?? 44100;
  const detectedBpm = cuePoints?.detected_bpm ?? projectBpm;
  const beatsForRange = useMemo(() => {
    // Use the project BPM for the visible range so the slider scale
    // matches what the user is editing against in the timeline.
    return Math.round((60 / projectBpm) * sampleRate);
  }, [projectBpm, sampleRate]);
  const rangeSamples = beatsForRange * meter;  // ±1 bar

  // Map a sample offset to a 0..1 position on the slider track.
  const sampleToFraction = useCallback(
    (sample: number): number => {
      const clamped = Math.max(-rangeSamples, Math.min(rangeSamples, sample));
      return (clamped + rangeSamples) / (2 * rangeSamples);
    },
    [rangeSamples],
  );

  const fractionToSample = useCallback(
    (fraction: number): number => {
      const clamped = Math.max(0, Math.min(1, fraction));
      return Math.round(clamped * 2 * rangeSamples - rangeSamples);
    },
    [rangeSamples],
  );

  // Snap a candidate sample to the nearest detected beat. Beats are
  // CuePoints.beats positions (relative to clip start). Offset slider
  // semantics: positive = shift clip later; we map offset onto the
  // beats array so the user lines up the desired beat with bar 1.
  //
  // Implementation: each beat[i] corresponds to a candidate offset
  // value of `beats[i] - beats[0]` (the relative distance the user has
  // shifted the clip). Snap to the nearest such candidate.
  const snapTargets = useMemo(() => {
    if (!cuePoints || cuePoints.beats.length === 0) return [];
    const downbeat = cuePoints.beats[0];
    // Snap candidates: differences between every beat and the downbeat
    // (positive shifts) plus their negation (negative shifts). De-dup +
    // sort so binary search is cheap if the array gets large.
    const positives = cuePoints.beats.map((b) => b - downbeat);
    const negatives = positives.slice(1).map((p) => -p);  // skip 0 to avoid dupe
    return [...negatives, ...positives].sort((a, b) => a - b);
  }, [cuePoints]);

  const snapToBeat = useCallback(
    (sample: number): number => {
      if (snapTargets.length === 0) return sample;
      // Linear scan — beats[] is small (≤ 16 for v1). Switch to binary
      // search if we ever generate longer clips.
      let best = snapTargets[0];
      let bestDist = Math.abs(sample - best);
      for (const t of snapTargets) {
        const d = Math.abs(sample - t);
        if (d < bestDist) {
          best = t;
          bestDist = d;
        }
      }
      return best;
    },
    [snapTargets],
  );

  // Drag handler — pointer events let us track outside the element.
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      if (disabled || !cuePoints) return;
      e.preventDefault();
      const track = trackRef.current;
      if (!track) return;
      track.setPointerCapture(e.pointerId);
      setIsDragging(true);

      const updateFromEvent = (clientX: number, shiftHeld: boolean): number => {
        const rect = track.getBoundingClientRect();
        const fraction = (clientX - rect.left) / rect.width;
        const raw = fractionToSample(fraction);
        return shiftHeld ? raw : snapToBeat(raw);
      };

      // Apply the initial click position immediately.
      setDraftOffset(updateFromEvent(e.clientX, e.shiftKey));

      const onMove = (ev: PointerEvent): void => {
        setDraftOffset(updateFromEvent(ev.clientX, ev.shiftKey));
      };
      const onUp = (ev: PointerEvent): void => {
        const final = updateFromEvent(ev.clientX, ev.shiftKey);
        track.releasePointerCapture(e.pointerId);
        track.removeEventListener('pointermove', onMove);
        track.removeEventListener('pointerup', onUp);
        track.removeEventListener('pointercancel', onUp);
        setIsDragging(false);
        setDraftOffset(final);
        onChange(final);
      };

      track.addEventListener('pointermove', onMove);
      track.addEventListener('pointerup', onUp);
      track.addEventListener('pointercancel', onUp);
    },
    [disabled, cuePoints, fractionToSample, onChange, snapToBeat],
  );

  // Reset to 0 (downbeat-aligned) — handy "snap to bar 1" button.
  const handleResetToZero = useCallback((): void => {
    if (disabled) return;
    setDraftOffset(0);
    onChange(0);
  }, [disabled, onChange]);

  const thumbFraction = sampleToFraction(draftOffset);
  const thumbLeftPct = `${(thumbFraction * 100).toFixed(2)}%`;

  // BPM mismatch — show a chip when detected BPM diverges from project.
  const bpmMismatch = cuePoints?.detected_bpm != null
    && Math.abs(cuePoints.detected_bpm - projectBpm) > 1;

  // Render tick marks for each beat in the snap-target list. Convert
  // sample → fraction → percent for CSS positioning.
  const ticks = useMemo(() => {
    if (!cuePoints) return [];
    const downbeat = cuePoints.beats[0] ?? 0;
    return cuePoints.beats.map((b, i) => {
      const offsetCandidate = b - downbeat;
      const fraction = sampleToFraction(offsetCandidate);
      const isDownbeat = i === 0;
      return { i, fraction, isDownbeat };
    });
  }, [cuePoints, sampleToFraction]);

  const isDisabled = disabled || !cuePoints || cuePoints.beats.length === 0;

  return (
    <div data-testid="offset-scrubber" className="flex items-center gap-2 w-full">
      <span className="text-[9px] text-sas-muted/60 uppercase tracking-wide flex-shrink-0">
        Align
      </span>
      <div
        ref={trackRef}
        data-testid="offset-scrubber-track"
        onPointerDown={handlePointerDown}
        className={`relative flex-1 min-w-0 rounded-sm select-none ${
          isDisabled
            ? 'bg-sas-panel cursor-not-allowed opacity-40'
            : 'bg-sas-bg cursor-pointer'
        }`}
        style={{ height: SLIDER_HEIGHT_PX }}
        title={
          isDisabled
            ? 'Generate audio first to enable offset alignment'
            : 'Drag to align beat 1. Hold Shift for free, no-snap movement.'
        }
        role="slider"
        aria-label="Audio offset alignment"
        aria-valuemin={-rangeSamples}
        aria-valuemax={rangeSamples}
        aria-valuenow={draftOffset}
        aria-disabled={isDisabled}
      >
        {/* Center marker — bar 1 / beat 1 reference line */}
        <div
          aria-hidden="true"
          className="absolute top-0 bottom-0 w-px bg-sas-accent/40"
          style={{ left: '50%' }}
        />
        {/* Beat ticks */}
        {ticks.map((t) => (
          <div
            key={t.i}
            data-testid={t.isDownbeat ? 'offset-tick-downbeat' : 'offset-tick'}
            aria-hidden="true"
            className={t.isDownbeat ? 'absolute bg-sas-accent' : 'absolute bg-sas-muted/50'}
            style={{
              left: `${(t.fraction * 100).toFixed(2)}%`,
              top: (SLIDER_HEIGHT_PX - (t.isDownbeat ? DOWNBEAT_TICK_HEIGHT_PX : TICK_HEIGHT_PX)) / 2,
              width: 1,
              height: t.isDownbeat ? DOWNBEAT_TICK_HEIGHT_PX : TICK_HEIGHT_PX,
            }}
          />
        ))}
        {/* Thumb */}
        <div
          data-testid="offset-scrubber-thumb"
          aria-hidden="true"
          className={`absolute top-0 bottom-0 rounded-sm ${
            isDragging ? 'bg-sas-accent' : 'bg-sas-accent/80'
          }`}
          style={{
            left: thumbLeftPct,
            width: THUMB_WIDTH_PX,
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
          }}
        />
      </div>
      {/* Numeric readout — samples + millisecond equivalent */}
      <span
        data-testid="offset-scrubber-readout"
        className="text-[10px] text-sas-muted/70 tabular-nums flex-shrink-0 min-w-[64px] text-right"
      >
        {formatOffset(draftOffset, sampleRate)}
      </span>
      {/* Reset button (snap back to 0) */}
      <button
        type="button"
        data-testid="offset-scrubber-reset"
        onClick={handleResetToZero}
        disabled={isDisabled || draftOffset === 0}
        className={`text-[10px] px-1 py-0.5 rounded-sm border transition-colors flex-shrink-0 ${
          isDisabled || draftOffset === 0
            ? 'border-sas-border text-sas-muted/30 cursor-not-allowed'
            : 'border-sas-border text-sas-muted/70 hover:border-sas-accent hover:text-sas-accent'
        }`}
        title="Reset offset to 0 (bar 1)"
      >
        ⌖
      </button>
      {bpmMismatch && (
        <span
          data-testid="offset-bpm-mismatch"
          className="text-[9px] px-1 py-0.5 rounded-sm bg-amber-500/15 text-amber-400 border border-amber-500/30 flex-shrink-0"
          title={`Detected ${detectedBpm.toFixed(1)} BPM — beats may not align with project ${projectBpm} BPM grid`}
        >
          BPM ≠
        </span>
      )}
    </div>
  );
}

/** Format an offset in samples as `+12345 spl (+279 ms)` for the readout. */
function formatOffset(samples: number, sampleRate: number): string {
  const sign = samples > 0 ? '+' : samples < 0 ? '-' : '';
  const abs = Math.abs(samples);
  const ms = Math.round((abs / sampleRate) * 1000);
  return `${sign}${abs} spl (${sign}${ms} ms)`;
}

export default OffsetScrubber;
