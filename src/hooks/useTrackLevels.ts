/**
 * useTrackLevels — drives the cosmetic per-track strip meters.
 *
 * The hard constraint for this feature is "playback ALWAYS wins over the GUI;
 * NO blocking threads." This hook is built around that:
 *
 *  - It polls `host.getTrackLevels()` at ~30Hz with a recursive setTimeout that
 *    only schedules the NEXT tick AFTER the previous await resolves. That is
 *    automatic backpressure: a slow/stalled engine simply slows the meter, it
 *    can never queue a backlog of requests. (The host + bridge also coalesce,
 *    so a busy engine yields a STALE snapshot, never a pile-up.)
 *  - It writes into a ref-held Map and notifies row subscribers, so the OWNING
 *    panel never re-renders at 30Hz. Each row reads its own value via
 *    `useTrackLevel` and re-renders only itself.
 *  - It polls while the panel is mounted and the window is visible, and pauses
 *    when the window is hidden. It deliberately does NOT gate on transport
 *    "is playing": this app drives playback through decks / the clip launcher,
 *    and the linear-transport play flag does not track that reliably. When
 *    audio is stopped the engine simply returns floor levels, so the bars are
 *    empty anyway — no need (and no reliable signal) to stop polling.
 *
 * Usage (panel):
 *   const levels = useTrackLevels(host);
 *   ...<TrackRow levels={levels} ... />   // row calls useTrackLevel(levels, id)
 */

import { useEffect, useRef, useState } from 'react';
import type { PluginHost, PluginTrackLevel } from '../types/plugin-sdk.types';

/** Polling cadence — matches the recording input meter (~30Hz). */
const POLL_INTERVAL_MS = 33;
/** Slow idle re-check while the window is hidden (polling is paused). */
const HIDDEN_RECHECK_MS = 250;

/**
 * Stable handle returned by {@link useTrackLevels}. Rows read their own level
 * and subscribe to per-tick notifications through it; its identity is stable
 * across renders so a row's subscription is set up once.
 */
export interface TrackLevelsHandle {
  /** Current level for a track, or null when idle/absent (renders an empty bar). */
  getLevel(trackId: string): PluginTrackLevel | null;
  /** Subscribe to per-tick updates. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden === true;
}

/**
 * Poll every owned track's level while mounted + visible. Returns a stable
 * handle; the owning component does NOT re-render per tick. Pass `enabled =
 * false` to turn it off entirely (e.g. a panel that wants no meters). Safe to
 * call even when the host predates `getTrackLevels` (older SDK) — it stays idle.
 */
export function useTrackLevels(
  host: PluginHost | null | undefined,
  enabled: boolean = true
): TrackLevelsHandle {
  const mapRef = useRef<Map<string, PluginTrackLevel>>(new Map());
  const listenersRef = useRef<Set<() => void>>(new Set());

  // Built exactly once so the handle identity is stable across renders.
  const handleRef = useRef<TrackLevelsHandle | null>(null);
  if (handleRef.current === null) {
    handleRef.current = {
      getLevel: (trackId: string) => mapRef.current.get(trackId) ?? null,
      subscribe: (listener: () => void) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
    };
  }

  useEffect(() => {
    const notify = (): void => {
      listenersRef.current.forEach((l) => l());
    };

    const clearToIdle = (): void => {
      if (mapRef.current.size > 0) {
        mapRef.current.clear();
        notify();
      }
    };

    const canPoll =
      enabled && !!host && typeof host.getTrackLevels === 'function';

    if (!canPoll) {
      clearToIdle();
      return;
    }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delay: number): void => {
      if (stopped) return;
      timer = setTimeout(tick, delay);
    };

    const tick = async (): Promise<void> => {
      if (stopped) return;

      // Paused while the window is hidden: do no engine work, just idle-poll
      // until it comes back. (visibilitychange below resumes immediately.)
      if (isHidden()) {
        schedule(HIDDEN_RECHECK_MS);
        return;
      }

      try {
        const levels = await host!.getTrackLevels!();
        if (stopped) return;

        // Rebuild the map: upsert present tracks, drop ones that vanished.
        const seen = new Set<string>();
        for (const lvl of levels) {
          mapRef.current.set(lvl.trackId, lvl);
          seen.add(lvl.trackId);
        }
        for (const key of Array.from(mapRef.current.keys())) {
          if (!seen.has(key)) mapRef.current.delete(key);
        }
        notify();
      } catch {
        // Cosmetic meter: swallow transient read failures and keep polling.
      }

      // Schedule the NEXT tick only now — backpressure: never overlap reads.
      schedule(POLL_INTERVAL_MS);
    };

    const onVisibility = (): void => {
      if (stopped) return;
      if (!isHidden()) {
        // Becoming visible: cancel the slow idle-poll and resume immediately.
        if (timer) clearTimeout(timer);
        void tick();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    void tick();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      // Leave the map intact on teardown; the next active effect rebuilds it.
    };
  }, [host, enabled]);

  return handleRef.current;
}

/** Cheap equality so unchanged rows skip re-rendering between ticks. */
function sameLevel(
  a: PluginTrackLevel | null,
  b: PluginTrackLevel | null
): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return a.peakDb === b.peakDb && a.clipped === b.clipped;
}

/**
 * Per-row selector. Subscribes to the shared scheduler and re-renders ONLY the
 * calling component when this track's level changes. Returns null when idle
 * (transport stopped, window hidden, or the track has no meter yet).
 */
export function useTrackLevel(
  handle: TrackLevelsHandle | null | undefined,
  trackId: string
): PluginTrackLevel | null {
  const [level, setLevel] = useState<PluginTrackLevel | null>(null);

  useEffect(() => {
    if (!handle) {
      setLevel(null);
      return;
    }
    const update = (): void => {
      const next = handle.getLevel(trackId);
      setLevel((prev) => (sameLevel(prev, next) ? prev : next));
    };
    update(); // seed immediately
    return handle.subscribe(update);
  }, [handle, trackId]);

  return level;
}

/**
 * Track the transport's play/stop state for a plugin. Seeds from
 * `getTransportState()` and follows `onTransportEvent`. Use its result as the
 * `active` arg to {@link useTrackLevels} so meters animate only during playback.
 */
export function useTransportPlaying(host: PluginHost | null | undefined): boolean {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!host) {
      setPlaying(false);
      return;
    }
    let cancelled = false;

    host
      .getTransportState()
      .then((state) => {
        if (!cancelled) setPlaying(!!state.isPlaying);
      })
      .catch(() => {
        /* seed best-effort; events will correct it */
      });

    const unsub = host.onTransportEvent?.((evt) => {
      if (typeof evt.isPlaying === 'boolean') {
        setPlaying(evt.isPlaying);
      } else if (evt.type === 'play') {
        setPlaying(true);
      } else if (evt.type === 'stop' || evt.type === 'pause') {
        setPlaying(false);
      }
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [host]);

  return playing;
}
