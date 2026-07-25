/**
 * TrackFreezeSection — the drawer's Freeze tab body (@since SDK 2.46.0).
 *
 * Presentational: TrackDrawer owns the freeze state (it also needs it to
 * lock the sound-editing tabs while frozen) and passes it down with the two
 * actions. Freezing renders the track's sound chain to a FADER-NEUTRAL stem
 * on the same track and disables the plugins — volume, pan, mute and solo
 * stay fully live, so freezing never changes the mix. Unfreezing restores
 * the chain (including per-FX bypass flags) and keeps the stem for instant
 * re-freeze.
 */

import React from 'react';
import type { TrackFreezeState } from '../types/plugin-sdk.types';

export interface TrackFreezeSectionProps {
  /** null = state not loaded yet (host fetch in flight or failed). */
  state: TrackFreezeState | null;
  busy: 'freeze' | 'unfreeze' | null;
  error: string | null;
  onFreeze: () => void;
  onUnfreeze: () => void;
}

const STALE_LABELS: Record<string, string> = {
  midi: 'MIDI changed',
  preset: 'preset changed',
  instrument: 'instrument changed',
  'external-fx': 'FX changed',
  role: 'role changed',
};

export function TrackFreezeSection({
  state,
  busy,
  error,
  onFreeze,
  onUnfreeze,
}: TrackFreezeSectionProps): React.ReactElement {
  const frozen = state?.frozen === true;
  const stale = frozen && state?.stale === true;
  const missing = state?.missingDeps ?? [];
  const unfreezeBlocked = frozen && missing.length > 0;

  const statusLine = !state
    ? 'Reading freeze state…'
    : !frozen
      ? state.latentFreshFreeze
        ? 'Live — a fresh stem is cached, freezing is instant.'
        : 'Live — playing through the instrument and FX chain.'
      : stale
        ? `⚠️❄ Frozen (stale) — ${state.staleReasons.map((r: string) => STALE_LABELS[r] ?? r).join(', ')} since the stem rendered. Playback keeps the old stem until you re-freeze.`
        : '❄ Frozen — playing the rendered stem. Mixer (volume · pan · mute · solo) stays live.';

  const primaryLabel = busy === 'freeze'
    ? 'Rendering stem…'
    : busy === 'unfreeze'
      ? 'Restoring chain…'
      : !frozen
        ? '❄ Freeze track'
        : stale
          ? '❄ Re-freeze (render new stem)'
          : 'Unfreeze track';
  const primaryAction = !frozen || stale ? onFreeze : onUnfreeze;
  const primaryDisabled = busy !== null || !state || (frozen && !stale && unfreezeBlocked);

  return (
    <div className="flex flex-col gap-2" data-testid="sdk-freeze-section">
      <p className="text-[11px] text-sas-muted/80 leading-snug" data-testid="sdk-freeze-status">
        {statusLine}
      </p>

      {frozen && missing.length > 0 && (
        <div
          className="text-[11px] leading-snug rounded-sm border border-sas-border bg-sas-panel-alt px-2 py-1.5 text-sas-muted"
          data-testid="sdk-freeze-missing-deps"
        >
          Missing on this machine:{' '}
          <span className="text-sas-accent">{missing.map((d) => d.name).join(', ')}</span>
          {'. '}
          Install (or rescan plugins if blacklisted) to unfreeze — the frozen sound keeps playing
          meanwhile.
        </div>
      )}

      <button
        type="button"
        data-testid="sdk-freeze-primary"
        disabled={primaryDisabled}
        onClick={primaryAction}
        className={`w-full py-2 text-xs font-medium rounded-sm border transition-colors ${
          primaryDisabled
            ? 'border-sas-border text-sas-muted/40 cursor-not-allowed'
            : 'border-sas-accent bg-sas-accent/20 text-sas-accent hover:bg-sas-accent/40'
        }`}
        title={
          !frozen
            ? 'Render this track to audio and disable its plugins (mix controls stay live)'
            : stale
              ? 'Sound inputs changed — render a fresh stem'
              : unfreezeBlocked
                ? 'Unfreeze needs the missing plugins installed'
                : 'Remove the stem and re-enable the instrument + FX chain'
        }
      >
        {primaryLabel}
      </button>

      {frozen && stale && !unfreezeBlocked && (
        <button
          type="button"
          data-testid="sdk-freeze-unfreeze-secondary"
          disabled={busy !== null}
          onClick={onUnfreeze}
          className="w-full py-1.5 text-[11px] rounded-sm border border-sas-border text-sas-muted hover:border-sas-accent hover:text-sas-accent transition-colors"
        >
          Unfreeze instead (back to live editing)
        </button>
      )}

      {error && (
        <p className="text-[11px] text-red-400 leading-snug" data-testid="sdk-freeze-error">
          {error}
        </p>
      )}

      <p className="text-[10px] text-sas-muted/50 leading-snug">
        Frozen tracks survive missing plugins and travel inside project backups. The stem is kept
        after unfreezing, so re-freezing an unchanged track is instant.
      </p>
    </div>
  );
}
