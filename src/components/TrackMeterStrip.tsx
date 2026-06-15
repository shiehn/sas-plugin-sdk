/**
 * TrackMeterStrip — the thin per-track peak meter welded to the bottom of a
 * track row. Cosmetic: gives a general sense of each track's level and adds
 * motion during playback.
 *
 * This is deliberately its OWN component so the per-row meter selector
 * (`useTrackMeter`) re-renders ONLY this strip at ~30Hz, never the heavy
 * TrackRow around it. Render it as a full-width sibling directly under a row
 * body; it welds on with a squared top edge (like the track drawer does).
 */

import React from 'react';
import { LevelMeter } from './LevelMeter';
import { useTrackMeter, type TrackLevelsHandle } from '../hooks/useTrackLevels';

export interface TrackMeterStripProps {
  /** Shared meter handle from `useTrackLevels(host, isPlaying)`. */
  levels: TrackLevelsHandle;
  /** Tracktion engine track id (matches `PluginTrackHandle.id`). */
  trackId: string;
  /** Round the bottom corners (false when a drawer welds on below). Default true. */
  roundBottom?: boolean;
  /** Optional className for layout tweaks on the wrapper. */
  className?: string;
}

export const TrackMeterStrip: React.FC<TrackMeterStripProps> = ({
  levels,
  trackId,
  roundBottom = true,
  className,
}) => {
  const meter = useTrackMeter(levels, trackId);

  return (
    <div
      data-testid="sdk-track-meter"
      className={`w-full px-2 py-1 bg-sas-panel-alt border border-t-0 border-sas-border ${roundBottom ? 'rounded-b-sm' : ''} ${className ?? ''}`}
    >
      <LevelMeter
        compact
        active={meter.active}
        peakDb={meter.peakDb}
        peakHoldDb={meter.peakHoldDb}
        clipped={meter.clipped}
        data-testid={`sdk-track-meter-bar-${trackId}`}
      />
    </div>
  );
};

export default TrackMeterStrip;
