/**
 * ImportTrackBrowser — the scene → track drill-down behind every "import from
 * another scene" surface.
 *
 * Self-fetching: given the scoped `host`, it calls `host.listImportableTracks()`
 * to enumerate candidates (already filtered to the calling panel's type and
 * gate-annotated by the host) and `host.importTrack()` to perform the copy. The
 * UI only renders `importable` + `disabledReason` — it never computes the
 * harmonic/length/tempo gate itself. Incompatible tracks render disabled with a
 * reason tooltip (never hidden), per product decision.
 *
 * Two hosts, one body (@since SDK 3.1.0):
 *   - `variant='modal'` — inside ImportTrackModal, which supplies the title and
 *     a ✕ via `headerRight` and owns its own scroll box.
 *   - `variant='inline'` — rendered straight into the TrackDrawer's Import tab,
 *     so selecting the tab shows the scene list with no intervening button. It
 *     adds no scroll container of its own (the drawer already scrolls) and
 *     shows a header row only once you have drilled into a scene.
 *
 * @since SDK 3.1.0 (body extracted from ImportTrackModal, SDK 2.13.0)
 */

import React, { useCallback, useEffect, useState } from 'react';
import type {
  PluginHost,
  ImportCandidateScene,
  ImportCandidateTrack,
  PluginTrackHandle,
} from '../types/plugin-sdk.types';

export interface ImportTrackBrowserSelection {
  sourceTrackDbId: string;
  trackName: string;
  sceneName: string;
}

export interface ImportTrackBrowserProps {
  /** Scoped host — the browser calls listImportableTracks / importTrack itself. */
  host: PluginHost;
  /**
   * 'track' (default) imports a whole track via `importTrack`. 'sound' copies
   * ONLY the sound onto an existing track: every candidate is selectable (the
   * contract gate is ignored) and the chosen track is handed back via `onPick`
   * instead of being imported — the caller applies it via `host.getTrackSound`.
   */
  mode?: 'track' | 'sound';
  /** Fired after a successful whole-track import with the new track handle. */
  onImported?: (handle: PluginTrackHandle) => void;
  /** Sound-mode pick handler — required when `mode='sound'`. */
  onPick?: (sel: ImportTrackBrowserSelection) => void | Promise<void>;
  /**
   * Cross-panel port handler (track mode). When provided, the browser also
   * lists the ACTIVE scene's tracks owned by OTHER panels as a `sameScene`
   * group — shown first and selected by default — and routes a pick there to
   * this callback instead of `importTrack`.
   */
  onPortTrack?: (sel: { sourceTrackDbId: string; trackName: string; role?: string }) => void | Promise<void>;
  /** Fired once a pick commits (the modal closes on it). */
  onCommit?: () => void;
  /** Header title. Omit to show the header row only while drilled into a scene. */
  title?: string;
  /** Rendered at the right of the header row — the modal's ✕. */
  headerRight?: React.ReactNode;
  /** Layout host: 'modal' owns its scroll box, 'inline' defers to its container. */
  variant?: 'modal' | 'inline';
  /** data-testid prefix so each surface is addressable in tests. */
  testIdPrefix?: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; scenes: ImportCandidateScene[] };

export function ImportTrackBrowser({
  host,
  mode = 'track',
  onImported,
  onPick,
  onPortTrack,
  onCommit,
  title,
  headerRight,
  variant = 'modal',
  testIdPrefix = 'import-track',
}: ImportTrackBrowserProps): React.ReactElement {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [importingTrackId, setImportingTrackId] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!host.listImportableTracks) {
      setLoad({ status: 'error', message: 'This host does not support importing tracks.' });
      return;
    }
    setLoad({ status: 'loading' });
    try {
      // Track mode with a port handler also wants the "this scene — other
      // panels" group (cross-panel re-sound source); plain/sound flows don't.
      const wantsPort = mode === 'track' && !!onPortTrack;
      const scenes = await host.listImportableTracks(wantsPort ? { includeSameScene: true } : undefined);
      setLoad({ status: 'ready', scenes });
      // Default to the same-scene group when present so the user lands on
      // cross-panel tracks (they can ← back to pick another scene).
      const sameScene = scenes.find((s) => s.sameScene);
      if (sameScene) setSelectedSceneId(sameScene.sceneId);
    } catch (err: unknown) {
      setLoad({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load scenes.' });
    }
  }, [host, mode, onPortTrack]);

  // Fetch candidates on mount. The modal unmounts the browser while closed and
  // the drawer unmounts it when you leave the Import tab, so each visit is one
  // fetch — the same count the old "click the button to open" flow paid.
  useEffect(() => {
    setSelectedSceneId(null);
    setImportingTrackId(null);
    void refresh();
  }, [refresh]);

  const handleImport = useCallback(
    async (
      track: ImportCandidateTrack,
      sourceSceneId: string,
      sceneName: string,
      isSameScene: boolean,
    ): Promise<void> => {
      // Same-scene, other-panel pick: re-sound the part on THIS panel's
      // instrument. The panel creates a track, copies the MIDI, and loads its
      // own sound (see onPortTrack) — never a faithful copy / importTrack.
      if (isSameScene && onPortTrack) {
        if (!track.importable) return;
        setImportingTrackId(track.trackId);
        try {
          await onPortTrack({ sourceTrackDbId: track.dbId, trackName: track.name, role: track.role });
          onCommit?.();
        } catch (err: unknown) {
          host.showToast?.('error', err instanceof Error ? err.message : 'Import failed');
        } finally {
          setImportingTrackId(null);
        }
        return;
      }
      // Sound mode: ignore the gate and hand the pick back to the caller, which
      // reads the source sound via host.getTrackSound and applies it itself.
      if (mode === 'sound') {
        setImportingTrackId(track.trackId);
        try {
          await onPick?.({ sourceTrackDbId: track.dbId, trackName: track.name, sceneName });
          onCommit?.();
        } catch (err: unknown) {
          host.showToast?.('error', err instanceof Error ? err.message : 'Import failed');
        } finally {
          setImportingTrackId(null);
        }
        return;
      }
      if (!track.importable || !host.importTrack) return;
      setImportingTrackId(track.trackId);
      try {
        const handle = await host.importTrack({ sourceSceneId, sourceTrackId: track.trackId });
        onImported?.(handle);
        onCommit?.();
      } catch (err: unknown) {
        host.showToast?.('error', err instanceof Error ? err.message : 'Import failed');
      } finally {
        setImportingTrackId(null);
      }
    },
    [host, onImported, onCommit, mode, onPick, onPortTrack],
  );

  const scenes = load.status === 'ready' ? load.scenes : [];
  const selectedScene = scenes.find((s) => s.sceneId === selectedSceneId) ?? null;
  const inline = variant === 'inline';
  // Inline has no standing title — the tab strip names the surface — so its
  // header row exists only to carry the ← out of a scene.
  const showHeader = !!title || !!headerRight || !!selectedScene;

  return (
    <>
      {showHeader && (
        <div
          className={
            inline
              ? 'flex items-center justify-between pb-1 border-b border-sas-border'
              : 'flex items-center justify-between px-3 py-2 border-b border-sas-border'
          }
        >
          <div className="flex items-center gap-2 min-w-0">
            {selectedScene && (
              <button
                className="text-sas-muted hover:text-sas-accent text-xs"
                onClick={() => setSelectedSceneId(null)}
                data-testid={`${testIdPrefix}-back`}
              >
                ←
              </button>
            )}
            <span
              className={`font-medium text-sas-text truncate ${inline ? 'text-xs' : 'text-sm'}`}
            >
              {selectedScene ? selectedScene.sceneName : title}
            </span>
          </div>
          {headerRight}
        </div>
      )}

      <div className={inline ? 'pt-1' : 'overflow-y-auto p-2 flex-1'}>
        {load.status === 'loading' && (
          <div
            className={`text-center text-xs text-sas-muted ${inline ? 'py-4' : 'py-8'}`}
            data-testid={`${testIdPrefix}-loading`}
          >
            Loading scenes…
          </div>
        )}

        {load.status === 'error' && (
          <div
            className={`text-center text-xs text-red-400 ${inline ? 'py-4' : 'py-8'}`}
            data-testid={`${testIdPrefix}-error`}
          >
            {load.message}
          </div>
        )}

        {load.status === 'ready' && scenes.length === 0 && (
          <div
            className={`text-center text-xs text-sas-muted ${inline ? 'py-4' : 'py-8'}`}
            data-testid={`${testIdPrefix}-empty`}
          >
            {mode === 'sound'
              ? 'No other scenes have a sound to import.'
              : 'No other scenes have a compatible track to import.'}
          </div>
        )}

        {/* Scene list */}
        {load.status === 'ready' && scenes.length > 0 && !selectedScene && (
          <ul className="flex flex-col gap-1" data-testid={`${testIdPrefix}-scene-list`}>
            {scenes.map((scene: ImportCandidateScene) => (
              <li key={scene.sceneId}>
                <button
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-sm border border-sas-border bg-sas-panel-alt text-left text-xs text-sas-text hover:border-sas-accent hover:text-sas-accent transition-colors"
                  onClick={() => setSelectedSceneId(scene.sceneId)}
                  data-testid={`${testIdPrefix}-scene`}
                >
                  <span className="truncate">{scene.sceneName}</span>
                  <span className="text-sas-muted">{scene.tracks.length} →</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Track list */}
        {selectedScene && (
          <ul className="flex flex-col gap-1" data-testid={`${testIdPrefix}-track-list`}>
            {selectedScene.tracks.map((track: ImportCandidateTrack) => {
              const busy = importingTrackId === track.trackId;
              // Sound mode ignores the contract gate — every candidate is a
              // valid sound source. Track mode honors `importable`.
              const gated = mode === 'track' && !track.importable;
              const disabled = gated || busy;
              return (
                <li key={track.dbId}>
                  <button
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-sm border text-left text-xs transition-colors ${
                      disabled
                        ? 'bg-sas-panel border-sas-border text-sas-muted/50 cursor-not-allowed'
                        : 'bg-sas-panel-alt border-sas-border text-sas-text hover:border-sas-accent hover:text-sas-accent'
                    }`}
                    disabled={disabled}
                    title={gated ? track.disabledReason : undefined}
                    onClick={() => void handleImport(track, selectedScene.sceneId, selectedScene.sceneName, !!selectedScene.sameScene)}
                    data-testid={`${testIdPrefix}-track`}
                    data-importable={mode === 'sound' || track.importable ? 'true' : 'false'}
                  >
                    <span className="truncate">
                      {track.name}
                      {track.role ? <span className="text-sas-muted"> · {track.role}</span> : null}
                    </span>
                    {busy ? (
                      <span className="text-sas-muted">…</span>
                    ) : gated ? (
                      <span className="text-sas-muted">⊘</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
