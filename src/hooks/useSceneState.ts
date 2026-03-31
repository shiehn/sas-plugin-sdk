/**
 * useSceneState — Scene-keyed state hook for plugin developers.
 *
 * Works like `useState`, but maintains separate state per scene.
 * When the user switches scenes, the previous scene's state is preserved
 * and restored when they switch back.
 *
 * Returns `[value, setForCurrentScene, setForScene]`:
 * - `value` — state for the currently active scene
 * - `setForCurrentScene(v)` — updates state for whatever scene is active at call time
 * - `setForScene(sceneId, v)` — updates state for a specific scene (for async callbacks)
 *
 * Both setters support the functional updater pattern: `prev => next`.
 *
 * **Important:** For object/array `initialValue`, hoist to a module-level constant
 * to keep the setter callbacks referentially stable:
 * ```ts
 * const EMPTY: string[] = [];
 * const [items, setItems, setItemsForScene] = useSceneState(activeSceneId, EMPTY);
 * ```
 */

import { useState, useCallback, useRef } from 'react';

type SetSceneState<T> = (value: T | ((prev: T) => T)) => void;
type SetSceneStateForScene<T> = (sceneId: string, value: T | ((prev: T) => T)) => void;

export function useSceneState<T>(
  activeSceneId: string | null,
  initialValue: T
): [T, SetSceneState<T>, SetSceneStateForScene<T>] {
  const [stateMap, setStateMap] = useState<Map<string, T>>(() => new Map());
  const activeSceneIdRef = useRef(activeSceneId);
  activeSceneIdRef.current = activeSceneId;

  const currentValue = activeSceneId !== null && stateMap.has(activeSceneId)
    ? stateMap.get(activeSceneId)!
    : initialValue;

  const setForCurrentScene = useCallback((value: T | ((prev: T) => T)): void => {
    const sid = activeSceneIdRef.current;
    if (sid === null) return;
    setStateMap(prev => {
      const current = prev.has(sid) ? prev.get(sid)! : initialValue;
      const next = typeof value === 'function' ? (value as (prev: T) => T)(current) : value;
      const newMap = new Map(prev);
      newMap.set(sid, next);
      return newMap;
    });
  }, [initialValue]);

  const setForScene = useCallback((sceneId: string, value: T | ((prev: T) => T)): void => {
    setStateMap(prev => {
      const current = prev.has(sceneId) ? prev.get(sceneId)! : initialValue;
      const next = typeof value === 'function' ? (value as (prev: T) => T)(current) : value;
      const newMap = new Map(prev);
      newMap.set(sceneId, next);
      return newMap;
    });
  }, [initialValue]);

  return [currentValue, setForCurrentScene, setForScene];
}
