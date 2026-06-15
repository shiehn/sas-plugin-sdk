/**
 * Shared level-meter component (Phase 8.10).
 *
 * Renders a horizontal bar from -60dBFS → 0dBFS:
 *   - Accent (teal) up to -12dBFS
 *   - Amber -12 to -3dBFS
 *   - Danger (red) above -3dBFS
 *   - Vertical marker at -6dBFS (the auto-set target) — hidden in `compact` mode
 *   - Optional CLIP badge that the caller wires up
 *
 * Themed to the app's "Magic Terminal" palette so the recording meters and the
 * per-track strip meters look native. Pure presentational: takes a current dB
 * value and an `active` flag; the caller polls the engine and feeds the data.
 * Reused by `AudioRoutingPanel`, the Recorder panel, and the per-track strip
 * meter (`TrackMeterStrip`, via `compact`).
 */

import React from 'react';

// Magic Terminal palette (mirrors tailwind.config.js).
const COLOR_ACCENT = '#6AF2C5'; // teal — healthy level
const COLOR_AMBER = '#f59e0b';  // approaching peak
const COLOR_DANGER = '#FF5C7A'; // hot / clipping
const COLOR_TRACK_BG = '#121822'; // panel-alt
const COLOR_TRACK_BORDER = '#1F2A3A'; // border

export interface LevelMeterProps {
  /** Current peak level in dBFS. -120 means "no signal". */
  peakDb: number;
  /** True when the underlying audio callback is firing. False = floor. */
  active: boolean;
  /** Latched clip flag. When true, render the CLIP badge. */
  clipped?: boolean;
  /** User-clickable handler to clear the latched clip indicator. */
  onClearClip?: () => void;
  /**
   * Thin strip mode for per-track meters: hides the numeric dB readout and the
   * -6dB target marker, and shrinks the bar. Keeps the (rare) CLIP badge.
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
  clipped,
  onClearClip,
  compact = false,
  className,
  'data-testid': testId,
}) => {
  // Width as a function of dBFS: -60dB → 0%, 0dB → 100%.
  const widthPct = active
    ? Math.max(0, Math.min(100, ((peakDb + 60) / 60) * 100))
    : 0;
  const fillColor =
    peakDb > -3 ? COLOR_DANGER : peakDb > -12 ? COLOR_AMBER : COLOR_ACCENT;

  return (
    <div
      className={`sas-level-meter ${className ?? ''}`}
      data-testid={testId ?? 'sas-level-meter'}
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
          height: compact ? 4 : 6,
          background: COLOR_TRACK_BG,
          border: `1px solid ${COLOR_TRACK_BORDER}`,
          borderRadius: 2,
          overflow: 'hidden',
          minWidth: compact ? 0 : 60,
        }}
      >
        <div
          style={{
            width: `${widthPct}%`,
            height: '100%',
            background: fillColor,
            transition: 'width 30ms linear, background 100ms linear',
          }}
        />
        {/* -6dBFS target marker (90% of the bar's width) — only in full mode. */}
        {!compact && (
          <div
            style={{
              position: 'absolute',
              top: -1,
              bottom: -1,
              left: '90%',
              width: 1,
              background: 'rgba(255, 255, 255, 0.4)',
            }}
            title="-6dBFS target"
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
          data-testid={`${testId ?? 'sas-level-meter'}-clip`}
          onClick={onClearClip}
          style={{
            padding: '1px 5px',
            fontSize: 9,
            fontWeight: 'bold',
            background: COLOR_DANGER,
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
