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
  /** Optional modal title (default "Import from scene"). */
  title?: string;
  /** data-testid prefix so each panel's modal is addressable in tests. */
  testIdPrefix?: string;
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
  title = 'Import from scene',
  testIdPrefix = 'import-track',
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
      const scenes = await host.listImportableTracks();
      setLoad({ status: 'ready', scenes });
    } catch (err: unknown) {
      setLoad({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load scenes.' });
    }
  }, [host]);

  // Fetch candidates each time the modal opens; reset selection on close.
  useEffect(() => {
    if (open) {
      setSelectedSceneId(null);
      setImportingTrackId(null);
      void refresh();
    }
  }, [open, refresh]);

  // Escape closes.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleImport = useCallback(
    async (track: ImportCandidateTrack, sourceSceneId: string): Promise<void> => {
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
    [host, onImported, onClose],
  );

  if (!open) return null;

  const scenes = load.status === 'ready' ? load.scenes : [];
  const selectedScene = scenes.find((s) => s.sceneId === selectedSceneId) ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      data-testid={`${testIdPrefix}-overlay`}
      onClick={onClose}
    >
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
              No other scenes have a compatible track to import.
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
                const disabled = !track.importable || busy;
                return (
                  <li key={track.dbId}>
                    <button
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-sm border text-left text-xs transition-colors ${
                        disabled
                          ? 'bg-sas-panel border-sas-border text-sas-muted/50 cursor-not-allowed'
                          : 'bg-sas-panel-alt border-sas-border text-sas-text hover:border-sas-accent hover:text-sas-accent'
                      }`}
                      disabled={disabled}
                      title={track.importable ? undefined : track.disabledReason}
                      onClick={() => void handleImport(track, selectedScene.sceneId)}
                      data-testid={`${testIdPrefix}-track`}
                      data-importable={track.importable ? 'true' : 'false'}
                    >
                      <span className="truncate">
                        {track.name}
                        {track.role ? <span className="text-sas-muted"> · {track.role}</span> : null}
                      </span>
                      {busy ? (
                        <span className="text-sas-muted">…</span>
                      ) : !track.importable ? (
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
    </div>
  );
}
