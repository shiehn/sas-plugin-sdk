/**
 * GeneratorPanelAdapter — the family-specific contract a generator panel
 * supplies to the shared panel-core (useGeneratorPanelCore + GeneratorPanelShell).
 *
 * The core owns everything the three historical panel monoliths duplicated:
 * track load/reconcile, event subscriptions, prompt persistence, mixer/FX ops,
 * drawer + piano-roll wiring, shuffle cycling, transition crossfade/fade
 * machinery, and the render skeleton. The adapter supplies what genuinely
 * differs per family: sound serialization, the 🎲 resolver, the generation
 * pipeline body, create-track options, prompts/parsers, identity strings,
 * feature flags, and (optionally) custom multi-track group rendering.
 *
 * Adapter instances MUST be referentially stable across renders — build them
 * in a `useMemo(() => createXAdapter(host), [host])`. An unstable adapter
 * re-creates the core's loadTracks callback every render (the historical
 * useSoundHistory render-loop failure mode).
 *
 * @since SDK 2.35.0
 */

import type { ReactNode } from 'react';
import type {
  PluginHost,
  PluginTrackHandle,
  PluginMidiNote,
  CreateTrackOptions,
  TrackSoundSnapshot,
  SceneFamilyTrack,
} from '../types/plugin-sdk.types';
import type { UseSoundHistoryResult } from '../hooks/useSoundHistory';
import type { TrackRowDragProps } from '../hooks/useTrackReorder';
import type { TrackLevelsHandle } from '../hooks/useTrackLevels';
import type { SDKTrackRowProps } from '../components/TrackRow';
import type { DrawerTab } from '../components/TrackDrawer';
import type { GeneratorTrackState } from './track-state';
import type { GroupParseSpec, ResolvedTrackGroup, TrackGroupMeta } from './group-meta';
import type { LLMNoteResponse } from './panel-helpers';

// ============================================================================
// Identity + features
// ============================================================================

/**
 * Family identity strings + numeric knobs. All panel test-ids derive from
 * `familyKey` (`add-<key>-track-button`, `<key>-section`, `<key>-view-toggle`,
 * `no-scene-placeholder-<key>`, `no-contract-placeholder-<key>`,
 * `<key>-import`, `<key>-sound-import`, `<key>-transition-designer`) — the
 * synth panel's historical ids are exactly this derivation with key 'synth'.
 */
export interface PanelIdentity {
  /** Test-id + focus-selector stem, e.g. 'synth'. */
  familyKey: string;
  /** Human label for the TransitionDesigner header, e.g. 'Synths'. */
  familyLabel: string;
  /** New-track name prefix, e.g. 'synth' → `synth-<ts>`. */
  trackNamePrefix: string;
  /** Console log tag, e.g. 'SynthGeneratorPanel'. */
  logTag: string;
  /** Normal row accent, e.g. '#A78BFA'. */
  accentColor: string;
  /** Crossfade/fade row accent, e.g. '#9333EA'. */
  transitionAccentColor: string;
  /** Bulk placeholder left-border accent, e.g. '#3B82F6'. */
  placeholderAccentColor: string;
  /** Per-plugin per-scene track budget (host enforces 16 too). */
  maxTracks: number;
  /** Progress-bar pacing for one generation. */
  estimatedGenerationMs: number;
  /** Header button label; default 'Add Track'. */
  addTrackLabel?: string;
  /** Header button label; default 'Import Track'. */
  importTrackLabel?: string;
  /** Export dialog default filename; default 'midi-tracks'. */
  exportDefaultName?: string;
  /**
   * Plugin id treated as the family's built-in default instrument in the Pick
   * tab (select it ⇒ close drawer instead of entering the editor stage).
   * Default 'Surge XT'.
   */
  defaultInstrumentPluginId?: string;
}

/** Which core surfaces this family mounts. */
export interface PanelFeatureFlags {
  /** Pick tab + instrument descriptors + editor stage (synth: true). */
  instrumentPicker: boolean;
  /** COMPOSING bar + bulk placeholder hybrid phase (synth: true). */
  bulkComposePlaceholders: boolean;
  /** "Export Tracks" ZIP button (synth: true). */
  exportMidi: boolean;
  /** Transition scene designer + crossfade/fade rows (synth: true). */
  transitionDesigner: boolean;
  /** ImportTrackModal + port-track flow + sound-import drawer action (synth: true). */
  importTracks: boolean;
}

// ============================================================================
// Sound + shuffle adapters
// ============================================================================

/** How this family captures / applies / copies a track's SOUND. */
export interface PanelSoundAdapter {
  /**
   * Re-apply an opaque sound-history descriptor (useSoundHistory's applySound).
   * Synth: `{state, stateType}` through set(Raw)PluginState's dual path.
   */
  applySound(trackId: string, descriptor: unknown): Promise<void>;
  /**
   * Snapshot the track's current sound as a history descriptor, or null when
   * the track has no instrument. The CORE records it into soundHistory.
   */
  captureSoundDescriptor(trackId: string): Promise<{ descriptor: unknown } | null>;
  /**
   * Apply a host.getTrackSound snapshot to a track AND persist it as the
   * track's durable identity (persistTrackPresetState or family equivalent —
   * REQUIRED or the transition drift-resync never converges). Returns the
   * applied label. Used by crossfade/fade copy + drift-resync.
   */
  copySnapshot(trackId: string, snap: TrackSoundSnapshot): Promise<string>;
  /**
   * Convert a host.getTrackSound snapshot into this family's sound-history
   * descriptor (synth: `{state, stateType}`). Used by the drawer's sound
   * import so the imported sound lands in history with the right shape.
   */
  descriptorFromSnapshot(snap: TrackSoundSnapshot): unknown;
  /** Snapshot kind accepted by the drawer's "Import <noun>" (synth: 'preset'). */
  acceptedSnapshotKind: 'preset' | 'sample' | 'instrument';
  /** Sound-history cap (synth: 12 — Surge blobs are large). */
  historyMax: number;
  /** Drawer action label, e.g. 'Import Preset'. */
  importSoundLabel: string;
  /** Noun for import toasts: 'No <noun> to import' / '<Noun> imported'. */
  importNoun: string;
  /** History label for the lazily-seeded pre-shuffle sound, e.g. 'Previous preset'. */
  previousSoundLabel: string;
}

/** The 🎲: pick + apply one new sound, honoring the exclusion cycle. */
export interface PanelShuffleAdapter {
  /**
   * Pick + apply a sound not in `excludeNames`. Throw when the pool is
   * exhausted (`isExhaustedError` must recognize it) — the core wipes the
   * track's history and retries once with an empty exclusion list.
   */
  shuffle(track: GeneratorTrackState, excludeNames: string[]): Promise<{ appliedName: string }>;
  /** Distinguish "pool exhausted" (expected; cycle resets) from real failures. */
  isExhaustedError(err: unknown): boolean;
}

// ============================================================================
// Generation strategy
// ============================================================================

/**
 * Capabilities the core hands to the generation strategy (and group
 * renderers). Built fresh per call — do not cache across renders.
 */
export interface GenerationServices {
  host: PluginHost;
  activeSceneId: string | null;
  /** Live track list snapshot at call time. */
  tracks: GeneratorTrackState[];
  /** Patch one track's state (object merge or functional update). */
  updateTrack(
    trackId: string,
    patch: Partial<GeneratorTrackState> | ((t: GeneratorTrackState) => GeneratorTrackState),
  ): void;
  /** Escape hatch for multi-track updates (reconcile flows). */
  setTracks: React.Dispatch<React.SetStateAction<GeneratorTrackState[]>>;
  reloadTracks(incremental?: boolean): Promise<void>;
  soundHistory: UseSoundHistoryResult;
  /** Engine id → stable DB UUID (falls back to the input when unknown). */
  engineToDbId(trackId: string): string;
  /** The ONLY scene-data key builder (always dbId-based). */
  trackDataKey(dbId: string, suffix: string): string;
  /** Latch a track as piano-roll-loaded (post-generation seeding). */
  markEditLoaded(trackId: string): void;
  /** Create a family track (adapter options + `<prefix>-<ts><suffix>` name). */
  createFamilyTrack(nameSuffix?: string): Promise<PluginTrackHandle>;
  /** Resolved groups for a registered group extension. */
  resolvedGroups<M>(metaKey: string): ResolvedTrackGroup<M, GeneratorTrackState>[];
}

/**
 * One prompt-driven generation turn. The core owns the wrapper: prompt/auth
 * gates, `isGenerating: true`, and the catch (error patch + 'Generation
 * failed' toast). The strategy owns the body — synth: LLM → clip on THIS
 * track → mute → role persist → shufflePreset → success patch; bass: LLM line
 * → validate/split → reconcile member tracks → per-voice clips + presets →
 * metas → reload.
 */
export interface PanelGenerationStrategy {
  generate(track: GeneratorTrackState, services: GenerationServices): Promise<void>;
}

// ============================================================================
// Group extensions (generic multi-track rows)
// ============================================================================

/** Core per-track handlers, same instances the normal rows use. */
export interface CoreTrackHandlers {
  promptChange(trackId: string, prompt: string): void;
  generate(trackId: string): void;
  shuffle(trackId: string): void;
  copy(trackId: string): void;
  delete(trackId: string): void;
  muteToggle(trackId: string): void;
  soloToggle(trackId: string): void;
  volumeChange(trackId: string, volume: number): void;
  panChange(trackId: string, pan: number): void;
  tabChange(trackId: string, tab: DrawerTab): void;
  toggleDrawer(trackId: string): void;
  toggleFxDrawer(trackId: string): void;
  notesChange(trackId: string, notes: PluginMidiNote[]): void;
  progressChange(trackId: string, pct: number): void;
}

/** Render-time context handed to a group extension's renderGroup. */
export interface GroupRenderContext {
  services: GenerationServices;
  anySolo: boolean;
  supportsMeters: boolean;
  levels?: TrackLevelsHandle;
  handlers: CoreTrackHandlers;
  /**
   * Build the shell's default TrackRow for a member with per-row overrides —
   * group renderers stack these instead of reimplementing the ~50-prop plumbing.
   */
  renderDefaultTrackRow(
    track: GeneratorTrackState,
    overrides?: Partial<SDKTrackRowProps>,
    drag?: TrackRowDragProps,
  ): ReactNode;
  /** Optimistic group mute (crossfade group-control pattern). */
  setGroupMute(trackIds: string[], muted: boolean): void;
  /** Optimistic group solo. */
  setGroupSolo(trackIds: string[], solo: boolean): void;
  /**
   * Delete all member tracks + their `track:<dbId>:<suffix>` scene-data keys
   * (per cleanupKeySuffixes) + prune local state. Best-effort per member.
   */
  deleteGroup(
    members: Array<{ engineId: string; dbId: string }>,
    cleanupKeySuffixes: string[],
  ): Promise<void>;
}

/**
 * A family-registered multi-track group row (the crossfade seam,
 * parameterized). Members of complete groups render through `renderGroup`
 * and are excluded from the normal row list; incomplete groups degrade to
 * normal rows per `isComplete`.
 */
export interface PanelGroupExtension<M = unknown> extends GroupParseSpec<M> {
  /**
   * Completeness policy (default: every parsed member's track is live).
   * Bass voice-groups: the anchor member (voiceIndex 0) must be live.
   */
  isComplete?(
    group: ResolvedTrackGroup<M, GeneratorTrackState>,
    parsed: TrackGroupMeta<M>,
  ): boolean;
  renderGroup(
    group: ResolvedTrackGroup<M, GeneratorTrackState>,
    ctx: GroupRenderContext,
  ): ReactNode;
}

// ============================================================================
// Transition group adapter (verbatim group fades)
// ============================================================================

/**
 * One member of a verbatim group fade — a SOURCE track (from/to scene) whose
 * MIDI + sound + FX are copied byte-exact into the transition scene.
 * @since SDK 2.41.0
 */
export interface VerbatimFadeMember {
  /** Source track DB row id. */
  dbId: string;
  /** Source track display name (per-member fade caption). */
  name: string;
  role?: string;
  /** Stable order within the group (bass: voiceIndex; anchor = 0). */
  memberIndex: number;
  /** Short per-member label, e.g. the bass partition ('low', 'offbeats'). */
  memberLabel?: string;
  /** Opaque family meta round-tripped into `writeGroupMetas` (bass: BassVoiceMeta). */
  familyMeta?: unknown;
}

/**
 * Group-shaped transition behavior for families whose "track" is a VOICE
 * GROUP of N tracks (bass basslines). Registering this switches the panel's
 * Transition Designer to FADE-ONLY (`fadeOnly: true` is the only supported
 * mode — a 1:1 MIDI crossfade is undefined between groups of different voice
 * counts) with one board cell per GROUP, and `onCreateFade` routes to the
 * core's `handleCreateVerbatimGroupFade`: every member is copied VERBATIM
 * (MIDI clamped to the transition span + exact sound + FX chain — NO LLM) and
 * the whole group fades together under one slider. @since SDK 2.41.0
 */
export interface PanelTransitionGroupAdapter {
  /** v1: group families are fade-only; crossfade rows never render. */
  fadeOnly: true;
  /**
   * Collapse a scene's family tracks into designer SUBJECTS: one entry per
   * group (carrying the ANCHOR's dbId so exclude/row keys work unchanged)
   * plus loose tracks passed through. Called per column after
   * `listSceneFamilyTracks`.
   */
  mapColumnSubjects(sceneId: string, tracks: SceneFamilyTrack[]): Promise<SceneFamilyTrack[]>;
  /**
   * Expand a subject (anchor dbId) back into its ordered members. A loose
   * track returns a single member with memberIndex 0.
   */
  expandSubject(sceneId: string, subjectDbId: string): Promise<VerbatimFadeMember[]>;
  /**
   * Persist the family's own group metas for the COPIED tracks in the
   * transition scene (bass: `track:<newDbId>:bassVoice` rows sharing
   * groupId = newAnchorDbId) so the Tracks view renders them as a proper
   * family group.
   */
  writeGroupMetas(
    transitionSceneId: string,
    copies: Array<{ newDbId: string; member: VerbatimFadeMember }>,
    newAnchorDbId: string,
  ): Promise<void>;
  /** Scene-data key suffixes to delete per member on rollback/delete (bass: ['bassVoice']). */
  cleanupKeySuffixes: string[];
  /**
   * Default fade midpoint per direction. Bass staggers them (out→0.35,
   * in→0.65) so the outgoing and incoming groups avoid low-end overlap.
   * Default 0.5.
   */
  defaultSliderPos?(direction: 'in' | 'out'): number;
  /** Progress-bar pacing for one group fade (LLM-free; default the designer's fade estimate). */
  fadeEstimateMs?: number;
  /** Group-fade row header label, e.g. `Bassline (3 voices)`. Default `Group (N tracks)`. */
  groupRowLabel?(memberCount: number): string;
}

// ============================================================================
// The adapter
// ============================================================================

export interface GeneratorPanelAdapter<M = unknown> {
  identity: PanelIdentity;
  features: PanelFeatureFlags;
  /** Options for host.createTrack (name is core-built). Synth: `{loadSynth:true, synthName:'Surge XT'}`. */
  createTrackOptions(): Omit<CreateTrackOptions, 'name'>;
  /**
   * Port-flow sound step after the MIDI copy (cross-panel Import Track).
   * Synth: `host.shufflePreset(handle.id)` non-fatal.
   */
  applyPortedTrackSound(handle: PluginTrackHandle, role?: string): Promise<void>;
  /** System prompt for the family's LLM calls (incl. core-owned crossfade/fade generation). */
  buildSystemPrompt(validRoles: readonly string[]): string;
  /** Parse the family's LLM note responses (crossfade/fade flows). */
  parseNotesResponse(content: string): LLMNoteResponse | null;
  sound: PanelSoundAdapter;
  shuffle: PanelShuffleAdapter;
  generation: PanelGenerationStrategy;
  /** Custom multi-track group rows (bass voice groups). */
  groupExtensions?: PanelGroupExtension<M>[];
  /**
   * Group-shaped transition behavior (fade-only designer + verbatim group
   * fades). Registering this is what lights up `features.transitionDesigner`
   * for group families. @since SDK 2.41.0
   */
  transitionGroup?: PanelTransitionGroupAdapter;
  /** Patch the default TrackRow props per row (drum's sampleName fallback). */
  mapTrackRowProps?(track: GeneratorTrackState, props: SDKTrackRowProps): SDKTrackRowProps;
}

/** Panel-local render extension points around the shell's row list. */
export interface GeneratorPanelSlots {
  beforeRows?: ReactNode;
  afterRows?: ReactNode;
  /** Extra modals (rendered in the normal phase only). */
  modals?: ReactNode;
}
