/**
 * TransitionDesigner — the per-panel transition staging board, rendered INLINE as
 * a toggled view inside a generator panel (NOT a modal).
 *
 * The multi-row, persistent successor to {@link CrossfadeModal} + {@link FadeModal}:
 * instead of opening a single-pair dialog ~20 times, the panel header gains a
 * Tracks ⇄ Transition toggle; flipping to Transition replaces the panel's track
 * list with this board. Playback is unaffected (the engine keeps playing the
 * scene's tracks — they're just not shown until you toggle back). Shown only
 * inside a `scene_type='transition'` scene and scoped to one panel family (a synth
 * board shows only synth tracks — "drums can't crossfade to synth" is enforced
 * structurally because each board asks its own family-scoped host).
 *
 * Two index-aligned, drag-reorderable columns: origin (scene A, left) and target
 * (scene B, right). Row i pairs origin[i] with target[i]; the pairing derives the
 * transition type (both → crossfade, origin-only → fade out, target-only → fade
 * in). Insert a "gap" above a cell to push a track so it fades instead of
 * crossfading with whatever sits opposite. The pool per column is the scene's
 * family tracks MINUS sources already consumed by a committed crossfade/fade
 * (`excludeSourceDbIds`).
 *
 * Per-row **Create** reuses the panel's EXISTING orchestration via `onCreateCrossfade`
 * / `onCreateFade`. Creates run CONCURRENTLY — fire several at once, or **Create all**
 * (a bounded pool). Each in-flight row shows its own progress bar and locks just its
 * own cells; the rest of the board stays editable. On success the source leaves the
 * pool (the panel updates `excludeSourceDbIds`) and the row collapses; deleting the
 * committed crossfade/fade on the deck returns the source here. The staged
 * arrangement persists to the transition scene's plugin_data so it survives toggles.
 *
 * @since SDK 2.29.0 (modal); inline toggle view + concurrent creation since 2.30.0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { SorceryProgressBar } from './SorceryProgressBar';
import { moveItem } from '../hooks/useTrackReorder';
import type { PluginHost, SceneFamilyTrack } from '../types/plugin-sdk.types';
import type { CrossfadeSelection } from './CrossfadeModal';
import type { FadeSelection } from './FadeModal';
import { type FadeDirection, type FadeGesture, defaultFadeGesture } from '../fade-meta';
import {
  TRANSITION_DESIGNER_DRAFT_KEY,
  type TransitionRowType,
  type DesignerRowSlots,
  asTransitionDesignerDraft,
  reconcileSlots,
  buildRowSlots,
  normalizeSlots,
  padPair,
  slotsEqual,
  rowKey,
  dbIdsFromKeys,
  type AudioEffect,
  AUDIO_EFFECTS,
  AUDIO_EFFECT_LABEL,
} from '../transition-designer-meta';

type Column = 'origin' | 'target';

export interface TransitionDesignerProps {
  /** Scoped host — the board calls listSceneFamilyTracks / getSceneName itself. */
  host: PluginHost;
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
  /**
   * Build a crossfade pair — the panel's existing handler (create two tracks, one
   * morphed clip, copy each preset). Should reject on failure. Safe to call
   * concurrently.
   */
  onCreateCrossfade: (origin: CrossfadeSelection, target: CrossfadeSelection) => Promise<void>;
  /** Build a one-sided fade — the panel's existing handler. Should reject on failure. */
  onCreateFade: (
    selection: FadeSelection,
    direction: FadeDirection,
    gesture: FadeGesture,
  ) => Promise<void>;
  /**
   * Build an AUDIO-only one-sided transition (stutter / chopped / delay). When
   * provided, one-sided rows render an effect selector; absent (MIDI panels) →
   * one-sided rows stay plain fades. @since SDK 2.32.0
   */
  onCreateAudioTransition?: (
    selection: FadeSelection,
    direction: FadeDirection,
    effect: 'stutter' | 'chopped' | 'delay',
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
/** Bounded fan-out for "Create all" (the user wants ~3-5 at once). */
const CREATE_ALL_CONCURRENCY = 5;

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
  fromSceneId,
  toSceneId,
  transitionSceneId,
  excludeSourceDbIds,
  onCreateCrossfade,
  onCreateFade,
  onCreateAudioTransition,
  familyLabel,
  testIdPrefix = 'transition-designer',
}: TransitionDesignerProps): React.ReactElement {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [fromName, setFromName] = useState<string | null>(null);
  const [toName, setToName] = useState<string | null>(null);
  // Columns are kept padded to equal length (aligned rendering + drag); trimmed
  // only at persist time (normalizeSlots).
  const [originSlots, setOriginSlots] = useState<(string | null)[]>([]);
  const [targetSlots, setTargetSlots] = useState<(string | null)[]>([]);
  // In-flight creates, keyed by a STABLE row key (source dbIds, not index) so
  // several can run at once and a reorder mid-create still tracks the right row.
  const [creatingKeys, setCreatingKeys] = useState<Set<string>>(() => new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  // Per one-sided-row audio effect (keyed by source dbId). Only meaningful when
  // onCreateAudioTransition is provided (audio panels).
  const [rowEffects, setRowEffects] = useState<Record<string, AudioEffect>>({});
  const rowEffectsRef = useRef(rowEffects);
  rowEffectsRef.current = rowEffects;
  const audioEffectsEnabled = !!onCreateAudioTransition;

  // Latest props/state read inside effects + handlers without widening deps.
  const excludeRef = useRef(excludeSourceDbIds);
  excludeRef.current = excludeSourceDbIds;
  const originSlotsRef = useRef(originSlots);
  originSlotsRef.current = originSlots;
  const targetSlotsRef = useRef(targetSlots);
  targetSlotsRef.current = targetSlots;
  const creatingKeysRef = useRef(creatingKeys);
  creatingKeysRef.current = creatingKeys;

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
  const originByIdRef = useRef(originById);
  originByIdRef.current = originById;
  const targetByIdRef = useRef(targetById);
  targetByIdRef.current = targetById;

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
      setRowEffects(draft?.rowEffects ?? {});
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

  // Fetch on mount (the panel mounts this only when the Transition view is active)
  // and whenever the bridged scenes change.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Keep the columns in sync with the pool: drop sources consumed by a just-created
  // crossfade/fade (excludeSourceDbIds grew) and append any newly-added tracks.
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
        host.setSceneData(transitionSceneId, TRANSITION_DESIGNER_DRAFT_KEY, { ...norm, rowEffects: rowEffectsRef.current }).catch(() => {});
      }
    },
    [host, transitionSceneId],
  );

  // Change a one-sided row's audio effect; persist alongside the slot draft.
  const setRowEffect = useCallback(
    (sourceDbId: string, effect: AudioEffect): void => {
      setRowEffects((prev) => {
        const next = { ...prev, [sourceDbId]: effect };
        if (host.setSceneData) {
          const norm = normalizeSlots(originSlotsRef.current, targetSlotsRef.current);
          host.setSceneData(transitionSceneId, TRANSITION_DESIGNER_DRAFT_KEY, { ...norm, rowEffects: next }).catch(() => {});
        }
        return next;
      });
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
  // Source dbIds with a create in flight — their cells lock (no drag / gap edits).
  const creatingDbIds = useMemo(() => dbIdsFromKeys(creatingKeys), [creatingKeys]);
  const eligibleCount = useMemo(
    () => rows.filter((r) => { const k = rowKey(r); return k !== null && !creatingKeys.has(k); }).length,
    [rows, creatingKeys],
  );

  // Create ONE row. Concurrency-safe: keyed by source dbIds; reuses the panel's
  // existing crossfade/fade orchestration. Reads latest maps/keys via refs.
  const createRow = useCallback(
    async (row: DesignerRowSlots): Promise<void> => {
      const key = rowKey(row);
      if (!key || !row.type || creatingKeysRef.current.has(key)) return;
      setCreatingKeys((prev) => new Set(prev).add(key));
      setRowErrors((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      try {
        if (row.type === 'crossfade') {
          const o = row.originId ? originByIdRef.current.get(row.originId) : undefined;
          const t = row.targetId ? targetByIdRef.current.get(row.targetId) : undefined;
          if (!o || !t) throw new Error('Track is no longer available — refresh and retry.');
          await onCreateCrossfade(
            { dbId: o.dbId, name: o.name, role: o.role },
            { dbId: t.dbId, name: t.name, role: t.role },
          );
        } else if (row.type === 'fade-out') {
          const o = row.originId ? originByIdRef.current.get(row.originId) : undefined;
          if (!o) throw new Error('Track is no longer available — refresh and retry.');
          const eff = rowEffectsRef.current[o.dbId] ?? 'fade';
          if (eff !== 'fade' && onCreateAudioTransition) {
            await onCreateAudioTransition({ dbId: o.dbId, name: o.name, role: o.role }, 'out', eff);
          } else {
            await onCreateFade({ dbId: o.dbId, name: o.name, role: o.role }, 'out', defaultFadeGesture(o.role));
          }
        } else {
          const t = row.targetId ? targetByIdRef.current.get(row.targetId) : undefined;
          if (!t) throw new Error('Track is no longer available — refresh and retry.');
          const eff = rowEffectsRef.current[t.dbId] ?? 'fade';
          if (eff !== 'fade' && onCreateAudioTransition) {
            await onCreateAudioTransition({ dbId: t.dbId, name: t.name, role: t.role }, 'in', eff);
          } else {
            await onCreateFade({ dbId: t.dbId, name: t.name, role: t.role }, 'in', defaultFadeGesture(t.role));
          }
        }
      } catch (err: unknown) {
        setRowErrors((prev) => ({
          ...prev,
          [key]: err instanceof Error ? err.message : 'Failed to create transition.',
        }));
      } finally {
        setCreatingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [onCreateCrossfade, onCreateFade, onCreateAudioTransition],
  );

  // Fire every eligible row through a bounded concurrency pool.
  const createAll = useCallback(async (): Promise<void> => {
    const eligible = buildRowSlots(originSlotsRef.current, targetSlotsRef.current).filter((r) => {
      const k = rowKey(r);
      return k !== null && !creatingKeysRef.current.has(k);
    });
    if (eligible.length === 0) return;
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < eligible.length) {
        const row = eligible[cursor];
        cursor += 1;
        await createRow(row);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CREATE_ALL_CONCURRENCY, eligible.length) }, () => worker()),
    );
  }, [createRow]);

  const fromLabel = fromName ?? 'origin';
  const toLabel = toName ?? 'target';

  const cellDragProps = (
    col: Column,
    index: number,
    locked: boolean,
  ): {
    draggable: boolean;
    onDragStart: (e: DragEvent<HTMLElement>) => void;
    onDragEnd: () => void;
    onDragEnter: (e: DragEvent<HTMLElement>) => void;
    onDragOver: (e: DragEvent<HTMLElement>) => void;
    onDragLeave: () => void;
    onDrop: (e: DragEvent<HTMLElement>) => void;
  } => ({
    draggable: !locked,
    onDragStart: (e) => {
      if (locked) return;
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
    const locked = slotId !== null && creatingDbIds.has(slotId);
    const isDragging = dragging?.col === col && dragging.index === index;
    const isDragTarget = dragOver?.col === col && dragOver.index === index && !isDragging;
    const base =
      'group relative rounded-sm border px-2 py-1.5 text-left transition-colors select-none';
    const tone = isDragTarget
      ? 'border-sas-accent bg-sas-accent/10'
      : 'border-sas-border bg-sas-panel';

    if (slotId === null) {
      return (
        <div
          {...cellDragProps(col, index, false)}
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
            title="Remove gap"
            className="text-[10px] text-sas-muted hover:text-sas-danger"
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
        {...cellDragProps(col, index, locked)}
        data-testid={`${testIdPrefix}-${col}-cell-${slotId}`}
        data-value={slotId}
        className={`${base} ${tone} ${isDragging ? 'opacity-40' : ''} ${
          locked ? 'opacity-60' : 'cursor-grab active:cursor-grabbing'
        }`}
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
            disabled={locked}
            title="Insert a gap above (make this a fade)"
            className="text-[10px] text-sas-muted opacity-0 group-hover:opacity-100 hover:text-sas-accent disabled:opacity-30"
          >
            +gap
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-box`}>
      {/* Header: hint + Create all */}
      <div className="flex items-center justify-between gap-3 pb-1 border-b border-sas-border">
        <p className="text-[11px] text-sas-muted leading-snug min-w-0">
          <span className="text-sas-text">{fromLabel}</span> →{' '}
          <span className="text-sas-text">{toLabel}</span>
          {familyLabel ? ` · ${familyLabel}` : ''} · line up a track on each side to crossfade;
          leave one blank (or insert a gap) to fade.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {creatingKeys.size > 0 && (
            <span className="text-[10px] text-sas-accent whitespace-nowrap" data-testid={`${testIdPrefix}-creating-count`}>
              {creatingKeys.size} creating…
            </span>
          )}
          <button
            type="button"
            data-testid={`${testIdPrefix}-create-all`}
            onClick={createAll}
            disabled={eligibleCount === 0}
            title="Create every staged transition at once (runs several concurrently)"
            className={`px-2 py-0.5 text-[10px] font-medium rounded-sm border transition-colors whitespace-nowrap ${
              eligibleCount > 0
                ? 'bg-sas-accent/20 border-sas-accent text-sas-accent hover:bg-sas-accent hover:text-sas-bg'
                : 'bg-sas-panel border-sas-border text-sas-muted/50 cursor-not-allowed'
            }`}
          >
            Create all{eligibleCount > 0 ? ` (${eligibleCount})` : ''}
          </button>
        </div>
      </div>

      {/* Column headings */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2">
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
      {load.status === 'loading' && (
        <div className="text-xs text-sas-muted py-6 text-center">Loading tracks…</div>
      )}
      {load.status === 'error' && (
        <div className="text-xs text-sas-danger py-6 text-center" data-testid={`${testIdPrefix}-error`}>
          {load.message}
        </div>
      )}
      {load.status === 'ready' &&
        (rows.length === 0 ? (
          <div className="text-xs text-sas-muted py-6 text-center" data-testid={`${testIdPrefix}-empty`}>
            No tracks to arrange in this panel for either scene. Add tracks to {fromLabel} or {toLabel}{' '}
            first (or free one by deleting an existing crossfade/fade).
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row, i) => {
              const key = rowKey(row);
              const isCreatingThis = key !== null && creatingKeys.has(key);
              const errMsg = key !== null ? rowErrors[key] : undefined;
              return (
                <div
                  key={i}
                  data-testid={`${testIdPrefix}-row-${i}`}
                  className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center"
                >
                  {renderCell('origin', i, row.originId)}

                  {/* Center: type + create / progress */}
                  <div className="w-[160px] flex flex-col items-center gap-1">
                    {!row.type ? (
                      <span className="text-[10px] text-sas-muted/50">—</span>
                    ) : row.type === 'crossfade' ? (
                      <span
                        data-testid={`${testIdPrefix}-type-${i}`}
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-sm border border-sas-accent/50 text-sas-accent"
                      >
                        {TYPE_LABEL[row.type]}
                      </span>
                    ) : audioEffectsEnabled ? (
                      <div className="flex items-center gap-1" data-testid={`${testIdPrefix}-type-${i}`}>
                        <select
                          data-testid={`${testIdPrefix}-effect-${i}`}
                          value={rowEffects[(row.originId ?? row.targetId) as string] ?? 'fade'}
                          onChange={(e) => {
                            const id = row.originId ?? row.targetId;
                            if (id) setRowEffect(id, e.target.value as AudioEffect);
                          }}
                          className="text-[10px] bg-sas-panel border border-sas-border rounded-sm px-1 py-0.5 text-sas-text"
                        >
                          {AUDIO_EFFECTS.map((eff) => (
                            <option key={eff} value={eff}>
                              {AUDIO_EFFECT_LABEL[eff]}
                            </option>
                          ))}
                        </select>
                        <span className="text-[9px] text-sas-muted">{row.type === 'fade-out' ? 'out' : 'in'}</span>
                      </div>
                    ) : (
                      <span
                        data-testid={`${testIdPrefix}-type-${i}`}
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-sm border border-sas-border text-sas-muted"
                      >
                        {TYPE_LABEL[row.type]}
                      </span>
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
                        onClick={() => createRow(row)}
                        disabled={!row.type}
                        className={`w-full px-2 py-0.5 text-[10px] font-medium rounded-sm border transition-colors ${
                          row.type
                            ? 'bg-sas-accent/20 border-sas-accent text-sas-accent hover:bg-sas-accent hover:text-sas-bg'
                            : 'bg-sas-panel border-sas-border text-sas-muted/50 cursor-not-allowed'
                        }`}
                      >
                        Create
                      </button>
                    )}
                    {errMsg && (
                      <span
                        data-testid={`${testIdPrefix}-row-error-${i}`}
                        className="text-[10px] text-sas-danger text-center leading-tight"
                      >
                        {errMsg}
                      </span>
                    )}
                  </div>

                  {renderCell('target', i, row.targetId)}
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}

export default TransitionDesigner;
