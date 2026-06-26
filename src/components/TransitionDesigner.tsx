/**
 * TransitionDesigner — the per-panel transition staging board.
 *
 * The multi-row, persistent successor to {@link CrossfadeModal} + {@link FadeModal}:
 * instead of opening a single-pair dialog ~20 times to wire a transition, the
 * user opens ONE full-screen board for a panel family and lays out every A→B
 * pairing at once. Shown only inside a `scene_type='transition'` scene and scoped
 * to one panel (a synth board shows only synth tracks — "drums can't crossfade to
 * synth" is enforced structurally because each board asks its own family-scoped
 * host).
 *
 * Two index-aligned, drag-reorderable columns: origin (scene A, left) and target
 * (scene B, right). Row i pairs origin[i] with target[i]; the pairing derives the
 * transition type (both → crossfade, origin-only → fade out, target-only → fade
 * in). Blanks (insert "gap" above a cell) let the user push a track so it fades
 * instead of crossfading with whatever sits opposite. The available pool per
 * column is the scene's family tracks MINUS sources already consumed by a
 * committed crossfade/fade (`excludeSourceDbIds`).
 *
 * Per-row Create reuses the panel's EXISTING orchestration via `onCreateCrossfade`
 * / `onCreateFade` (the same callbacks the two modals used). On success the source
 * leaves the pool (the panel updates `excludeSourceDbIds`) and the row collapses;
 * deleting the committed crossfade/fade on the deck returns the source here. The
 * staged (not-yet-created) arrangement persists to the transition scene's
 * plugin_data so the user can close and keep iterating.
 *
 * @since SDK 2.29.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Modal } from './Modal';
import { SorceryProgressBar } from './SorceryProgressBar';
import { moveItem } from '../hooks/useTrackReorder';
import type { PluginHost, SceneFamilyTrack } from '../types/plugin-sdk.types';
import type { CrossfadeSelection } from './CrossfadeModal';
import type { FadeSelection } from './FadeModal';
import { type FadeDirection, type FadeGesture, defaultFadeGesture } from '../fade-meta';
import {
  TRANSITION_DESIGNER_DRAFT_KEY,
  type TransitionRowType,
  asTransitionDesignerDraft,
  reconcileSlots,
  buildRowSlots,
  normalizeSlots,
  padPair,
  slotsEqual,
} from '../transition-designer-meta';

type Column = 'origin' | 'target';

export interface TransitionDesignerProps {
  /** Scoped host — the board calls listSceneFamilyTracks / getSceneName itself. */
  host: PluginHost;
  /** Controls visibility (the panel owns open/closed from its header button). */
  open: boolean;
  /** DB id of the transition's FROM (origin) scene. */
  fromSceneId: string;
  /** DB id of the transition's TO (target) scene. */
  toSceneId: string;
  /** DB id of the transition scene itself — the staged draft is persisted here. */
  transitionSceneId: string;
  /**
   * Source-track DB ids already consumed by a committed crossfade OR fade in this
   * panel. Hidden from both columns so each source is used at most once; when the
   * deck row is deleted the panel drops the id and the source reappears here.
   */
  excludeSourceDbIds?: readonly string[];
  /** Close handler (Escape, backdrop, or the close button). */
  onClose: () => void;
  /**
   * Build a crossfade pair — the panel's existing handler (create two tracks, one
   * morphed clip, copy each preset). Should reject on failure.
   */
  onCreateCrossfade: (origin: CrossfadeSelection, target: CrossfadeSelection) => Promise<void>;
  /**
   * Build a one-sided fade — the panel's existing handler. Should reject on failure.
   */
  onCreateFade: (
    selection: FadeSelection,
    direction: FadeDirection,
    gesture: FadeGesture,
  ) => Promise<void>;
  /** Short family label for the heading, e.g. "Synths". */
  familyLabel?: string;
  /** data-testid prefix. */
  testIdPrefix?: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; origin: SceneFamilyTrack[]; target: SceneFamilyTrack[] };

/** ~time the LLM morph/fade generation takes, for the time-based progress bar. */
const CROSSFADE_ESTIMATE_MS = 15000;
const FADE_ESTIMATE_MS = 11000;

const TYPE_LABEL: Record<TransitionRowType, string> = {
  crossfade: 'Crossfade',
  'fade-out': 'Fade out',
  'fade-in': 'Fade in',
};

/** Short, recognisable id prefix — the full id lives in the cell's title. */
function shortId(dbId: string): string {
  return dbId.length > 8 ? dbId.slice(0, 8) : dbId;
}

export function TransitionDesigner({
  host,
  open,
  fromSceneId,
  toSceneId,
  transitionSceneId,
  excludeSourceDbIds,
  onClose,
  onCreateCrossfade,
  onCreateFade,
  familyLabel,
  testIdPrefix = 'transition-designer',
}: TransitionDesignerProps): React.ReactElement | null {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [fromName, setFromName] = useState<string | null>(null);
  const [toName, setToName] = useState<string | null>(null);
  // Columns are kept padded to equal length (for aligned rendering + drag); they
  // are trimmed only at persist time (normalizeSlots).
  const [originSlots, setOriginSlots] = useState<(string | null)[]>([]);
  const [targetSlots, setTargetSlots] = useState<(string | null)[]>([]);
  const [creatingRow, setCreatingRow] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ row: number; message: string } | null>(null);

  // Latest props/state read inside effects + handlers without widening deps.
  const excludeRef = useRef(excludeSourceDbIds);
  excludeRef.current = excludeSourceDbIds;
  const originSlotsRef = useRef(originSlots);
  originSlotsRef.current = originSlots;
  const targetSlotsRef = useRef(targetSlots);
  targetSlotsRef.current = targetSlots;

  // Drag state: a ref drives the drop computation (no stale closure); the matching
  // React state drives the dim/highlight visuals.
  const dragRef = useRef<{ col: Column; index: number } | null>(null);
  const [dragging, setDragging] = useState<{ col: Column; index: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ col: Column; index: number } | null>(null);

  const excludeSet = useMemo(() => new Set(excludeSourceDbIds ?? []), [excludeSourceDbIds]);
  const originPool = useMemo(
    () => (load.status === 'ready' ? load.origin.filter((t) => !excludeSet.has(t.dbId)) : []),
    [load, excludeSet],
  );
  const targetPool = useMemo(
    () => (load.status === 'ready' ? load.target.filter((t) => !excludeSet.has(t.dbId)) : []),
    [load, excludeSet],
  );
  const originById = useMemo(() => new Map(originPool.map((t) => [t.dbId, t])), [originPool]);
  const targetById = useMemo(() => new Map(targetPool.map((t) => [t.dbId, t])), [targetPool]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!host.listSceneFamilyTracks) {
      setLoad({ status: 'error', message: 'This host does not support transition tracks.' });
      return;
    }
    setLoad({ status: 'loading' });
    try {
      const [origin, target, fName, tName, draftRaw] = await Promise.all([
        host.listSceneFamilyTracks(fromSceneId),
        host.listSceneFamilyTracks(toSceneId),
        host.getSceneName ? host.getSceneName(fromSceneId) : Promise.resolve(null),
        host.getSceneName ? host.getSceneName(toSceneId) : Promise.resolve(null),
        host.getSceneData
          ? host.getSceneData(transitionSceneId, TRANSITION_DESIGNER_DRAFT_KEY)
          : Promise.resolve(null),
      ]);
      const draft = asTransitionDesignerDraft(draftRaw);
      const exSet = new Set(excludeRef.current ?? []);
      const originIds = origin.filter((t) => !exSet.has(t.dbId)).map((t) => t.dbId);
      const targetIds = target.filter((t) => !exSet.has(t.dbId)).map((t) => t.dbId);
      const [po, pt] = padPair(
        reconcileSlots(draft?.originOrder, originIds),
        reconcileSlots(draft?.targetOrder, targetIds),
      );
      setOriginSlots(po);
      setTargetSlots(pt);
      setFromName(fName);
      setToName(tName);
      setLoad({ status: 'ready', origin, target });
    } catch (err: unknown) {
      setLoad({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to load tracks.',
      });
    }
  }, [host, fromSceneId, toSceneId, transitionSceneId]);

  // Fetch on open; reset transient state.
  useEffect(() => {
    if (open) {
      setRowError(null);
      setCreatingRow(null);
      void refresh();
    }
  }, [open, refresh]);

  // Keep the columns in sync with the pool: drop sources consumed by a just-created
  // crossfade/fade (excludeSourceDbIds grew) and append any newly-added tracks.
  // Reads current slots via refs so it only re-runs when the pool changes.
  useEffect(() => {
    if (load.status !== 'ready') return;
    const [po, pt] = padPair(
      reconcileSlots(originSlotsRef.current, originPool.map((t) => t.dbId)),
      reconcileSlots(targetSlotsRef.current, targetPool.map((t) => t.dbId)),
    );
    if (!slotsEqual(po, originSlotsRef.current)) setOriginSlots(po);
    if (!slotsEqual(pt, targetSlotsRef.current)) setTargetSlots(pt);
  }, [originPool, targetPool, load.status]);

  // Persist the trimmed draft; re-pad state so rendering stays aligned.
  const mutate = useCallback(
    (nextOrigin: (string | null)[], nextTarget: (string | null)[]): void => {
      const norm = normalizeSlots(nextOrigin, nextTarget);
      const [po, pt] = padPair(norm.originOrder, norm.targetOrder);
      setOriginSlots(po);
      setTargetSlots(pt);
      if (host.setSceneData) {
        host.setSceneData(transitionSceneId, TRANSITION_DESIGNER_DRAFT_KEY, norm).catch(() => {});
      }
    },
    [host, transitionSceneId],
  );

  const insertGapAbove = useCallback(
    (col: Column, index: number): void => {
      const slots = col === 'origin' ? originSlots : targetSlots;
      const next = [...slots.slice(0, index), null, ...slots.slice(index)];
      if (col === 'origin') mutate(next, targetSlots);
      else mutate(originSlots, next);
    },
    [originSlots, targetSlots, mutate],
  );

  const removeGap = useCallback(
    (col: Column, index: number): void => {
      const slots = col === 'origin' ? originSlots : targetSlots;
      const next = slots.filter((_, i) => i !== index);
      if (col === 'origin') mutate(next, targetSlots);
      else mutate(originSlots, next);
    },
    [originSlots, targetSlots, mutate],
  );

  const handleDrop = useCallback(
    (col: Column, to: number): void => {
      const from = dragRef.current;
      dragRef.current = null;
      setDragging(null);
      setDragOver(null);
      if (!from || from.col !== col || from.index === to) return;
      if (col === 'origin') mutate(moveItem(originSlots, from.index, to), targetSlots);
      else mutate(originSlots, moveItem(targetSlots, from.index, to));
    },
    [originSlots, targetSlots, mutate],
  );

  const rows = useMemo(() => buildRowSlots(originSlots, targetSlots), [originSlots, targetSlots]);

  const handleCreateRow = useCallback(
    async (rowIndex: number): Promise<void> => {
      const row = rows[rowIndex];
      if (!row || !row.type) return;
      setRowError(null);
      setCreatingRow(rowIndex);
      try {
        if (row.type === 'crossfade') {
          const o = row.originId ? originById.get(row.originId) : undefined;
          const t = row.targetId ? targetById.get(row.targetId) : undefined;
          if (!o || !t) throw new Error('Track is no longer available — refresh and retry.');
          await onCreateCrossfade(
            { dbId: o.dbId, name: o.name, role: o.role },
            { dbId: t.dbId, name: t.name, role: t.role },
          );
        } else if (row.type === 'fade-out') {
          const o = row.originId ? originById.get(row.originId) : undefined;
          if (!o) throw new Error('Track is no longer available — refresh and retry.');
          await onCreateFade({ dbId: o.dbId, name: o.name, role: o.role }, 'out', defaultFadeGesture(o.role));
        } else {
          const t = row.targetId ? targetById.get(row.targetId) : undefined;
          if (!t) throw new Error('Track is no longer available — refresh and retry.');
          await onCreateFade({ dbId: t.dbId, name: t.name, role: t.role }, 'in', defaultFadeGesture(t.role));
        }
        // Success: the source(s) are now in excludeSourceDbIds → the sync effect
        // drops the row when the panel re-renders. Nothing else to do.
      } catch (err: unknown) {
        setRowError({
          row: rowIndex,
          message: err instanceof Error ? err.message : 'Failed to create transition.',
        });
      } finally {
        setCreatingRow(null);
      }
    },
    [rows, originById, targetById, onCreateCrossfade, onCreateFade],
  );

  const handleClose = useCallback((): void => {
    if (creatingRow === null) onClose();
  }, [creatingRow, onClose]);

  const fromLabel = fromName ?? 'origin';
  const toLabel = toName ?? 'target';
  const busy = creatingRow !== null;

  if (!open) return null;

  const cellDragProps = (
    col: Column,
    index: number,
  ): {
    draggable: boolean;
    onDragStart: (e: DragEvent<HTMLElement>) => void;
    onDragEnd: () => void;
    onDragEnter: (e: DragEvent<HTMLElement>) => void;
    onDragOver: (e: DragEvent<HTMLElement>) => void;
    onDragLeave: () => void;
    onDrop: (e: DragEvent<HTMLElement>) => void;
  } => ({
    draggable: !busy,
    onDragStart: (e) => {
      dragRef.current = { col, index };
      setDragging({ col, index });
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/plain', String(index));
        } catch {
          /* some environments disallow setData — drag still works */
        }
      }
    },
    onDragEnd: () => {
      dragRef.current = null;
      setDragging(null);
      setDragOver(null);
    },
    onDragEnter: (e) => {
      const d = dragRef.current;
      if (!d || d.col !== col) return;
      e.preventDefault();
      setDragOver({ col, index });
    },
    onDragOver: (e) => {
      const d = dragRef.current;
      if (!d || d.col !== col) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    },
    onDragLeave: () => {
      setDragOver((cur) => (cur && cur.col === col && cur.index === index ? null : cur));
    },
    onDrop: (e) => {
      e.preventDefault();
      handleDrop(col, index);
    },
  });

  const renderCell = (col: Column, index: number, slotId: string | null): React.ReactElement => {
    const byId = col === 'origin' ? originById : targetById;
    const track = slotId ? byId.get(slotId) : undefined;
    const isDragging = dragging?.col === col && dragging.index === index;
    const isDragTarget = dragOver?.col === col && dragOver.index === index && !isDragging;
    const base =
      'group relative rounded-sm border px-2 py-1.5 text-left transition-colors select-none';
    const tone = isDragTarget
      ? 'border-sas-accent bg-sas-accent/10'
      : 'border-sas-border bg-sas-panel';

    if (slotId === null) {
      // Explicit blank spacer — a gap so the opposite track fades.
      return (
        <div
          {...cellDragProps(col, index)}
          data-testid={`${testIdPrefix}-${col}-gap-${index}`}
          className={`${base} ${tone} border-dashed flex items-center justify-between ${
            isDragging ? 'opacity-40' : 'opacity-70'
          }`}
        >
          <span className="text-[10px] uppercase tracking-wide text-sas-muted">— gap —</span>
          <button
            type="button"
            data-testid={`${testIdPrefix}-${col}-remove-gap-${index}`}
            onClick={() => removeGap(col, index)}
            disabled={busy}
            title="Remove gap"
            className="text-[10px] text-sas-muted hover:text-sas-danger disabled:opacity-50"
          >
            ✕
          </button>
        </div>
      );
    }

    const primary = track ? track.prompt?.trim() || track.name : slotId;
    const meta = track ? [track.role, shortId(track.dbId)].filter(Boolean).join(' · ') : 'missing';
    return (
      <div
        {...cellDragProps(col, index)}
        data-testid={`${testIdPrefix}-${col}-cell-${slotId}`}
        data-value={slotId}
        className={`${base} ${tone} ${isDragging ? 'opacity-40' : ''} cursor-grab active:cursor-grabbing`}
        title={track ? track.dbId : 'Track no longer available'}
      >
        <div className="flex items-start gap-1">
          <span className="text-sas-muted/60 text-xs leading-tight pt-0.5" aria-hidden>
            ⠿
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-sas-text truncate">{primary}</div>
            {meta && <div className="text-[10px] text-sas-muted truncate mt-0.5">{meta}</div>}
          </div>
          <button
            type="button"
            data-testid={`${testIdPrefix}-${col}-insert-gap-${index}`}
            onClick={() => insertGapAbove(col, index)}
            disabled={busy}
            title="Insert a gap above (make this a fade)"
            className="text-[10px] text-sas-muted opacity-0 group-hover:opacity-100 hover:text-sas-accent disabled:opacity-50"
          >
            +gap
          </button>
        </div>
      </div>
    );
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      testIdPrefix={testIdPrefix}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
    >
      <div
        className="bg-sas-panel border border-sas-border rounded-md shadow-xl w-[min(1000px,95vw)] max-h-[88vh] flex flex-col"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        data-testid={`${testIdPrefix}-box`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-sas-border shrink-0">
          <div>
            <h3 className="text-sm font-bold text-sas-text">
              Transition Designer{familyLabel ? ` — ${familyLabel}` : ''}
            </h3>
            <p className="text-[11px] text-sas-muted mt-0.5">
              <span className="text-sas-text">{fromLabel}</span> →{' '}
              <span className="text-sas-text">{toLabel}</span> · line up a track on each side to
              crossfade them; leave one side blank (or insert a gap) to fade.
            </p>
          </div>
          <button
            type="button"
            data-testid={`${testIdPrefix}-close`}
            onClick={handleClose}
            disabled={busy}
            className="text-sas-muted hover:text-sas-text text-sm leading-none disabled:opacity-50"
            title={busy ? 'Finish creating first' : 'Close'}
          >
            ✕
          </button>
        </div>

        {/* Column headings */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 px-4 pt-3 shrink-0">
          <span className="text-[10px] uppercase tracking-wide text-sas-muted truncate">
            Origin ({fromLabel})
          </span>
          <span className="text-[10px] uppercase tracking-wide text-sas-muted text-center px-2">
            Transition
          </span>
          <span className="text-[10px] uppercase tracking-wide text-sas-muted truncate text-right">
            Target ({toLabel})
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 pt-2 space-y-2 min-h-[120px]">
          {load.status === 'loading' && (
            <div className="text-xs text-sas-muted py-8 text-center">Loading tracks…</div>
          )}
          {load.status === 'error' && (
            <div className="text-xs text-sas-danger py-8 text-center" data-testid={`${testIdPrefix}-error`}>
              {load.message}
            </div>
          )}
          {load.status === 'ready' &&
            (rows.length === 0 ? (
              <div className="text-xs text-sas-muted py-8 text-center" data-testid={`${testIdPrefix}-empty`}>
                No tracks to arrange in this panel for either scene. Add tracks to {fromLabel} or{' '}
                {toLabel} first (or free one by deleting an existing crossfade/fade).
              </div>
            ) : (
              rows.map((row, i) => {
                const isCreatingThis = creatingRow === i;
                const canCreate = !busy && !!row.type;
                return (
                  <div
                    key={i}
                    data-testid={`${testIdPrefix}-row-${i}`}
                    className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center"
                  >
                    {renderCell('origin', i, row.originId)}

                    {/* Center: type + create / progress */}
                    <div className="w-[160px] flex flex-col items-center gap-1">
                      {row.type ? (
                        <span
                          data-testid={`${testIdPrefix}-type-${i}`}
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-sm border ${
                            row.type === 'crossfade'
                              ? 'border-sas-accent/50 text-sas-accent'
                              : 'border-sas-border text-sas-muted'
                          }`}
                        >
                          {TYPE_LABEL[row.type]}
                        </span>
                      ) : (
                        <span className="text-[10px] text-sas-muted/50">—</span>
                      )}
                      {isCreatingThis ? (
                        <div className="w-full">
                          <SorceryProgressBar
                            isLoading
                            heightClass="h-5"
                            statusText="CREATING"
                            estimatedDurationMs={
                              row.type === 'crossfade' ? CROSSFADE_ESTIMATE_MS : FADE_ESTIMATE_MS
                            }
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          data-testid={`${testIdPrefix}-create-${i}`}
                          onClick={() => handleCreateRow(i)}
                          disabled={!canCreate}
                          className={`w-full px-2 py-0.5 text-[10px] font-medium rounded-sm border transition-colors ${
                            canCreate
                              ? 'bg-sas-accent/20 border-sas-accent text-sas-accent hover:bg-sas-accent hover:text-sas-bg'
                              : 'bg-sas-panel border-sas-border text-sas-muted/50 cursor-not-allowed'
                          }`}
                        >
                          Create
                        </button>
                      )}
                      {rowError?.row === i && (
                        <span
                          data-testid={`${testIdPrefix}-row-error-${i}`}
                          className="text-[10px] text-sas-danger text-center leading-tight"
                        >
                          {rowError.message}
                        </span>
                      )}
                    </div>

                    {renderCell('target', i, row.targetId)}
                  </div>
                );
              })
            ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-3 border-t border-sas-border shrink-0">
          <button
            type="button"
            data-testid={`${testIdPrefix}-done`}
            onClick={handleClose}
            disabled={busy}
            className="px-3 py-1 text-xs rounded-sm border border-sas-border text-sas-muted hover:text-sas-text disabled:opacity-50"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default TransitionDesigner;
