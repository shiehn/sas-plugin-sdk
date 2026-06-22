/**
 * CrossfadeModal — "add a crossfade track" picker for a transition scene.
 *
 * Shown only inside a `scene_type='transition'` scene. The user picks an ORIGIN
 * track (from the transition's FROM scene) and a TARGET track (from its TO
 * scene), in ANY order — the only constraint is same plugin/family (the picker is
 * per-panel). A source track already used in a crossfade is hidden (via
 * excludeSourceDbIds), so each source is used at most once.
 *
 * Self-fetching: given the scoped `host`, it calls `host.listSceneFamilyTracks`
 * for both scenes (ungated — a transition deliberately bridges different keys).
 * It does NOT build the pair itself; it hands the two selections to `onCreate`,
 * which the panel implements (create two tracks, generate one shared MIDI clip,
 * copy each preset). `onCreate` should reject on failure so the modal can show
 * it and stay open.
 *
 * @since SDK 2.22.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './Modal';
import type { PluginHost, SceneFamilyTrack } from '../types/plugin-sdk.types';

/** A picked source track handed to `onCreate`. */
export interface CrossfadeSelection {
  /** Source track DB id (selector for getTrackSound + crossfade metadata). */
  dbId: string;
  /** Display name (for the row caption). */
  name: string;
  /** Musical role of the source track (the panel uses the TARGET's for generation). */
  role?: string;
}

export interface CrossfadeModalProps {
  /** Scoped host — the modal calls listSceneFamilyTracks itself. */
  host: PluginHost;
  /** Controls visibility (the panel owns open/closed from its header button). */
  open: boolean;
  /** DB id of the transition's FROM (origin) scene. */
  fromSceneId: string;
  /** DB id of the transition's TO (target) scene. */
  toSceneId: string;
  /** Display name for the origin scene heading (optional). */
  fromSceneName?: string;
  /** Display name for the target scene heading (optional). */
  toSceneName?: string;
  /**
   * Source-track DB ids already used in a crossfade (origin + target of every
   * existing pair in this panel). Hidden from BOTH dropdowns so each source is
   * used at most once. @since SDK 2.26.0
   */
  excludeSourceDbIds?: readonly string[];
  /** Close handler (Escape, backdrop, Cancel, or after a successful create). */
  onClose: () => void;
  /** Build the crossfade pair. Should reject on failure so the modal shows it. */
  onCreate: (origin: CrossfadeSelection, target: CrossfadeSelection) => Promise<void>;
  /** data-testid prefix. */
  testIdPrefix?: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; origin: SceneFamilyTrack[]; target: SceneFamilyTrack[] };

/** Short, recognisable id prefix — the full id lives in the row's title. */
function shortId(dbId: string): string {
  return dbId.length > 8 ? dbId.slice(0, 8) : dbId;
}

/**
 * One selectable track row. Users recognise tracks by their generation prompt,
 * so the prompt is the prominent line; role + id sit underneath in a smaller,
 * muted font (prompt → role → id order). Falls back to the display name when a
 * track has no prompt (e.g. sample/audio).
 */
function CandidateRow({
  track,
  selected,
  disabled,
  onSelect,
  testId,
}: {
  track: SceneFamilyTrack;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  testId: string;
}): React.ReactElement {
  const primary = track.prompt?.trim() || track.name;
  const meta = [track.role, shortId(track.dbId)].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-testid={testId}
      data-value={track.dbId}
      onClick={onSelect}
      disabled={disabled}
      className={`w-full text-left px-2 py-1.5 rounded-sm border transition-colors disabled:opacity-50 ${
        selected
          ? 'bg-sas-accent/15 border-sas-accent'
          : 'bg-sas-panel border-sas-border hover:border-sas-accent/50'
      }`}
    >
      <div className="text-xs text-sas-text truncate" title={primary}>
        {primary}
      </div>
      {meta && (
        <div className="text-[10px] text-sas-muted truncate mt-0.5" title={track.dbId}>
          {meta}
        </div>
      )}
    </button>
  );
}

export function CrossfadeModal({
  host,
  open,
  fromSceneId,
  toSceneId,
  fromSceneName,
  toSceneName,
  excludeSourceDbIds,
  onClose,
  onCreate,
  testIdPrefix = 'crossfade-modal',
}: CrossfadeModalProps): React.ReactElement | null {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [originDbId, setOriginDbId] = useState<string>('');
  const [targetDbId, setTargetDbId] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromName, setFromName] = useState<string | null>(null);
  const [toName, setToName] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!host.listSceneFamilyTracks) {
      setLoad({ status: 'error', message: 'This host does not support crossfade tracks.' });
      return;
    }
    setLoad({ status: 'loading' });
    try {
      const [origin, target, fName, tName] = await Promise.all([
        host.listSceneFamilyTracks(fromSceneId),
        host.listSceneFamilyTracks(toSceneId),
        host.getSceneName ? host.getSceneName(fromSceneId) : Promise.resolve(null),
        host.getSceneName ? host.getSceneName(toSceneId) : Promise.resolve(null),
      ]);
      setFromName(fName);
      setToName(tName);
      setLoad({ status: 'ready', origin, target });
    } catch (err: unknown) {
      setLoad({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load tracks.' });
    }
  }, [host, fromSceneId, toSceneId]);

  // Fetch on open; reset state.
  useEffect(() => {
    if (open) {
      setError(null);
      setIsCreating(false);
      setOriginDbId('');
      setTargetDbId('');
      void refresh();
    }
  }, [open, refresh]);

  // Hide any source track already used in a crossfade (each source used once).
  const excludeSet = useMemo(() => new Set(excludeSourceDbIds ?? []), [excludeSourceDbIds]);

  // The only constraint is same plugin/family (already enforced per-panel), so the
  // two lists are independent — pick in any order, any role.
  const originCandidates = useMemo(
    () => (load.status === 'ready' ? load.origin.filter((t) => !excludeSet.has(t.dbId)) : []),
    [load, excludeSet],
  );
  const targetCandidates = useMemo(
    () => (load.status === 'ready' ? load.target.filter((t) => !excludeSet.has(t.dbId)) : []),
    [load, excludeSet],
  );

  // Keep each selection valid / defaulted to its first candidate, independently.
  useEffect(() => {
    if (!originCandidates.some((t) => t.dbId === originDbId)) {
      setOriginDbId(originCandidates[0]?.dbId ?? '');
    }
  }, [originCandidates, originDbId]);
  useEffect(() => {
    if (!targetCandidates.some((t) => t.dbId === targetDbId)) {
      setTargetDbId(targetCandidates[0]?.dbId ?? '');
    }
  }, [targetCandidates, targetDbId]);

  const originTrack = originCandidates.find((t) => t.dbId === originDbId) ?? null;
  const targetTrack = targetCandidates.find((t) => t.dbId === targetDbId) ?? null;
  const canCreate = !isCreating && !!originTrack && !!targetTrack;

  const handleClose = useCallback((): void => {
    if (!isCreating) onClose();
  }, [isCreating, onClose]);

  const handleCreate = useCallback(async (): Promise<void> => {
    if (!originTrack || !targetTrack) return;
    setIsCreating(true);
    setError(null);
    try {
      await onCreate(
        { dbId: originTrack.dbId, name: originTrack.name, role: originTrack.role },
        { dbId: targetTrack.dbId, name: targetTrack.name, role: targetTrack.role },
      );
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create crossfade.');
      setIsCreating(false);
    }
  }, [originTrack, targetTrack, onCreate, onClose]);

  // Prefer the live-fetched scene names; fall back to the optional props.
  const fromLabel = fromName ?? fromSceneName ?? null;
  const toLabel = toName ?? toSceneName ?? null;

  if (!open) return null;

  return (
    <Modal open={open} onClose={handleClose} testIdPrefix={testIdPrefix} initialFocusRef={cancelRef}>
      <div
        className="bg-sas-panel border border-sas-border rounded-md shadow-xl w-[420px] max-w-[92vw] p-4 space-y-3"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        data-testid={`${testIdPrefix}-box`}
      >
        <h3 className="text-sm font-bold text-sas-text">Add crossfade</h3>
        <p className="text-[11px] text-sas-muted leading-relaxed">
          Bridge a track from{' '}
          <span className="text-sas-text">{fromLabel ?? 'the origin scene'}</span> into one from{' '}
          <span className="text-sas-text">{toLabel ?? 'the target scene'}</span>. Both layers share one
          generated part; each keeps its own preset.
        </p>

        {load.status === 'loading' && (
          <div className="text-xs text-sas-muted py-4 text-center">Loading tracks…</div>
        )}
        {load.status === 'error' && (
          <div className="text-xs text-sas-danger py-4 text-center">{load.message}</div>
        )}
        {load.status === 'ready' &&
          (originCandidates.length === 0 ? (
            <div
              className="text-xs text-sas-muted py-4 text-center"
              data-testid={`${testIdPrefix}-empty-origin`}
            >
              No available tracks in {fromLabel ?? 'the origin scene'}. Add one (or free one from another
              crossfade) first.
            </div>
          ) : (
            <>
              <div className="block">
                <span className="text-[10px] uppercase tracking-wide text-sas-muted">
                  Origin {fromLabel ? `(${fromLabel})` : '(top)'}
                </span>
                <div
                  role="radiogroup"
                  aria-label="Origin track"
                  data-testid={`${testIdPrefix}-origin-list`}
                  className="mt-1 space-y-1 max-h-40 overflow-y-auto pr-0.5"
                >
                  {originCandidates.map((t) => (
                    <CandidateRow
                      key={t.dbId}
                      track={t}
                      selected={t.dbId === originDbId}
                      disabled={isCreating}
                      onSelect={() => setOriginDbId(t.dbId)}
                      testId={`${testIdPrefix}-origin-option-${t.dbId}`}
                    />
                  ))}
                </div>
              </div>

              <div className="block">
                <span className="text-[10px] uppercase tracking-wide text-sas-muted">
                  Target {toLabel ? `(${toLabel})` : '(bottom)'}
                </span>
                {targetCandidates.length === 0 ? (
                  <div className="text-xs text-sas-danger mt-0.5" data-testid={`${testIdPrefix}-empty-target`}>
                    No available tracks in {toLabel ?? 'the target scene'} to crossfade into.
                  </div>
                ) : (
                  <div
                    role="radiogroup"
                    aria-label="Target track"
                    data-testid={`${testIdPrefix}-target-list`}
                    className="mt-1 space-y-1 max-h-40 overflow-y-auto pr-0.5"
                  >
                    {targetCandidates.map((t) => (
                      <CandidateRow
                        key={t.dbId}
                        track={t}
                        selected={t.dbId === targetDbId}
                        disabled={isCreating}
                        onSelect={() => setTargetDbId(t.dbId)}
                        testId={`${testIdPrefix}-target-option-${t.dbId}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          ))}

        {error && (
          <div className="text-xs text-sas-danger" data-testid={`${testIdPrefix}-error`}>
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            ref={cancelRef}
            data-testid={`${testIdPrefix}-cancel`}
            onClick={onClose}
            disabled={isCreating}
            className="px-3 py-1 text-xs rounded-sm border border-sas-border text-sas-muted hover:text-sas-text disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            data-testid={`${testIdPrefix}-confirm`}
            onClick={handleCreate}
            disabled={!canCreate}
            className={`px-3 py-1 text-xs rounded-sm border transition-colors ${
              canCreate
                ? 'bg-sas-accent/20 border-sas-accent text-sas-accent hover:bg-sas-accent hover:text-sas-bg'
                : 'bg-sas-panel border-sas-border text-sas-muted/50 cursor-not-allowed'
            }`}
          >
            {isCreating ? 'Generating bridge…' : 'Create crossfade'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default CrossfadeModal;
