/**
 * useSoundHistory — generic, per-track "what sounds has this track had?" stack.
 *
 * Powers the drawer "History" tab: restore any earlier sound, star favorites,
 * and (via the host plugin) persist across project reopen. The SDK is ignorant
 * of WHAT a sound is — each plugin records an opaque `descriptor` (a drum sample
 * path / an instrument `{ displayName, zones }` / a synth Surge state blob) plus
 * a human `label`, and supplies `applySound` to re-apply a chosen descriptor.
 *
 * Persistence is the plugin's job: pass `opts.onChange` (called after every
 * mutation with the new state) to save, and call `restore()` on load to seed.
 * Favorited entries are never auto-evicted by the cap.
 *
 * Robustness: `applySound` + `onChange` are read through refs, so the returned
 * object is referentially STABLE regardless of whether the caller memoizes them.
 * Plugins list this object in `loadTracks` deps — an unstable return previously
 * caused a render loop, so keep it stable.
 *
 * @since SDK 2.13.0
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { SoundHistoryEntry } from '../types/plugin-sdk.types';

export type { SoundHistoryEntry };

/** A track's ordered sound history plus the index of the currently-applied sound. */
export interface TrackSoundHistory {
  entries: readonly SoundHistoryEntry[];
  /** Index into `entries` of the currently-applied sound; -1 when empty. */
  cursor: number;
}

export interface UseSoundHistoryOptions {
  /** Max non-favorited entries kept per track (favorites are never evicted). Default 24. */
  max?: number;
  /**
   * Called after every mutation (record/undo/restoreTo/toggleFavorite/clear) with the
   * track's new state — use it to persist. NOT called by `restore()` (that's a load).
   */
  onChange?: (trackId: string, state: TrackSoundHistory) => void;
}

export interface UseSoundHistoryResult {
  /** Remember a sound that was just applied (generation, scene-load, or shuffle). */
  record(trackId: string, descriptor: unknown, label: string): void;
  /** Re-apply the sound one step before the current one. Resolves true if it moved. */
  undo(trackId: string): Promise<boolean>;
  /** Re-apply a specific entry by index. Resolves true if it applied. */
  restoreTo(trackId: string, index: number): Promise<boolean>;
  /** The ordered history + cursor for a track (safe empty default). */
  list(trackId: string): TrackSoundHistory;
  /** Whether there is an earlier sound to step back to. */
  canUndo(trackId: string): boolean;
  /** Forget a track's history (e.g. on regenerate). Persists the cleared state. */
  clear(trackId: string): void;
  /** Forget ALL tracks' history in memory (e.g. before re-seeding on scene load). */
  reset(): void;
  /** Seed a track's full history (e.g. from persistence on load). Does NOT fire onChange. */
  restore(
    trackId: string,
    state: { entries?: readonly SoundHistoryEntry[]; cursor?: number } | null | undefined,
  ): void;
  /** Toggle the favorite flag on an entry (favorites survive cap eviction). */
  toggleFavorite(trackId: string, index: number): void;
}

const EMPTY: TrackSoundHistory = { entries: [], cursor: -1 };

function sameDescriptor(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function useSoundHistory(
  applySound: (trackId: string, descriptor: unknown) => Promise<void>,
  opts: UseSoundHistoryOptions = {},
): UseSoundHistoryResult {
  const max = Math.max(2, opts.max ?? 24);

  // Read callbacks through refs so the returned API stays referentially stable
  // even if the caller passes a fresh closure each render.
  const applyRef = useRef(applySound);
  applyRef.current = applySound;
  const onChangeRef = useRef(opts.onChange);
  onChangeRef.current = opts.onChange;

  // Authoritative store in a ref (async callbacks read latest); version forces re-render.
  const dataRef = useRef<Record<string, TrackSoundHistory>>({});
  const [, setVersion] = useState(0);
  const bump = useCallback((): void => setVersion((v) => v + 1), []);

  // Single writer: update store, re-render, optionally notify for persistence.
  const commit = useCallback(
    (trackId: string, next: TrackSoundHistory, notify: boolean): void => {
      dataRef.current = { ...dataRef.current, [trackId]: next };
      bump();
      if (notify) onChangeRef.current?.(trackId, next);
    },
    [bump],
  );

  const record = useCallback(
    (trackId: string, descriptor: unknown, label: string): void => {
      const h = dataRef.current[trackId];
      const current = h && h.cursor >= 0 ? h.entries[h.cursor] : undefined;
      // Ignore re-applying the same sound (no-op shuffles, scene re-seeds).
      if (current && sameDescriptor(current.descriptor, descriptor)) return;
      const entries: SoundHistoryEntry[] = [...(h ? h.entries : []), { descriptor, label }];
      // Cap: evict the OLDEST NON-FAVORITED entry when over the limit (favorites survive).
      while (entries.length > max) {
        const victim = entries.findIndex((e) => !e.favorite);
        if (victim === -1) break; // everything is favorited — keep it all
        entries.splice(victim, 1);
      }
      commit(trackId, { entries, cursor: entries.length - 1 }, true);
    },
    [max, commit],
  );

  const restoreTo = useCallback(
    async (trackId: string, index: number): Promise<boolean> => {
      const h = dataRef.current[trackId];
      if (!h || index < 0 || index >= h.entries.length || index === h.cursor) return false;
      await applyRef.current(trackId, h.entries[index].descriptor);
      commit(trackId, { entries: h.entries, cursor: index }, true);
      return true;
    },
    [commit],
  );

  const undo = useCallback(
    (trackId: string): Promise<boolean> => {
      const h = dataRef.current[trackId];
      if (!h || h.cursor <= 0) return Promise.resolve(false);
      return restoreTo(trackId, h.cursor - 1);
    },
    [restoreTo],
  );

  const toggleFavorite = useCallback(
    (trackId: string, index: number): void => {
      const h = dataRef.current[trackId];
      if (!h || index < 0 || index >= h.entries.length) return;
      const entries = h.entries.map((e, i) => (i === index ? { ...e, favorite: !e.favorite } : e));
      commit(trackId, { entries, cursor: h.cursor }, true);
    },
    [commit],
  );

  const restore = useCallback(
    (
      trackId: string,
      state: { entries?: readonly SoundHistoryEntry[]; cursor?: number } | null | undefined,
    ): void => {
      const entries: SoundHistoryEntry[] = Array.isArray(state?.entries) ? [...state!.entries] : [];
      const raw = typeof state?.cursor === 'number' ? state!.cursor : entries.length - 1;
      const cursor = entries.length === 0 ? -1 : Math.min(Math.max(raw, 0), entries.length - 1);
      commit(trackId, { entries, cursor }, false);
    },
    [commit],
  );

  const list = useCallback(
    (trackId: string): TrackSoundHistory => dataRef.current[trackId] ?? EMPTY,
    [],
  );

  const canUndo = useCallback((trackId: string): boolean => {
    const h = dataRef.current[trackId];
    return !!h && h.cursor > 0;
  }, []);

  const clear = useCallback(
    (trackId: string): void => {
      if (dataRef.current[trackId]) {
        const next = { ...dataRef.current };
        delete next[trackId];
        dataRef.current = next;
        bump();
      }
      onChangeRef.current?.(trackId, EMPTY); // persist the cleared state
    },
    [bump],
  );

  const reset = useCallback((): void => {
    dataRef.current = {};
    bump();
  }, [bump]);

  // Stable object so consumers can safely list it in useCallback/useEffect deps.
  return useMemo(
    () => ({ record, undo, restoreTo, list, canUndo, clear, reset, restore, toggleFavorite }),
    [record, undo, restoreTo, list, canUndo, clear, reset, restore, toggleFavorite],
  );
}
