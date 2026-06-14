/**
 * ImportTrackModal — "import a track from another scene" picker (SDK component).
 *
 * Shared by all five generator panels (drums / instruments / synths / loops /
 * stems). Self-fetching: given the scoped `host`, it calls
 * `host.listImportableTracks()` to enumerate candidates (already filtered to
 * the calling panel's type and gate-annotated by the host) and
 * `host.importTrack()` to perform the copy. The UI only renders `importable` +
 * `disabledReason` — it never computes the harmonic/length/tempo gate itself.
 *
 * Two-step picker: choose a source scene, then a track in it. Incompatible
 * tracks render disabled with a reason tooltip (never hidden), per product
 * decision.
 *
 * @since SDK 2.13.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Modal } from './Modal';
import type {
  PluginHost,
  ImportCandidateScene,
  ImportCandidateTrack,
  PluginTrackHandle,
} from '../types/plugin-sdk.types';

export interface ImportTrackModalProps {
  /** Scoped host — the modal calls listImportableTracks / importTrack itself. */
  host: PluginHost;
  /** Controls visibility (the panel owns open/closed from its header button). */
  open: boolean;
  /** Close handler (Escape, backdrop, Cancel, or after a successful import). */
  onClose: () => void;
  /** Fired after a successful import with the new track handle. */
  onImported: (handle: PluginTrackHandle) => void;
  /** Optional modal title (default names the whole-track import). */
  title?: string;
  /** data-testid prefix so each panel's modal is addressable in tests. */
  testIdPrefix?: string;
  /**
   * 'track' (default) imports a whole track via `importTrack`. 'sound' copies
   * ONLY the sound onto an existing track: every candidate is selectable (the
   * contract gate is ignored) and the chosen track is handed back via `onPick`
   * instead of being imported — the panel applies it via `host.getTrackSound`.
   */
  mode?: 'track' | 'sound';
  /** Sound-mode pick handler — required when `mode='sound'`. */
  onPick?: (sel: { sourceTrackDbId: string; trackName: string; sceneName: string }) => void | Promise<void>;
  /**
   * Cross-panel port handler (track mode). When provided, the modal also lists
   * the ACTIVE scene's tracks owned by OTHER panels as a `sameScene` group —
   * shown first and selected by default — and routes a pick there to this
   * callback instead of `importTrack`. The panel re-sounds the part on its own
   * instrument (create track → copy MIDI → load native sound). @since SDK 2.20.0
   */
  onPortTrack?: (sel: { sourceTrackDbId: string; trackName: string; role?: string }) => void | Promise<void>;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; scenes: ImportCandidateScene[] };

export function ImportTrackModal({
  host,
  open,
  onClose,
  onImported,
  title = 'Import track from scene (must match contract)',
  testIdPrefix = 'import-track',
  mode = 'track',
  onPick,
  onPortTrack,
}: ImportTrackModalProps): React.ReactElement | null {
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

  // Fetch candidates each time the modal opens; reset selection on close.
  useEffect(() => {
    if (open) {
      setSelectedSceneId(null);
      setImportingTrackId(null);
      void refresh();
    }
  }, [open, refresh]);

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
          onClose();
        } catch (err: unknown) {
          host.showToast?.('error', err instanceof Error ? err.message : 'Import failed');
          setImportingTrackId(null);
        }
        return;
      }
      // Sound mode: ignore the gate and hand the pick back to the panel, which
      // reads the source sound via host.getTrackSound and applies it itself.
      if (mode === 'sound') {
        setImportingTrackId(track.trackId);
        try {
          await onPick?.({ sourceTrackDbId: track.dbId, trackName: track.name, sceneName });
          onClose();
        } catch (err: unknown) {
          host.showToast?.('error', err instanceof Error ? err.message : 'Import failed');
          setImportingTrackId(null);
        }
        return;
      }
      if (!track.importable || !host.importTrack) return;
      setImportingTrackId(track.trackId);
      try {
        const handle = await host.importTrack({ sourceSceneId, sourceTrackId: track.trackId });
        onImported(handle);
        onClose();
      } catch (err: unknown) {
        host.showToast?.('error', err instanceof Error ? err.message : 'Import failed');
        setImportingTrackId(null);
      }
    },
    [host, onImported, onClose, mode, onPick, onPortTrack],
  );

  if (!open) return null;

  const scenes = load.status === 'ready' ? load.scenes : [];
  const selectedScene = scenes.find((s) => s.sceneId === selectedSceneId) ?? null;

  return (
    <Modal open={open} onClose={onClose} testIdPrefix={testIdPrefix}>
      <div
        className="w-[420px] max-h-[70vh] overflow-hidden flex flex-col rounded-md border border-sas-border bg-sas-panel shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid={`${testIdPrefix}-modal`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-sas-border">
          <div className="flex items-center gap-2">
            {selectedScene && (
              <button
                className="text-sas-muted hover:text-sas-accent text-xs"
                onClick={() => setSelectedSceneId(null)}
                data-testid={`${testIdPrefix}-back`}
              >
                ←
              </button>
            )}
            <span className="text-sm font-medium text-sas-text">
              {selectedScene ? selectedScene.sceneName : title}
            </span>
          </div>
          <button
            className="text-sas-muted hover:text-sas-accent text-sm"
            onClick={onClose}
            data-testid={`${testIdPrefix}-close`}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-2 flex-1">
          {load.status === 'loading' && (
            <div className="py-8 text-center text-xs text-sas-muted" data-testid={`${testIdPrefix}-loading`}>
              Loading scenes…
            </div>
          )}

          {load.status === 'error' && (
            <div className="py-8 text-center text-xs text-red-400" data-testid={`${testIdPrefix}-error`}>
              {load.message}
            </div>
          )}

          {load.status === 'ready' && scenes.length === 0 && (
            <div className="py-8 text-center text-xs text-sas-muted" data-testid={`${testIdPrefix}-empty`}>
              {mode === 'sound'
                ? 'No other scenes have a sound to import.'
                : 'No other scenes have a compatible track to import.'}
            </div>
          )}

          {/* Scene list */}
          {load.status === 'ready' && scenes.length > 0 && !selectedScene && (
            <ul className="flex flex-col gap-1" data-testid={`${testIdPrefix}-scene-list`}>
              {scenes.map((scene) => (
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
              {selectedScene.tracks.map((track) => {
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
      </div>
    </Modal>
  );
}
