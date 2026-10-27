/**
 * An in-memory song-lyrics host (SDK 3.24.0) for plugin tests and as the
 * reference behaviour of the four `PluginHost` song-lyrics methods. It runs the
 * same pure rules a real host runs (`applySongLyricsPatch`,
 * `applySongDescription`) plus the ownership check only a host can make.
 */

import { PluginError } from '../types/plugin-sdk.types';
import type {
  ArrangementOutline,
  PluginHost,
  SongLyrics,
  SongLyricsChange,
  SongLyricsSectionPatch,
} from '../types/plugin-sdk.types';
import { applySongDescription, applySongLyricsPatch, type SongLyricsWriteResult } from './song-lyrics';

export interface SongLyricsTestHostOptions {
  /** The calling plugin's id (`change.byPluginId` of its writes). Default `'test-plugin'`. */
  pluginId?: string;
  /** The bound arrangement; `null` = none. Default `'arr-1'`. */
  arrangementId?: string | null;
  /** Its outline (placements). Default: no sections. */
  outline?: ArrangementOutline | null;
  /** Track DB ids this plugin owns. */
  ownedTrackDbIds?: readonly string[];
  /** Existing tracks of OTHER plugins: track DB id → plugin id. */
  otherTrackOwners?: Readonly<Record<string, string>>;
  /** A document already there. */
  doc?: SongLyrics | null;
  /** The clock. Default `Date.now`. */
  now?: () => number;
}

type SongLyricsHostMethods =
  | 'getArrangementOutline'
  | 'getSongLyrics'
  | 'setSectionLyrics'
  | 'setSongDescription'
  | 'onSongLyricsChanged';

export interface SongLyricsTestHost {
  /** Spread into a mock `PluginHost`. */
  host: Required<Pick<PluginHost, SongLyricsHostMethods>>;
  /** The current document (a copy). */
  document(): SongLyrics | null;
  /** Every `onSongLyricsChanged` delivery so far. */
  events: Array<{ doc: SongLyrics | null; change?: SongLyricsChange }>;
  /** Replace the outline (an arrangement edit; `null` = no arrangement). Doesn't emit. */
  setOutline(outline: ArrangementOutline | null, arrangementId?: string): void;
  /** A host-side writer (the Lyrics tab, the agent): no ownership check, no `byPluginId`. Throws like the plugin path. */
  hostWrite(instanceId: string, patch: SongLyricsSectionPatch): void;
  /** Unbind the project: the document becomes null and listeners hear `null`. */
  unbind(): void;
}

const copy = <T>(v: T): T => (v === null || v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

export function createSongLyricsTestHost(options: SongLyricsTestHostOptions = {}): SongLyricsTestHost {
  const pluginId = options.pluginId ?? 'test-plugin';
  let arrangementId = options.arrangementId === undefined ? 'arr-1' : options.arrangementId;
  let outline: ArrangementOutline | null = copy(options.outline ?? (arrangementId ? { sections: [] } : null));
  let doc: SongLyrics | null = copy(options.doc ?? null);
  const owned = new Set(options.ownedTrackDbIds ?? []);
  const others = { ...(options.otherTrackOwners ?? {}) };
  const now = options.now ?? Date.now;
  const listeners = new Set<(d: SongLyrics | null, c?: SongLyricsChange) => void>();
  const events: SongLyricsTestHost['events'] = [];

  const emit = (change?: SongLyricsChange) => {
    events.push({ doc: copy(doc), change: copy(change) });
    for (const l of [...listeners]) l(copy(doc), copy(change));
  };

  const commit = (result: SongLyricsWriteResult, byPluginId?: string) => {
    if (!result.ok) {
      throw new PluginError(result.reason === 'not-owned' ? 'NOT_OWNED' : 'VALIDATION_ERROR', result.detail, {
        reason: result.reason,
      });
    }
    if (!result.changed) return;
    doc = result.doc;
    emit(byPluginId ? { ...result.change, byPluginId } : result.change);
  };

  const ctx = () => ({ arrangementId, placements: outline?.sections ?? [], now: now() });

  const notOwned = (detail: string): SongLyricsWriteResult => ({ ok: false, reason: 'not-owned', detail });

  return {
    host: {
      getArrangementOutline: async () => copy(outline),
      getSongLyrics: async () => copy(doc),
      setSectionLyrics: async (instanceId, patch) => {
        const current = doc?.sections[instanceId]?.voiceTrackDbId;
        if (current && others[current] && others[current] !== pluginId) {
          return commit(notOwned(`Section "${instanceId}" is sung by another plugin's track`));
        }
        if (typeof patch?.voiceTrackDbId === 'string' && !owned.has(patch.voiceTrackDbId)) {
          return commit(notOwned(`Track "${patch.voiceTrackDbId}" is not owned by this plugin`));
        }
        commit(applySongLyricsPatch(doc, ctx(), instanceId, patch), pluginId);
      },
      setSongDescription: async (description) => {
        commit(applySongDescription(doc, ctx(), description), pluginId);
      },
      onSongLyricsChanged: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    document: () => copy(doc),
    events,
    setOutline: (o, id) => {
      outline = copy(o);
      arrangementId = o ? (id ?? arrangementId ?? 'arr-1') : null;
    },
    hostWrite: (instanceId, patch) => commit(applySongLyricsPatch(doc, ctx(), instanceId, patch)),
    unbind: () => {
      arrangementId = null;
      outline = null;
      doc = null;
      emit();
    },
  };
}
