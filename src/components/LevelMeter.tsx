/**
 * Shared level-meter component (Phase 8.10).
 *
 * Renders a horizontal bar from -60dBFS → 0dBFS:
 *   - Green up to -12dBFS
 *   - Yellow -12 to -3dBFS
 *   - Red above -3dBFS
 *   - Vertical marker at -6dBFS (the auto-set target)
 *   - Optional CLIP badge that the caller wires up
 *
 * Pure presentational: takes a current dB value and an `active` flag.
 * The caller is responsible for polling the engine and dispatching
 * the data. Reused by `AudioRoutingPanel` and the Recorder plugin's
 * panel so both meters look identical.
 */

import React from 'react';

export interface LevelMeterProps {
  /** Current peak level in dBFS. -120 means "no signal". */
  peakDb: number;
  /** True when the underlying audio callback is firing. False = floor. */
  active: boolean;
  /** Latched clip flag. When true, render the CLIP badge. */
  clipped?: boolean;
  /** User-clickable handler to clear the latched clip indicator. */
  onClearClip?: () => void;
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
  className,
  'data-testid': testId,
}) => {
  // Width as a function of dBFS: -60dB → 0%, 0dB → 100%.
  const widthPct = active
    ? Math.max(0, Math.min(100, ((peakDb + 60) / 60) * 100))
    : 0;
  const fillColor =
    peakDb > -3 ? '#dc3545' : peakDb > -12 ? '#ffc107' : '#28a745';

  return (
    <div
      className={`sas-level-meter ${className ?? ''}`}
      data-testid={testId ?? 'sas-level-meter'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <div
        style={{
          position: 'relative',
          flex: 1,
          height: 6,
          background: 'rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: 2,
          overflow: 'hidden',
          minWidth: 60,
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
        {/* -6dBFS target marker (90% of the bar's width). */}
        <div
          style={{
            position: 'absolute',
            top: -1,
            bottom: -1,
            left: '90%',
            width: 1,
            background: 'rgba(255, 255, 255, 0.5)',
          }}
          title="-6dBFS target"
        />
      </div>
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
      {clipped && (
        <span
          data-testid={`${testId ?? 'sas-level-meter'}-clip`}
          onClick={onClearClip}
          style={{
            padding: '1px 5px',
            fontSize: 9,
            fontWeight: 'bold',
            background: '#dc3545',
            color: 'white',
            borderRadius: 2,
            cursor: onClearClip ? 'pointer' : 'default',
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
