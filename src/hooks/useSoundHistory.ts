/**
 * useSoundHistory — generic, per-track "what sounds has this track had?" stack.
 *
 * Powers the TrackRow ↩ back-arrow (one-click "previous sound") and the drawer
 * "History" tab (restore any earlier sound). The SDK is deliberately ignorant of
 * WHAT a sound is: each generator plugin records an opaque `descriptor`
 * (a drum sample path / an instrument `{ displayName, zones }` / a synth
 * `{ pluginIndex, stateBase64 }`) plus a human `label`, and supplies an
 * `applySound` callback the hook calls to re-apply a chosen descriptor.
 *
 * Model: per track, an ordered list of the sounds it has had this session and a
 * `cursor` marking the currently-applied one. `record()` appends a newly-applied
 * sound; `undo()` steps the cursor back one; `restoreTo()` jumps to any entry.
 * History is in-memory only — it resets when the panel reloads (scene reopen).
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
  /** Forget a track's history (e.g. on regenerate or track delete). */
  clear(trackId: string): void;
  /** Forget ALL tracks' history (e.g. on scene reload, so history resets on reopen). */
  reset(): void;
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
  opts: { max?: number } = {},
): UseSoundHistoryResult {
  const max = Math.max(2, opts.max ?? 24);
  // Authoritative store lives in a ref so async callbacks read the latest value;
  // a version counter forces re-render when it changes.
  const dataRef = useRef<Record<string, TrackSoundHistory>>({});
  const [, setVersion] = useState(0);
  const bump = useCallback((): void => setVersion((v) => v + 1), []);

  const record = useCallback(
    (trackId: string, descriptor: unknown, label: string): void => {
      const h = dataRef.current[trackId];
      const current = h && h.cursor >= 0 ? h.entries[h.cursor] : undefined;
      // Ignore re-applying the same sound (no-op shuffles, scene re-seeds).
      if (current && sameDescriptor(current.descriptor, descriptor)) return;
      const base = h ? [...h.entries] : [];
      let entries: SoundHistoryEntry[] = [...base, { descriptor, label }];
      if (entries.length > max) entries = entries.slice(entries.length - max);
      dataRef.current = {
        ...dataRef.current,
        [trackId]: { entries, cursor: entries.length - 1 },
      };
      bump();
    },
    [max, bump],
  );

  const restoreTo = useCallback(
    async (trackId: string, index: number): Promise<boolean> => {
      const h = dataRef.current[trackId];
      if (!h || index < 0 || index >= h.entries.length || index === h.cursor) {
        return false;
      }
      await applySound(trackId, h.entries[index].descriptor);
      dataRef.current = {
        ...dataRef.current,
        [trackId]: { entries: h.entries, cursor: index },
      };
      bump();
      return true;
    },
    [applySound, bump],
  );

  const undo = useCallback(
    (trackId: string): Promise<boolean> => {
      const h = dataRef.current[trackId];
      if (!h || h.cursor <= 0) return Promise.resolve(false);
      return restoreTo(trackId, h.cursor - 1);
    },
    [restoreTo],
  );

  const list = useCallback((trackId: string): TrackSoundHistory => {
    return dataRef.current[trackId] ?? EMPTY;
  }, []);

  const canUndo = useCallback((trackId: string): boolean => {
    const h = dataRef.current[trackId];
    return !!h && h.cursor > 0;
  }, []);

  const clear = useCallback(
    (trackId: string): void => {
      if (!dataRef.current[trackId]) return;
      const next = { ...dataRef.current };
      delete next[trackId];
      dataRef.current = next;
      bump();
    },
    [bump],
  );

  const reset = useCallback((): void => {
    dataRef.current = {};
    bump();
  }, [bump]);

  // Stable object so consumers can safely list it in useCallback/useEffect deps.
  return useMemo(
    () => ({ record, undo, restoreTo, list, canUndo, clear, reset }),
    [record, undo, restoreTo, list, canUndo, clear, reset],
  );
}
