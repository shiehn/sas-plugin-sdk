/**
 * Tracks-changed channel: how panel-core tells the panel bus that the
 * panel's track set just changed (S-027 slice S8, gap G1). @since SDK 3.19.0
 *
 * Why: the host routes a panel's tracks into its scene bus (and auto-engages
 * a fresh scene's bus) only when the bus state is READ. Before 3.19.0 nothing
 * re-read it when a track was created, so a new track played outside its bus
 * (dry of the bus FX, not under the bus fader) until a scene change or a
 * reopen. `useGeneratorPanelCore` owns the track loads but not the bus hook
 * (`GeneratorPanelShell` mounts `usePanelBus`), so the core emits here and
 * the shell forwards to `usePanelBus().notifyTracksChanged`.
 *
 * A plain synchronous listener set held for the panel's lifetime: no React
 * state (an emit never re-renders anything) and no host traffic of its own.
 * The listener does the coalescing (the bus reader's `refresh()`), so the
 * channel can emit as often as tracks change.
 */

export type TracksChangedListener = () => void;

export interface TracksChangedChannel {
  /** Add a listener; returns its unsubscribe (idempotent). */
  subscribe(listener: TracksChangedListener): () => void;
  /** Tell every current listener. A throwing listener never stops the others or the caller. */
  emit(): void;
  /** Current listener count (diagnostics and tests). */
  size(): number;
}

export function createTracksChangedChannel(): TracksChangedChannel {
  const listeners = new Set<TracksChangedListener>();
  return {
    subscribe(listener: TracksChangedListener): () => void {
      // Wrap so the same function subscribed twice gets two independent
      // subscriptions, each removed only by its own unsubscribe.
      const entry: TracksChangedListener = () => listener();
      listeners.add(entry);
      return () => {
        listeners.delete(entry);
      };
    },
    emit(): void {
      // Snapshot: a listener that unsubscribes (or subscribes) mid-emit
      // doesn't change who hears this emit.
      for (const listener of Array.from(listeners)) {
        try {
          listener();
        } catch (error: unknown) {
          // The emitter is a track load; a bus-side failure must not fail it.
          console.warn('[panel-core] tracks-changed listener threw:', error);
        }
      }
    },
    size(): number {
      return listeners.size;
    },
  };
}
