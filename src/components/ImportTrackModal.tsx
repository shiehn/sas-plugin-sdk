/**
 * ImportTrackModal — "import a track from another scene" picker (SDK component).
 *
 * Shared by all five generator panels (drums / instruments / synths / loops /
 * stems). Thin now: the modal owns visibility and chrome (backdrop, title, ✕)
 * and delegates the whole two-step scene → track drill-down, its fetching and
 * its import/pick handling to `ImportTrackBrowser`, which the TrackDrawer's
 * Import tab also renders inline. Props and every `${testIdPrefix}-*` test id
 * are unchanged.
 *
 * Closed = unmounted, so each open refetches candidates.
 *
 * @since SDK 2.13.0 (body extracted to ImportTrackBrowser in SDK 3.1.0)
 */

import React from 'react';
import { Modal } from './Modal';
import { ImportTrackBrowser } from './ImportTrackBrowser';
import type { PluginHost, PluginTrackHandle } from '../types/plugin-sdk.types';

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
  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} testIdPrefix={testIdPrefix}>
      <div
        className="w-[420px] max-h-[70vh] overflow-hidden flex flex-col rounded-md border border-sas-border bg-sas-panel shadow-xl"
        onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
        data-testid={`${testIdPrefix}-modal`}
      >
        <ImportTrackBrowser
          host={host}
          mode={mode}
          onImported={onImported}
          onPick={onPick}
          onPortTrack={onPortTrack}
          onCommit={onClose}
          title={title}
          variant="modal"
          testIdPrefix={testIdPrefix}
          headerRight={
            <button
              className="text-sas-muted hover:text-sas-accent text-sm"
              onClick={onClose}
              data-testid={`${testIdPrefix}-close`}
            >
              ✕
            </button>
          }
        />
      </div>
    </Modal>
  );
}
