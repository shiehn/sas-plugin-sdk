/**
 * GroupFadeTrackRow — a transition GROUP fade: N verbatim-copied member tracks
 * (a bass voice group) fading together under ONE slider.
 *
 * The multi-track sibling of {@link FadeTrackRow}: a header with the direction
 * badge + group label + group mute/solo/delete, one locked TrackRow per member
 * (per-member volume/pan/mute/solo stay live; sound/generation controls are
 * omitted — "controlled by omission"), and a single shared fade slider. The
 * copies are byte-exact (MIDI + preset + FX), so unlike a generated fade there
 * is no per-member gesture nuance — the whole group rides one 'volume' curve.
 *
 * @since SDK 2.41.0
 */
import React from 'react';
import { TrackRow } from './TrackRow';
import { ConfirmDialog } from './ConfirmDialog';
import { EMPTY_FX_DETAIL_STATE } from '../types/fx-toggle.types';
import type { TrackLevelsHandle } from '../hooks/useTrackLevels';
import type { FadeDirection, FadeGesture } from '../fade-meta';
import type { FadeLayer } from './FadeTrackRow';

/** One member track of the group fade. */
export interface GroupFadeMemberLayer extends FadeLayer {
  /** Short per-member caption, e.g. the bass partition ('low', 'offbeats'). */
  memberLabel?: string;
}

export interface GroupFadeTrackRowProps {
  /** Header label, e.g. 'Bassline (3 voices)'. */
  groupLabel: string;
  /** 'in' (enters across the loop) or 'out' (leaves across the loop). */
  direction: FadeDirection;
  /** Shown read-only (group fades are always 'volume'). */
  gesture: FadeGesture;
  /** Fade position 0..1 — WHERE in time the fade sits. Defaults centered. */
  sliderPos?: number;
  /** Member tracks in group order. */
  members: GroupFadeMemberLayer[];
  /** Per-member controls (members are normal tracks). */
  onMemberMuteToggle: (trackId: string) => void;
  onMemberSoloToggle: (trackId: string) => void;
  onMemberVolumeChange: (trackId: string, volume: number) => void;
  onMemberPanChange: (trackId: string, pan: number) => void;
  /** Group controls — act on every member together. */
  onMuteAll: () => void;
  onSoloAll: () => void;
  /** Delete the whole group fade (all member tracks). */
  onDelete: () => void;
  /** Move the fade point for the whole group. Omit to render read-only. */
  onSliderChange?: (pos: number) => void;
  /** Shared meter handle (welds a peak meter to each member). */
  levels?: TrackLevelsHandle;
  /** Left-border accent. Defaults to transition purple. */
  accentColor?: string;
}

function MemberCaption({
  member,
  direction,
}: {
  member: GroupFadeMemberLayer;
  direction: FadeDirection;
}): React.ReactElement {
  const tag = direction === 'in' ? 'Fade in' : 'Fade out';
  return (
    <div className="flex items-center gap-1.5 min-w-0 px-2 py-0.5">
      {member.memberLabel && (
        <span className="text-[9px] font-bold uppercase tracking-wide text-sas-accent flex-shrink-0">
          {member.memberLabel}
        </span>
      )}
      <span className="text-[11px] text-sas-text truncate" title={member.sourceName ?? member.name}>
        {member.sourceName ?? member.name}
      </span>
      {member.soundLabel && (
        <span className="text-[9px] text-sas-muted/60 truncate flex-shrink-0" title={member.soundLabel}>
          · {member.soundLabel}
        </span>
      )}
      {!member.memberLabel && (
        <span className="text-[9px] text-sas-muted/50 flex-shrink-0">· {tag}</span>
      )}
    </div>
  );
}

export function GroupFadeTrackRow({
  groupLabel,
  direction,
  gesture,
  sliderPos = 0.5,
  members,
  onMemberMuteToggle,
  onMemberSoloToggle,
  onMemberVolumeChange,
  onMemberPanChange,
  onMuteAll,
  onSoloAll,
  onDelete,
  onSliderChange,
  levels,
  accentColor = '#9333EA',
}: GroupFadeTrackRowProps): React.ReactElement {
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const allMuted = members.length > 0 && members.every((m) => m.runtimeState.muted);
  const allSolo = members.length > 0 && members.every((m) => m.runtimeState.solo);
  const badge = direction === 'in' ? '↗ Fade in' : '↘ Fade out';
  const leftLabel = direction === 'in' ? '(silent)' : groupLabel;
  const rightLabel = direction === 'in' ? groupLabel : '(silent)';

  return (
    <div
      data-testid="group-fade-track-row"
      className="w-full rounded-sm border border-sas-border bg-sas-panel/40 overflow-hidden"
      style={{ borderLeftColor: accentColor, borderLeftWidth: '3px' }}
    >
      {/* Header — badge + group label + group M/S + delete. */}
      <div className="flex items-center justify-between px-2 py-1 bg-sas-panel-alt/60 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            data-testid="group-fade-direction-badge"
            className="text-[10px] font-bold uppercase tracking-wide flex-shrink-0"
            style={{ color: accentColor }}
          >
            {badge}
          </span>
          <span
            data-testid="group-fade-label"
            className="text-[11px] text-sas-text truncate"
            title={`${groupLabel} · ${gesture}`}
          >
            {groupLabel}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            data-testid="group-fade-mute-button"
            onClick={onMuteAll}
            className={`px-1.5 py-0.5 text-[9px] font-bold rounded-sm border transition-colors ${
              allMuted
                ? 'bg-sas-danger/20 border-sas-danger text-sas-danger'
                : 'border-sas-border text-sas-muted hover:text-sas-text'
            }`}
            title={allMuted ? 'Unmute all members' : 'Mute all members'}
          >
            M
          </button>
          <button
            data-testid="group-fade-solo-button"
            onClick={onSoloAll}
            className={`px-1.5 py-0.5 text-[9px] font-bold rounded-sm border transition-colors ${
              allSolo
                ? 'bg-sas-accent/20 border-sas-accent text-sas-accent'
                : 'border-sas-border text-sas-muted hover:text-sas-text'
            }`}
            title={allSolo ? 'Unsolo all members' : 'Solo all members'}
          >
            S
          </button>
          <button
            data-testid="group-fade-delete-button"
            onClick={() => setConfirmDelete(true)}
            className="text-sas-danger/70 hover:text-sas-danger px-1 transition-colors text-sm"
            title="Delete group fade"
            aria-label="Delete group fade"
          >
            x
          </button>
        </div>
      </div>

      {/* Member tracks — locked rows, per-member mixer controls stay live. */}
      {members.map((member) => (
        <TrackRow
          key={member.trackId}
          track={{ id: member.trackId, name: '', role: member.role }}
          runtimeState={member.runtimeState}
          fxDetailState={EMPTY_FX_DETAIL_STATE}
          drawerOpen={false}
          drawerTab="fx"
          levels={levels}
          accentColor={accentColor}
          contentSlot={<MemberCaption member={member} direction={direction} />}
          onMuteToggle={() => onMemberMuteToggle(member.trackId)}
          onSoloToggle={() => onMemberSoloToggle(member.trackId)}
          onVolumeChange={(vol: number) => onMemberVolumeChange(member.trackId, vol)}
          onPanChange={(pan: number) => onMemberPanChange(member.trackId, pan)}
        />
      ))}

      {/* ONE shared fade slider — WHERE in the loop the group's fade sits. */}
      <div className="flex items-center gap-2 px-3 py-1.5" data-testid="group-fade-slider-row">
        <span
          className="text-[9px] text-sas-muted/60 truncate max-w-[70px] text-right flex-shrink-0"
          title={leftLabel}
        >
          {leftLabel}
        </span>
        <input
          type="range"
          data-testid="group-fade-slider"
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
          aria-label="Group fade position"
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
        title="Delete group fade?"
        message={
          <>
            All {members.length} member tracks of this fade will be permanently removed from this
            scene. This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete();
        }}
        onCancel={() => setConfirmDelete(false)}
        testIdPrefix="group-fade-delete-confirm"
      />
    </div>
  );
}

export default GroupFadeTrackRow;
