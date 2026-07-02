/**
 * Per-track state model shared by every generator panel built on the
 * panel-core. Verbatim generalization of the synth panel's SynthTrackState
 * (SynthGeneratorPanel.tsx:67–100) — field names, defaults, and semantics are
 * frozen by the Phase-0 behavior pin.
 *
 * @since SDK 2.35.0
 */

import type {
  PluginTrackHandle,
  PluginTrackRuntimeState,
  PluginMidiNote,
} from '../types/plugin-sdk.types';
import { EMPTY_FX_DETAIL_STATE, type TrackFxDetailState } from '../types/fx-toggle.types';
import type { DrawerTab } from '../components/TrackDrawer';

/** Internal track state combining handle + runtime state + prompt. */
export interface GeneratorTrackState {
  handle: PluginTrackHandle;
  prompt: string;
  role: string;
  runtimeState: PluginTrackRuntimeState;
  fxDetailState: TrackFxDetailState;
  // Unified drawer state (fx / pick / edit / history tabs).
  drawerOpen: boolean;
  drawerTab: DrawerTab;
  editorStage: boolean;
  isGenerating: boolean;
  error: string | null;
  hasMidi: boolean;
  generationProgress: number;
  // Piano-roll edit state. `editNotes` is the live, editable copy of the
  // track's MIDI (loaded lazily when the Edit tab is first opened, or seeded
  // from a fresh generation). `editBars`/`editBpm` size the grid + the save
  // span.
  editNotes: PluginMidiNote[];
  editBars: number;
  editBpm: number;
  instrumentPluginId: string | null;
  instrumentName: string | null;
  instrumentMissing: boolean;
  /**
   * Per-track shuffle history: sound/preset names already handed back since
   * the track was created OR since the history was reset (which happens
   * automatically when the pool is exhausted — the family shuffle adapter
   * reports "exhausted" and the core wipes the history and retries). Cycle
   * pattern: cycle through everything before any repeat.
   */
  shuffleHistory: Set<string>;
}

/**
 * Fresh track state with the panel defaults (the add-track literal at
 * SynthGeneratorPanel.tsx:634–654). `overrides` lets loadTracks hydrate
 * prompt/role/runtime/fx/etc. from fetched state in one construction.
 */
export function newTrackState(
  handle: PluginTrackHandle,
  overrides: Partial<Omit<GeneratorTrackState, 'handle'>> = {},
): GeneratorTrackState {
  return {
    handle,
    prompt: '',
    role: '',
    runtimeState: { id: handle.id, muted: false, solo: false, volume: 0.75, pan: 0 },
    fxDetailState: { ...EMPTY_FX_DETAIL_STATE },
    drawerOpen: false,
    drawerTab: 'fx',
    editorStage: false,
    isGenerating: false,
    error: null,
    hasMidi: false,
    generationProgress: 0,
    editNotes: [],
    editBars: 4,
    editBpm: 120,
    instrumentPluginId: handle.instrumentPluginId ?? null,
    instrumentName: handle.instrumentName ?? null,
    instrumentMissing: false,
    shuffleHistory: new Set<string>(),
    ...overrides,
  };
}
