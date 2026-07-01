/**
 * FadeTrackRow — a transition "fade track": a single locked TrackRow with a
 * direction badge (Fade in / Fade out) and a one-sided fade slider.
 *
 * A fade is a crossfade with one empty endpoint — a lone generated track that
 * either enters (fade in, for a target-only track) or leaves (fade out, for an
 * origin-only track) across the transition loop. Like a crossfade layer, the
 * sound/generation controls are omitted (the SDK TrackRow is "controlled by
 * omission"): no shuffle / Create / preset-pick / FX / drawer / inner-delete.
 * What remains: per-track volume/pan/mute/solo and a single delete.
 *
 * The slider represents WHERE in the loop the fade sits (earlier ↔ later). Omit
 * `onSliderChange` to render it read-only.
 *
 * @since SDK 2.28.0
 */
import React from 'react';
import { TrackRow } from './TrackRow';
import { ConfirmDialog } from './ConfirmDialog';
import { EMPTY_FX_DETAIL_STATE } from '../types/fx-toggle.types';
import type { TrackLevelsHandle } from '../hooks/useTrackLevels';
import type { FadeDirection, FadeGesture } from '../fade-meta';

/** The single (engine track) layer of a fade. */
export interface FadeLayer {
  /** Engine track id of this fade's track (also the meter key). */
  trackId: string;
  /** Display name of this fade's (newly created) track. */
  name: string;
  /** Musical role (drives the auto gesture). */
  role?: string;
  /** Name of the SOURCE track this fade was seeded from (origin/target scene). */
  sourceName?: string;
  /** Human label of the copied preset/sound, shown in the caption. */
  soundLabel?: string;
  /** Playback state for this track. */
  runtimeState: { muted: boolean; solo: boolean; volume: number; pan: number };
}

export interface FadeTrackRowProps {
  /** The lone fade track. */
  layer: FadeLayer;
  /** 'in' (enters across the loop) or 'out' (leaves across the loop). */
  direction: FadeDirection;
  /** How the fade is shaped — shown read-only (volume = level ramp, build = notes). */
  gesture: FadeGesture;
  /** Audio transition variant — relabels the badge (Stutter/Chopped/Delay). @since SDK 2.32.0 */
  effect?: 'fade' | 'stutter' | 'chopped' | 'delay';
  /** Fade position 0..1 — WHERE in time the fade sits. Defaults centered. */
  sliderPos?: number;
  /** Toggle mute. */
  onMuteToggle: () => void;
  /** Toggle solo. */
  onSoloToggle: () => void;
  /** Change the track's volume. */
  onVolumeChange: (volume: number) => void;
  /** Change the track's pan. */
  onPanChange: (pan: number) => void;
  /** Delete the fade. */
  onDelete: () => void;
  /** Move the fade point. Omit to render the slider read-only. */
  onSliderChange?: (pos: number) => void;
  /** Shared meter handle (welds a peak meter to the track). */
  levels?: TrackLevelsHandle;
  /** Left-border accent. Defaults to transition purple. */
  accentColor?: string;
}

function FadeCaption({
  layer,
  direction,
  gesture,
}: {
  layer: FadeLayer;
  direction: FadeDirection;
  gesture: FadeGesture;
}): React.ReactElement {
  const tag = direction === 'in' ? 'Fade in' : 'Fade out';
  return (
    <div className="flex items-center gap-1.5 min-w-0 px-2 py-0.5">
      <span className="text-[9px] font-bold uppercase tracking-wide text-sas-accent flex-shrink-0">{tag}</span>
      <span className="text-[11px] text-sas-text truncate" title={layer.sourceName ?? layer.name}>
        {layer.sourceName ?? layer.name}
      </span>
      {layer.soundLabel && (
        <span className="text-[9px] text-sas-muted/60 truncate flex-shrink-0" title={layer.soundLabel}>
          · {layer.soundLabel}
        </span>
      )}
      <span className="text-[9px] text-sas-muted/50 flex-shrink-0" title={`Fade gesture: ${gesture}`}>
        · {gesture}
      </span>
    </div>
  );
}

export function FadeTrackRow({
  layer,
  direction,
  gesture,
  effect,
  sliderPos = 0.5,
  onMuteToggle,
  onSoloToggle,
  onVolumeChange,
  onPanChange,
  onDelete,
  onSliderChange,
  levels,
  accentColor = '#9333EA',
}: FadeTrackRowProps): React.ReactElement {
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  // Slider end labels: a fade-in goes (silent → track), a fade-out goes (track → silent).
  const leftLabel = direction === 'in' ? '(silent)' : (layer.sourceName ?? layer.name);
  const rightLabel = direction === 'in' ? (layer.sourceName ?? layer.name) : '(silent)';
  const verb = effect && effect !== 'fade' ? effect.charAt(0).toUpperCase() + effect.slice(1) : 'Fade';
  const badge = direction === 'in' ? `↗ ${verb} in` : `↘ ${verb} out`;

  return (
    <div
      data-testid="fade-track-row"
      className="w-full rounded-sm border border-sas-border bg-sas-panel/40 overflow-hidden"
      style={{ borderLeftColor: accentColor, borderLeftWidth: '3px' }}
    >
      {/* Header — direction badge + single delete. */}
      <div className="flex items-center justify-between px-2 py-1 bg-sas-panel-alt/60">
        <span
          data-testid="fade-direction-badge"
          className="text-[10px] font-bold uppercase tracking-wide"
          style={{ color: accentColor }}
        >
          {badge}
        </span>
        <button
          data-testid="fade-delete-button"
          onClick={() => setConfirmDelete(true)}
          className="text-sas-danger/70 hover:text-sas-danger px-1 transition-colors text-sm"
          title="Delete fade"
          aria-label="Delete fade"
        >
          x
        </button>
      </div>

      {/* The lone, locked track. Sound/generation controls are omitted; the
          meaningful name + direction live in the caption. */}
      <TrackRow
        track={{ id: layer.trackId, name: '', role: layer.role }}
        runtimeState={layer.runtimeState}
        fxDetailState={EMPTY_FX_DETAIL_STATE}
        drawerOpen={false}
        drawerTab="fx"
        levels={levels}
        accentColor={accentColor}
        contentSlot={<FadeCaption layer={layer} direction={direction} gesture={gesture} />}
        onMuteToggle={onMuteToggle}
        onSoloToggle={onSoloToggle}
        onVolumeChange={onVolumeChange}
        onPanChange={onPanChange}
      />

      {/* Fade slider — WHERE in the loop the fade sits. Read-only until wired. */}
      <div className="flex items-center gap-2 px-3 py-1.5" data-testid="fade-slider-row">
        <span
          className="text-[9px] text-sas-muted/60 truncate max-w-[70px] text-right flex-shrink-0"
          title={leftLabel}
        >
          {leftLabel}
        </span>
        <input
          type="range"
          data-testid="fade-slider"
          min={0}
          max={1}
          step={0.01}
          value={sliderPos}
          disabled={!onSliderChange}
          onChange={
            onSliderChange
              ? (e: React.ChangeEvent<HTMLInputElement>) => onSliderChange(Number(e.target.value))
              : undefined
          }
          style={{ accentColor }}
          className="flex-1 disabled:opacity-60 disabled:cursor-not-allowed"
          aria-label="Fade position"
        />
        <span
          className="text-[9px] text-sas-muted/60 truncate max-w-[70px] flex-shrink-0"
          title={rightLabel}
        >
          {rightLabel}
        </span>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete fade?"
        message={<>This fade track will be permanently removed from this scene. This cannot be undone.</>}
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete();
        }}
        onCancel={() => setConfirmDelete(false)}
        testIdPrefix="fade-delete-confirm"
      />
    </div>
  );
}

export default FadeTrackRow;
