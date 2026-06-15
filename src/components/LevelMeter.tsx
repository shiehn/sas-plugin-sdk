/**
 * Shared level-meter component.
 *
 * Renders a horizontal LED-style bar over -60dBFS → 0dBFS:
 *   - A fixed left-to-right gradient (green → orange → red), so the color is
 *     tied to POSITION: a quiet signal lights only the green left, a hot signal
 *     reaches the red right. An "unlit" mask hides the gradient beyond the
 *     current level.
 *   - A deterministic segment grid (the "LED monitor" look) drawn as a pure-CSS
 *     repeating overlay — constant DOM, no per-frame cost.
 *   - An optional peak-hold marker (`peakHoldDb`) — a bright line at the recent
 *     maximum that the caller holds/decays (see `useTrackMeter`).
 *   - An optional CLIP badge the caller wires up.
 *
 * Pure presentational: takes the current dB + `active` flag (+ optional held
 * peak) and draws. The only production consumer is the per-track strip
 * (`TrackMeterStrip`, via `compact`). `compact` shrinks the bar and drops the
 * numeric dB readout.
 */

import React from 'react';

// Traffic-light gradient (introduced for the LED meter; the Magic Terminal
// palette has no green/orange/red tokens). Tweakable.
const COLOR_GREEN = '#2BD576';
const COLOR_ORANGE = '#F5A623';
const COLOR_RED = '#FF4D5E';
const COLOR_TRACK_BG = '#121822';     // panel-alt — the unlit bar / mask
const COLOR_TRACK_BORDER = '#1F2A3A'; // border
const COLOR_SEGMENT_GAP = '#0A0E14';  // dark gutter between LED cells
const COLOR_PEAK = '#F7FFFB';         // held-peak marker (bright)

// The positional gradient. Mostly green, orange in the upper-mid, red near the
// top — the classic meter feel, while still visibly tri-color across the bar.
const METER_GRADIENT = `linear-gradient(90deg, ${COLOR_GREEN} 0%, ${COLOR_GREEN} 45%, ${COLOR_ORANGE} 72%, ${COLOR_RED} 90%, ${COLOR_RED} 100%)`;

// Deterministic LED sections + the gutter width between them.
const SEGMENTS = 22;
const SEGMENT_GAP_PX = 2;

/** dBFS → bar % : -60dB → 0%, 0dB → 100%, clamped. */
function dbToPct(db: number): number {
  return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
}

export interface LevelMeterProps {
  /** Current peak level in dBFS. -120 means "no signal". */
  peakDb: number;
  /** True when the underlying audio callback is firing. False = floor. */
  active: boolean;
  /**
   * Held peak in dBFS for the peak-hold marker. Omit to draw no marker. The
   * marker is hidden when this is at/below the visible floor (-60).
   */
  peakHoldDb?: number;
  /** Latched clip flag. When true, render the CLIP badge. */
  clipped?: boolean;
  /** User-clickable handler to clear the latched clip indicator. */
  onClearClip?: () => void;
  /**
   * Thin strip mode for per-track meters: hides the numeric dB readout and
   * shrinks the bar. Keeps the (rare) CLIP badge.
   */
  compact?: boolean;
  /** Optional className overlaid on the wrapper for layout tweaks. */
  className?: string;
  /** Inline test id — make multiple instances distinguishable. */
  'data-testid'?: string;
}

export const LevelMeter: React.FC<LevelMeterProps> = ({
  peakDb,
  active,
  peakHoldDb,
  clipped,
  onClearClip,
  compact = false,
  className,
  'data-testid': testId,
}) => {
  const id = testId ?? 'sas-level-meter';
  const widthPct = active ? dbToPct(peakDb) : 0;
  const showPeak = peakHoldDb != null && active && peakHoldDb > -60;
  const peakHoldPct = showPeak ? dbToPct(peakHoldDb!) : 0;

  return (
    <div
      className={`sas-level-meter ${className ?? ''}`}
      data-testid={id}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 0 : 6,
      }}
    >
      <div
        style={{
          position: 'relative',
          flex: 1,
          height: compact ? 5 : 7,
          background: COLOR_TRACK_BG,
          border: `1px solid ${COLOR_TRACK_BORDER}`,
          borderRadius: 2,
          overflow: 'hidden',
          minWidth: compact ? 0 : 60,
        }}
      >
        {/* Positional green→orange→red gradient, full bar width. */}
        <div style={{ position: 'absolute', inset: 0, background: METER_GRADIENT }} />

        {/* Unlit mask: hides the gradient from the current level rightward. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${widthPct}%`,
            right: 0,
            background: COLOR_TRACK_BG,
            transition: 'left 30ms linear',
          }}
        />

        {/* Deterministic LED segment gutters — pure CSS, constant DOM. */}
        <div
          data-testid={`${id}-segments`}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backgroundImage: `linear-gradient(90deg, transparent 0, transparent calc(100% - ${SEGMENT_GAP_PX}px), ${COLOR_SEGMENT_GAP} calc(100% - ${SEGMENT_GAP_PX}px), ${COLOR_SEGMENT_GAP} 100%)`,
            backgroundSize: `calc(100% / ${SEGMENTS}) 100%`,
          }}
        />

        {/* Peak-hold marker: a bright line at the recent maximum. */}
        {showPeak && (
          <div
            data-testid={`${id}-peak`}
            style={{
              position: 'absolute',
              top: -1,
              bottom: -1,
              left: `${peakHoldPct}%`,
              width: 2,
              marginLeft: -1,
              background: COLOR_PEAK,
              boxShadow: '0 0 4px rgba(247, 255, 251, 0.7)',
              transition: 'left 80ms linear',
            }}
            title="Peak"
          />
        )}
      </div>

      {!compact && (
        <span
          style={{
            fontSize: 10,
            color: 'var(--sas-muted, #888)',
            fontVariantNumeric: 'tabular-nums',
            minWidth: 48,
            textAlign: 'right',
          }}
        >
          {active && peakDb > -120 ? `${peakDb.toFixed(0)} dB` : '—'}
        </span>
      )}
      {clipped && (
        <span
          data-testid={`${id}-clip`}
          onClick={onClearClip}
          style={{
            padding: '1px 5px',
            fontSize: 9,
            fontWeight: 'bold',
            background: COLOR_RED,
            color: '#0A0E14',
            borderRadius: 2,
            cursor: onClearClip ? 'pointer' : 'default',
            marginLeft: compact ? 3 : 0,
          }}
          title={onClearClip ? 'Clipped — click to clear' : 'Clipped'}
        >
          CLIP
        </span>
      )}
    </div>
  );
};

export default LevelMeter;
