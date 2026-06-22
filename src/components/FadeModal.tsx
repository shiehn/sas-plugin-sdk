/**
 * FadeModal — "add a fade" picker for a transition scene.
 *
 * Shown only inside a `scene_type='transition'` scene. It self-fetches the FROM
 * (origin) and TO (target) scenes' family tracks and diffs them by role to find
 * ORPHANS — tracks with no counterpart on the other side:
 *   - origin-only surplus → "Fade out" candidates (the track leaves)
 *   - target-only surplus → "Fade in" candidates (the track enters)
 * Tracks whose role is matched on both sides are crossfade territory and are NOT
 * shown here. A source already used in a crossfade or a fade is hidden (via
 * excludeSourceDbIds).
 *
 * The fade GESTURE (volume vs build) is auto-selected from the track's role and
 * shown read-only — the user does not choose it. On confirm the modal hands the
 * selection + direction + gesture to `onCreate`, which the panel implements
 * (create one track, generate a chord-conforming part, copy the sound, apply a
 * one-sided volume curve). `onCreate` should reject on failure so the modal can
 * show it and stay open.
 *
 * @since SDK 2.28.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './Modal';
import type { PluginHost, SceneFamilyTrack } from '../types/plugin-sdk.types';
import { type FadeDirection, type FadeGesture, defaultFadeGesture } from '../fade-meta';

/** A picked orphan track handed to `onCreate`. */
export interface FadeSelection {
  /** Source track DB id (selector for getTrackSound + seeding the part). */
  dbId: string;
  /** Display name (for the row caption). */
  name: string;
  /** Musical role of the source track (drives the auto gesture). */
  role?: string;
}

export interface FadeModalProps {
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
  /** Source-track DB ids already used in a crossfade OR a fade — hidden here. */
  excludeSourceDbIds?: readonly string[];
  /** Close handler (Escape, backdrop, Cancel, or after a successful create). */
  onClose: () => void;
  /** Build the fade. Should reject on failure so the modal shows it. */
  onCreate: (selection: FadeSelection, direction: FadeDirection, gesture: FadeGesture) => Promise<void>;
  /** data-testid prefix. */
  testIdPrefix?: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; from: SceneFamilyTrack[]; to: SceneFamilyTrack[] };

/** Short, recognisable id prefix — the full id lives in the row's title. */
function shortId(dbId: string): string {
  return dbId.length > 8 ? dbId.slice(0, 8) : dbId;
}

const normRole = (r: string | undefined): string => (r ?? '').toLowerCase().trim();

/**
 * Multiset role-diff: per role token, pair min(from,to) as SHARED (crossfade
 * territory — hidden), and return the surplus on each side as orphans.
 */
function computeOrphans(
  from: SceneFamilyTrack[],
  to: SceneFamilyTrack[],
  excludeSet: ReadonlySet<string>,
): { fadeOut: SceneFamilyTrack[]; fadeIn: SceneFamilyTrack[] } {
  const bucket = (list: SceneFamilyTrack[]): Map<string, SceneFamilyTrack[]> => {
    const m = new Map<string, SceneFamilyTrack[]>();
    for (const t of list) {
      const k = normRole(t.role);
      const arr = m.get(k);
      if (arr) arr.push(t);
      else m.set(k, [t]);
    }
    return m;
  };
  const fromByRole = bucket(from);
  const toByRole = bucket(to);
  const roles = new Set<string>([...fromByRole.keys(), ...toByRole.keys()]);
  const fadeOut: SceneFamilyTrack[] = [];
  const fadeIn: SceneFamilyTrack[] = [];
  for (const role of roles) {
    const f = fromByRole.get(role) ?? [];
    const t = toByRole.get(role) ?? [];
    const shared = Math.min(f.length, t.length);
    fadeOut.push(...f.slice(shared));
    fadeIn.push(...t.slice(shared));
  }
  return {
    fadeOut: fadeOut.filter((x) => !excludeSet.has(x.dbId)),
    fadeIn: fadeIn.filter((x) => !excludeSet.has(x.dbId)),
  };
}

/**
 * One selectable orphan row. Prompt-first (users recognise tracks by prompt);
 * role + id + the auto gesture sit underneath in a smaller, muted font.
 */
function OrphanRow({
  track,
  gesture,
  selected,
  disabled,
  onSelect,
  testId,
}: {
  track: SceneFamilyTrack;
  gesture: FadeGesture;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  testId: string;
}): React.ReactElement {
  const primary = track.prompt?.trim() || track.name;
  const meta = [track.role, shortId(track.dbId), gesture].filter(Boolean).join(' · ');
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

export function FadeModal({
  host,
  open,
  fromSceneId,
  toSceneId,
  fromSceneName,
  toSceneName,
  excludeSourceDbIds,
  onClose,
  onCreate,
  testIdPrefix = 'fade-modal',
}: FadeModalProps): React.ReactElement | null {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [selectedDbId, setSelectedDbId] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromName, setFromName] = useState<string | null>(null);
  const [toName, setToName] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!host.listSceneFamilyTracks) {
      setLoad({ status: 'error', message: 'This host does not support fades.' });
      return;
    }
    setLoad({ status: 'loading' });
    try {
      const [from, to, fName, tName] = await Promise.all([
        host.listSceneFamilyTracks(fromSceneId),
        host.listSceneFamilyTracks(toSceneId),
        host.getSceneName ? host.getSceneName(fromSceneId) : Promise.resolve(null),
        host.getSceneName ? host.getSceneName(toSceneId) : Promise.resolve(null),
      ]);
      setFromName(fName);
      setToName(tName);
      setLoad({ status: 'ready', from, to });
    } catch (err: unknown) {
      setLoad({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load tracks.' });
    }
  }, [host, fromSceneId, toSceneId]);

  // Fetch on open; reset state.
  useEffect(() => {
    if (open) {
      setError(null);
      setIsCreating(false);
      setSelectedDbId('');
      void refresh();
    }
  }, [open, refresh]);

  const excludeSet = useMemo(() => new Set(excludeSourceDbIds ?? []), [excludeSourceDbIds]);

  const { fadeOut, fadeIn } = useMemo(
    () =>
      load.status === 'ready'
        ? computeOrphans(load.from, load.to, excludeSet)
        : { fadeOut: [] as SceneFamilyTrack[], fadeIn: [] as SceneFamilyTrack[] },
    [load, excludeSet],
  );

  // One flat selection space across both sections (dbIds are unique).
  const allOrphans = useMemo(
    () => [
      ...fadeOut.map((t) => ({ track: t, direction: 'out' as FadeDirection })),
      ...fadeIn.map((t) => ({ track: t, direction: 'in' as FadeDirection })),
    ],
    [fadeOut, fadeIn],
  );

  // Keep the selection valid / defaulted to the first orphan.
  useEffect(() => {
    if (!allOrphans.some((o) => o.track.dbId === selectedDbId)) {
      setSelectedDbId(allOrphans[0]?.track.dbId ?? '');
    }
  }, [allOrphans, selectedDbId]);

  const selected = allOrphans.find((o) => o.track.dbId === selectedDbId) ?? null;
  const canCreate = !isCreating && !!selected;

  const handleClose = useCallback((): void => {
    if (!isCreating) onClose();
  }, [isCreating, onClose]);

  const handleCreate = useCallback(async (): Promise<void> => {
    if (!selected) return;
    setIsCreating(true);
    setError(null);
    try {
      await onCreate(
        { dbId: selected.track.dbId, name: selected.track.name, role: selected.track.role },
        selected.direction,
        defaultFadeGesture(selected.track.role),
      );
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create fade.');
      setIsCreating(false);
    }
  }, [selected, onCreate, onClose]);

  const fromLabel = fromName ?? fromSceneName ?? null;
  const toLabel = toName ?? toSceneName ?? null;

  if (!open) return null;

  const renderSection = (
    heading: string,
    list: SceneFamilyTrack[],
    section: 'out' | 'in',
  ): React.ReactElement | null => {
    if (list.length === 0) return null;
    return (
      <div className="block">
        <span className="text-[10px] uppercase tracking-wide text-sas-muted">{heading}</span>
        <div
          role="radiogroup"
          aria-label={heading}
          data-testid={`${testIdPrefix}-${section === 'out' ? 'fade-out' : 'fade-in'}-list`}
          className="mt-1 space-y-1 max-h-40 overflow-y-auto pr-0.5"
        >
          {list.map((t) => (
            <OrphanRow
              key={t.dbId}
              track={t}
              gesture={defaultFadeGesture(t.role)}
              selected={t.dbId === selectedDbId}
              disabled={isCreating}
              onSelect={() => setSelectedDbId(t.dbId)}
              testId={`${testIdPrefix}-option-${t.dbId}`}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <Modal open={open} onClose={handleClose} testIdPrefix={testIdPrefix} initialFocusRef={cancelRef}>
      <div
        className="bg-sas-panel border border-sas-border rounded-md shadow-xl w-[420px] max-w-[92vw] p-4 space-y-3"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        data-testid={`${testIdPrefix}-box`}
      >
        <h3 className="text-sm font-bold text-sas-text">Add fade</h3>
        <p className="text-[11px] text-sas-muted leading-relaxed">
          Tracks with no counterpart between{' '}
          <span className="text-sas-text">{fromLabel ?? 'the origin scene'}</span> and{' '}
          <span className="text-sas-text">{toLabel ?? 'the target scene'}</span> can gracefully fade
          out (leaving) or fade in (entering) across this transition.
        </p>

        {load.status === 'loading' && (
          <div className="text-xs text-sas-muted py-4 text-center">Loading tracks…</div>
        )}
        {load.status === 'error' && (
          <div className="text-xs text-sas-danger py-4 text-center">{load.message}</div>
        )}
        {load.status === 'ready' &&
          (allOrphans.length === 0 ? (
            <div className="text-xs text-sas-muted py-4 text-center" data-testid={`${testIdPrefix}-empty`}>
              Every track has a counterpart in the other scene — nothing to fade. Use “+ Crossfade” to
              bridge matching tracks.
            </div>
          ) : (
            <>
              {renderSection(`Fade out${fromLabel ? ` (from ${fromLabel})` : ''}`, fadeOut, 'out')}
              {renderSection(`Fade in${toLabel ? ` (to ${toLabel})` : ''}`, fadeIn, 'in')}
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
            {isCreating ? 'Generating fade…' : 'Create fade'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default FadeModal;
