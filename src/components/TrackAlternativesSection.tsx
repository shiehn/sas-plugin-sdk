/**
 * TrackAlternativesSection — the FX-drawer control that makes a track one of
 * n ALTERNATIVES (@since SDK 2.66.0).
 *
 * Alternatives are interchangeable variants of the same part — a second Lead
 * with a different preset, say. They are equally good and fill the same role,
 * so they must never sound together: the host round-robins them, one member
 * per loop cycle, and the arranger staggers them across the arrangement
 * instead of stacking them.
 *
 * Ungrouped: pick a sibling track to pair with. Grouped: see the members and
 * leave the group. The candidate list is pre-filtered to what the host will
 * actually accept (same panel, not already in a different group), so no
 * offered choice can fail.
 */

import React, { useState } from 'react';

/** One track offered as (or already serving as) an alternative. */
export interface AltTrackOption {
  /** Engine track id — what the grouping calls take. */
  trackId: string;
  /** Stable DB id (React key; also the host's membership key). */
  dbId: string;
  name: string;
}

export interface TrackAlternativesSectionProps {
  /** Members of this track's group INCLUDING itself, in rotation order; empty when ungrouped. */
  members: AltTrackOption[];
  /** Tracks that could join (ungrouped case) or be added (grouped case). */
  candidates: AltTrackOption[];
  /** This track's engine id. */
  trackId: string;
  /** Group this track with the chosen sibling (or add the sibling to the group). */
  onGroup: (otherTrackId: string) => void;
  /** Leave the group (dissolves it when only one member would remain). */
  onUngroup: () => void;
  disabled?: boolean;
}

export function TrackAlternativesSection({
  members,
  candidates,
  trackId,
  onGroup,
  onUngroup,
  disabled = false,
}: TrackAlternativesSectionProps): React.ReactElement {
  const [picked, setPicked] = useState<string>('');
  const grouped = members.length > 1;

  return (
    <div className="flex flex-col gap-1 pt-1 border-t border-sas-border" data-testid="sdk-alt-section">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-sas-muted">Alternatives</span>
        <span
          className="text-[10px] text-sas-muted/60"
          title="Alternatives are interchangeable versions of this part. Only one plays per loop — the host rotates them, and the arranger spreads them across the arrangement instead of layering them."
        >
          ⓘ
        </span>
      </div>

      {grouped ? (
        <>
          <div className="text-[11px] text-sas-muted/80 leading-snug">
            Rotating with{' '}
            {members
              .filter((m) => m.trackId !== trackId)
              .map((m) => m.name)
              .join(', ')}{' '}
            — one plays per loop.
          </div>
          <button
            type="button"
            data-testid="sdk-alt-ungroup"
            onClick={onUngroup}
            disabled={disabled}
            className="self-start px-1.5 py-0.5 text-[10px] rounded-sm border border-sas-border text-sas-muted hover:text-sas-accent hover:border-sas-accent transition-colors disabled:opacity-40"
          >
            Remove from group
          </button>
        </>
      ) : candidates.length === 0 ? (
        <div className="text-[11px] text-sas-muted/60 leading-snug">
          Add another track to this panel to pair it as an alternative.
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <select
            data-testid="sdk-alt-picker"
            value={picked}
            disabled={disabled}
            onChange={(e) => setPicked(e.target.value)}
            className="flex-1 min-w-0 px-1 py-0.5 text-[11px] bg-transparent border border-sas-border rounded-sm text-sas-text focus:border-sas-accent outline-none disabled:opacity-40"
          >
            <option value="">Pair with…</option>
            {candidates.map((c) => (
              <option key={c.dbId} value={c.trackId}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid="sdk-alt-group"
            disabled={disabled || picked === ''}
            onClick={() => {
              if (picked === '') return;
              onGroup(picked);
              setPicked('');
            }}
            className="px-1.5 py-0.5 text-[10px] rounded-sm border border-sas-border text-sas-muted hover:text-sas-accent hover:border-sas-accent transition-colors disabled:opacity-40"
          >
            Group
          </button>
        </div>
      )}
    </div>
  );
}
