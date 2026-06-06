/**
 * useTrackReorder — shared drag-and-drop row reordering for generator panels.
 *
 * One hook drives the whole flow so every panel (drums / instruments / synths)
 * behaves identically: HTML5 drag mechanics (zero dependencies), an optimistic
 * local reorder, persistence via {@link PluginHost.reorderTracks}, and an
 * automatic revert if persistence fails. Panels supply their track array + its
 * setter and spread the returned props onto each {@link TrackRow}; the grip
 * handle and drop-target visuals live in TrackRow.
 *
 * Persisted ids should be STABLE (use `getId: t => t.handle.dbId`) — engine
 * track ids are not stable across project reopen.
 */
import { useCallback, useRef, useState } from 'react';
import type { DragEvent, Dispatch, SetStateAction } from 'react';
import type { PluginHost } from '../types/plugin-sdk.types';

/**
 * Props the reorder machinery hands to a single row. Spread `handleProps` on the
 * drag grip and `rowProps` on the row's outer element; `isDragging` /
 * `isDragTarget` drive the visual state.
 */
export interface TrackRowDragProps {
  handleProps: {
    draggable: true;
    onDragStart: (e: DragEvent<HTMLElement>) => void;
    onDragEnd: (e: DragEvent<HTMLElement>) => void;
  };
  rowProps: {
    onDragEnter: (e: DragEvent<HTMLElement>) => void;
    onDragOver: (e: DragEvent<HTMLElement>) => void;
    onDragLeave: (e: DragEvent<HTMLElement>) => void;
    onDrop: (e: DragEvent<HTMLElement>) => void;
  };
  /** This row is the one currently being dragged (dim it). */
  isDragging: boolean;
  /** This row is the current drop target (show an insertion accent). */
  isDragTarget: boolean;
}

/**
 * Pure helper: return a NEW array with the item at `from` moved to `to`.
 * Out-of-range or no-op moves return a shallow copy unchanged. Exported for
 * unit testing the index math without a DOM.
 */
export function moveItem<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = arr.slice();
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= next.length ||
    to >= next.length
  ) {
    return next;
  }
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export interface UseTrackReorderOptions<T> {
  /** Host (only {@link PluginHost.reorderTracks} is used). */
  host: Pick<PluginHost, 'reorderTracks'>;
  /** The panel's current track array (also the render order). */
  items: T[];
  /** The panel's state setter for `items` (used for optimistic update + revert). */
  setItems: Dispatch<SetStateAction<T[]>>;
  /** Stable id for persistence — use the track's dbId, not its engine id. */
  getId: (item: T) => string;
  /** Called if persistence fails, after the optimistic update is reverted. */
  onError?: (err: unknown) => void;
}

export interface UseTrackReorderResult {
  /** Build the drag props for the row at `index`; spread onto its TrackRow. */
  dragPropsFor: (index: number) => TrackRowDragProps;
  /** Index of the row being dragged, or null. */
  draggingIndex: number | null;
  /** Index of the current drop-target row, or null. */
  dragOverIndex: number | null;
}

/**
 * Drag-and-drop reordering for a panel's track list. Dropping a row onto another
 * row moves it into that row's position (everything between shifts); the top and
 * bottom are reachable by dropping on the first/last row.
 */
export function useTrackReorder<T>({
  host,
  items,
  setItems,
  getId,
  onError,
}: UseTrackReorderOptions<T>): UseTrackReorderResult {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // Source index for the in-flight drag; a ref avoids stale-closure reads in the
  // drop handler. itemsRef keeps the freshest array without re-creating handlers.
  const fromRef = useRef<number | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const dragPropsFor = useCallback(
    (index: number): TrackRowDragProps => ({
      handleProps: {
        draggable: true,
        onDragStart: (e) => {
          fromRef.current = index;
          setDraggingIndex(index);
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            // Required by Firefox to start a drag; the value itself is unused.
            try {
              e.dataTransfer.setData('text/plain', String(index));
            } catch {
              /* some environments disallow setData — drag still works */
            }
          }
        },
        onDragEnd: () => {
          fromRef.current = null;
          setDraggingIndex(null);
          setDragOverIndex(null);
        },
      },
      rowProps: {
        onDragEnter: (e) => {
          if (fromRef.current === null) return;
          e.preventDefault();
          setDragOverIndex(index);
        },
        onDragOver: (e) => {
          if (fromRef.current === null) return;
          e.preventDefault(); // allow drop
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
          setDragOverIndex((cur) => (cur === index ? cur : index));
        },
        onDragLeave: () => {
          setDragOverIndex((cur) => (cur === index ? null : cur));
        },
        onDrop: (e) => {
          e.preventDefault();
          const from = fromRef.current;
          fromRef.current = null;
          setDraggingIndex(null);
          setDragOverIndex(null);
          if (from === null || from === index) return;

          const prev = itemsRef.current;
          const next = moveItem(prev, from, index);
          setItems(next);
          const ids = next.map(getId);
          Promise.resolve(host.reorderTracks(ids)).catch((err) => {
            // Persistence failed — roll back to the pre-drag order.
            setItems(prev);
            onError?.(err);
          });
        },
      },
      isDragging: draggingIndex === index,
      isDragTarget: dragOverIndex === index && draggingIndex !== index,
    }),
    [host, setItems, getId, onError, draggingIndex, dragOverIndex]
  );

  return { dragPropsFor, draggingIndex, dragOverIndex };
}
