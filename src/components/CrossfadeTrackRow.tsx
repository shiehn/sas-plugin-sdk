/**
 * CrossfadeTrackRow — a transition "crossfade track": two stacked TrackRows
 * (origin on top, target on bottom) joined by a horizontal crossfade slider.
 *
 * Both layers play the SAME generated MIDI; the top wears the ORIGIN scene
 * track's preset and the bottom wears the TARGET scene track's preset. The user
 * cannot regenerate, shuffle, or change the preset/sample on either layer —
 * those controls are simply not wired into the inner TrackRows (the SDK
 * TrackRow is "controlled by omission"). What remains: per-layer volume/pan,
 * GROUP mute/solo (both layers toggle together), and a single delete that
 * removes the whole pair.
 *
 * The slider represents WHERE the crossfade happens. In this phase it is
 * centered and non-functional (omit `onSliderChange` → it renders disabled); a
 * later phase wires it to fade origin→target across the bars.
 *
 * @since SDK 2.22.0
 */
import React from 'react';
import { TrackRow } from './TrackRow';
import { ConfirmDialog } from './ConfirmDialog';
import { EMPTY_FX_DETAIL_STATE } from '../types/fx-toggle.types';
import type { TrackLevelsHandle } from '../hooks/useTrackLevels';

/** Which half of the pair a per-layer control targets. */
export type CrossfadeSlot = 'origin' | 'target';

/** One layer (engine track) of a crossfade pair. */
export interface CrossfadeLayer {
  /** Engine track id of this layer's track (also the meter key). */
  trackId: string;
  /** Display name of this layer's (newly created) track. */
  name: string;
  /** Musical role (same for both layers — crossfades are same-role). */
  role?: string;
  /** Name of the SOURCE track this layer was cloned from (origin/target scene). */
  sourceName?: string;
  /** Human label of the copied preset/sound, shown in the caption. */
  soundLabel?: string;
  /** Playback state for this layer. */
  runtimeState: { muted: boolean; solo: boolean; volume: number; pan: number };
}

export interface CrossfadeTrackRowProps {
  /** Top layer — wears the origin (from) scene track's preset. */
  origin: CrossfadeLayer;
  /** Bottom layer — wears the target (to) scene track's preset. */
  target: CrossfadeLayer;
  /** Crossfade position 0..1 (0 = all origin, 1 = all target). Defaults centered. */
  sliderPos?: number;
  /** Toggle mute on BOTH layers together (group mute). */
  onMuteToggle: () => void;
  /** Toggle solo on BOTH layers together (group solo). */
  onSoloToggle: () => void;
  /** Change one layer's volume (per-layer). */
  onVolumeChange: (slot: CrossfadeSlot, volume: number) => void;
  /** Change one layer's pan (per-layer). */
  onPanChange: (slot: CrossfadeSlot, pan: number) => void;
  /** Delete the whole pair. */
  onDelete: () => void;
  /** Move the crossfade point. Omit to render the slider read-only (phase 1). */
  onSliderChange?: (pos: number) => void;
  /** Shared meter handle (welds a peak meter to each layer). */
  levels?: TrackLevelsHandle;
  /** Left-border accent. Defaults to transition purple. */
  accentColor?: string;
}

function LayerCaption({ tag, layer }: { tag: string; layer: CrossfadeLayer }): React.ReactElement {
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
    </div>
  );
}

export function CrossfadeTrackRow({
  origin,
  target,
  sliderPos = 0.5,
  onMuteToggle,
  onSoloToggle,
  onVolumeChange,
  onPanChange,
  onDelete,
  onSliderChange,
  levels,
  accentColor = '#9333EA',
}: CrossfadeTrackRowProps): React.ReactElement {
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  // A locked crossfade layer. The inner track's `name` is suppressed (the
  // meaningful name lives in the caption); every sound/generation handler is
  // omitted so shuffle / Create / preset-pick / FX / drawer / delete never
  // render. Mute/solo are GROUP-wired (same handler on both layers); volume/pan
  // are per-layer.
  const renderLayer = (layer: CrossfadeLayer, slot: CrossfadeSlot, tag: string): React.ReactElement => (
    <TrackRow
      track={{ id: layer.trackId, name: '', role: layer.role }}
      runtimeState={layer.runtimeState}
      fxDetailState={EMPTY_FX_DETAIL_STATE}
      drawerOpen={false}
      drawerTab="fx"
      levels={levels}
      accentColor={accentColor}
      contentSlot={<LayerCaption tag={tag} layer={layer} />}
      onMuteToggle={onMuteToggle}
      onSoloToggle={onSoloToggle}
      onVolumeChange={(v: number) => onVolumeChange(slot, v)}
      onPanChange={(p: number) => onPanChange(slot, p)}
    />
  );

  return (
    <div
      data-testid="crossfade-track-row"
      className="w-full rounded-sm border border-sas-border bg-sas-panel/40 overflow-hidden"
      style={{ borderLeftColor: accentColor, borderLeftWidth: '3px' }}
    >
      {/* Header — crossfade label + single delete for the whole pair. */}
      <div className="flex items-center justify-between px-2 py-1 bg-sas-panel-alt/60">
        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: accentColor }}>
          ⇄ Crossfade
        </span>
        <button
          data-testid="crossfade-delete-button"
          onClick={() => setConfirmDelete(true)}
          className="text-sas-danger/70 hover:text-sas-danger px-1 transition-colors text-sm"
          title="Delete crossfade pair"
          aria-label="Delete crossfade pair"
        >
          x
        </button>
      </div>

      {renderLayer(origin, 'origin', 'Origin')}

      {/* Crossfade slider — represents WHERE origin fades into target. Read-only
          (disabled) until the functional fader ships. */}
      <div className="flex items-center gap-2 px-3 py-1.5" data-testid="crossfade-slider-row">
        <span
          className="text-[9px] text-sas-muted/60 truncate max-w-[70px] text-right flex-shrink-0"
          title={origin.sourceName ?? origin.name}
        >
          {origin.sourceName ?? origin.name}
        </span>
        <input
          type="range"
          data-testid="crossfade-slider"
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
          aria-label="Crossfade position"
        />
        <span
          className="text-[9px] text-sas-muted/60 truncate max-w-[70px] flex-shrink-0"
          title={target.sourceName ?? target.name}
        >
          {target.sourceName ?? target.name}
        </span>
      </div>

      {renderLayer(target, 'target', 'Target')}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete crossfade?"
        message={
          <>
            This crossfade pair (both layers) will be permanently removed from this scene. This cannot
            be undone.
          </>
        }
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete();
        }}
        onCancel={() => setConfirmDelete(false)}
        testIdPrefix="crossfade-delete-confirm"
      />
    </div>
  );
}

export default CrossfadeTrackRow;
