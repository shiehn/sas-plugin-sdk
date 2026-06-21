/**
 * Plugin SDK Type Definitions
 *
 * Complete type system for the generator plugin architecture.
 * Plugins implement GeneratorPlugin and interact with the host via PluginHost.
 * All plugin output flows through TracktionEngine (MIDI or audio clips).
 */

import type { ComponentType, ReactNode } from 'react';

// ============================================================================
// Core Plugin Interface
// ============================================================================

/** What kind of Tracktion content this plugin creates */
export type GeneratorType = 'midi' | 'audio' | 'sample' | 'hybrid';

/**
 * Drum-kit configuration for `host.setTrackDrumKit`. Prototype shape carries
 * a single sample; future multi-slot kits will extend this with a `notes`
 * map (`Record<midiNote, samplePath>`) for GM-style drum maps.
 */
export interface DrumKit {
  /** Absolute path to the sample (WAV, AIFF, FLAC). Triggered on every note-on. */
  samplePath: string;
}

/**
 * One key-mapped sample zone in a pitched, polyphonic instrument.
 * Used by `host.setTrackInstrumentSampler`.
 *
 * Zones in an InstrumentSampler MUST be disjoint and ordered low to
 * high by rootKey — the engine rejects overlap because Tracktion would
 * otherwise double-trigger every matching sound on each note-on.
 */
export interface InstrumentZone {
  /** Absolute path to the zone's sample (WAV, FLAC, AIFF). */
  samplePath: string;
  /** MIDI note this sample sounds at unshifted (0-127). */
  rootKey: number;
  /** Inclusive low end of the key range that triggers this zone (0-127). */
  minKey: number;
  /** Inclusive high end of the key range that triggers this zone (0-127). */
  maxKey: number;
  /**
   * If true, the sampler plays the sample for the duration the note is
   * held and stops on note-off (good for sustaining pads, organs, etc.,
   * whose source has been pre-trimmed to a steady-state region).
   * If false, the sampler plays the sample through to its end ignoring
   * note-off (good for plucks, mallets, percussion).
   */
  openEnded: boolean;
}

/**
 * Pitched instrument configuration for `host.setTrackInstrumentSampler`.
 * Parallel to `DrumKit` but multi-zone and pitch-aware. A manifest
 * authored by the pitched-sample pipeline reduces to one of these.
 *
 * NOTE: This is distinct from `host.setTrackInstrument(trackId, pluginId)`
 * which loads a VST3/AU synth plugin. `setTrackInstrumentSampler` loads
 * the built-in Tracktion sampler with N pre-rendered zones.
 */
export interface InstrumentSampler {
  /** Display name (e.g. "Bright Warm Pluck"). Used for diagnostics. */
  name: string;
  /** Disjoint zones, ordered low->high by rootKey. At least one required. */
  zones: ReadonlyArray<InstrumentZone>;
}

/** Options for `host.listAudioFiles`. */
export interface ListAudioFilesOptions {
  /**
   * File extensions to include (dot-prefixed, lowercase). Defaults to
   * `['.wav']`. Other audio formats (`.aif`, `.flac`, `.mp3`) are passed
   * through verbatim; the host does not transcode.
   */
  extensions?: string[];
  /** Walk subdirectories. Defaults to `false`. */
  recursive?: boolean;
}

/** Describes an available instrument plugin (VST3/AU synth) on the system. */
export interface InstrumentDescriptor {
  /** Stable plugin identifier for loading (VST3 TUID or AU component ID) */
  pluginId: string;
  /** Display name */
  name: string;
  /** Plugin manufacturer */
  manufacturer: string;
  /** Plugin format */
  type: 'vst3' | 'au' | 'vst' | 'internal';
  /** Plugin category (from scan) */
  category: string;
  /** Whether this plugin is currently installed/available */
  missing?: boolean;
}

/** Every generator plugin must implement this interface. */
export interface GeneratorPlugin {
  /** Unique ID, npm-style scope: '@sas/synth-generator', '@user/my-plugin' */
  readonly id: string;
  /** Human-readable name shown in accordion header */
  readonly displayName: string;
  /** Semver version string */
  readonly version: string;
  /** Short description for settings/marketplace */
  readonly description: string;
  /** 24x24 icon — data URL, relative path from plugin dir, or undefined */
  readonly icon?: string;
  /** What kind of Tracktion content this plugin creates */
  readonly generatorType: GeneratorType;
  /** Minimum host SDK version this plugin requires */
  readonly minHostVersion?: string;

  /**
   * Called once when plugin is loaded. Receives the PluginHost API.
   * If this throws, plugin is marked as failed and not rendered.
   */
  activate(host: PluginHost): Promise<void>;

  /**
   * Called when plugin is being unloaded (disable, uninstall, app quit).
   * Must complete within 5 seconds or host force-kills.
   */
  deactivate(): Promise<void>;

  /**
   * Return the React component rendered inside the accordion section.
   * Component receives PluginUIProps from the host.
   */
  getUIComponent(): ComponentType<PluginUIProps>;

  /**
   * Return JSON Schema for plugin-specific settings.
   * Host auto-renders a settings form. Return null if no settings.
   */
  getSettingsSchema(): PluginSettingsSchema | null;

  /**
   * Optional: Called when the active scene changes.
   */
  onSceneChanged?(sceneId: string | null): Promise<void>;

  /**
   * Optional: Called when the generation context changes
   * (chords updated, tracks added/removed, BPM changed).
   */
  onContextChanged?(context: MusicalContext): void;

  /**
   * Optional: Declare LLM-callable skills this plugin provides.
   * Skills are registered as namespaced tools (plugin:<pluginId>:<skillId>)
   * and become available to AI agents for orchestration.
   *
   * Example: the chat-panel plugin declares a `chat` skill so external
   * agents (Claude Code, OpenClaw) can delegate scene-scoped natural
   * language work to the in-app agent via a single call.
   */
  getSkills?(): PluginSkill[];
}

// ============================================================================
// Plugin Skills (AI Harness)
// ============================================================================

/** An LLM-callable action declared by a plugin. */
export interface PluginSkill {
  /** Unique skill id within this plugin (e.g., 'chat', 'generate_bassline') */
  id: string;
  /** Human-readable description — drives LLM tool selection */
  description: string;
  /** JSON Schema for the skill's input parameters */
  inputSchema: PluginSkillInputSchema;
  /** Whether this skill only reads state (no mutations). Default: false */
  isReadOnly?: boolean;
}

/** JSON Schema shape for skill input parameters. */
export interface PluginSkillInputSchema {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
}

// ============================================================================
// Plugin UI Props
// ============================================================================

/** Props passed to every plugin's React component by the host */
export interface PluginUIProps {
  /** The scoped PluginHost API instance for this plugin */
  host: PluginHost;
  /** Currently active scene ID (null if none selected) */
  activeSceneId: string | null;
  /** Whether the user is authenticated (for LLM access) */
  isAuthenticated: boolean;
  /** Whether all systems are connected (engine, gateway) */
  isConnected: boolean;
  /** Which workstation deck this is rendered in */
  deckId?: 'left' | 'right';
  /** Plugin calls this to set/clear header buttons. Pass null to clear. */
  onHeaderContent?: (content: ReactNode | null) => void;
  /** Plugin calls this to show/hide the loading spinner in the header. */
  onLoading?: (loading: boolean) => void;
  /** Scene-level context: contract state, chords, BPM, etc. Null if no scene. */
  sceneContext?: PluginSceneContext | null;
  /** Callback to open the scene selector (Scenes accordion section). */
  onSelectScene?: (() => void) | null;
  /** Callback to open the contract/chords section (for "Generate a Contract" CTA). */
  onOpenContract?: (() => void) | null;
  /** Callback to expand this plugin's own accordion section. */
  onExpandSelf?: (() => void) | null;
  /**
   * Whether the host's accordion section for this plugin is currently expanded.
   * Plugin UIs can watch transitions to take focus, refresh data, etc. The host
   * keeps the plugin mounted across collapse/expand to preserve state, so this
   * prop (not mount/unmount) is the signal that the user is actively viewing.
   */
  isExpanded?: boolean;
}

// ============================================================================
// PluginHost API
// ============================================================================

/**
 * Canonical display metadata for a distributable sample pack, sourced from the
 * HOST's pack registry (the same source it uses to download + version-check the
 * bundle). Returned by `host.getSamplePackInfo` so a plugin's download CTA can
 * show the live name / description / size instead of a hardcoded copy that
 * drifts when a new pack version ships. Structurally compatible with
 * `SamplePackCardInfo` (the CTA card prop).
 *
 * @since SDK 2.12.0
 */
export interface SamplePackPublicInfo {
  /** Stable pack identifier, e.g. `'sas-instrument-pack'`. */
  packId: string;
  /** Human-readable pack name for the CTA headline. */
  displayName: string;
  /** One-line description of the pack's contents. */
  description: string;
  /** Size in bytes of the default download variant. */
  sizeBytes: number;
}

/** Scoped API surface that plugins interact with. Plugins NEVER get direct TracktionEngine access. */
export interface PluginHost {
  // --- Track Management (ownership-scoped) ---

  /** Create a new track in the active scene. Host enforces ownership and scene routing. */
  createTrack(options: CreateTrackOptions): Promise<PluginTrackHandle>;

  /** Delete a track previously created by THIS plugin. */
  deleteTrack(trackId: string): Promise<void>;

  /** Get all tracks this plugin owns in the active scene. */
  getPluginTracks(): Promise<PluginTrackHandle[]>;

  /** Adopt unowned tracks in the active scene matching this plugin's generator type. */
  adoptSceneTracks(): Promise<PluginTrackHandle[]>;

  /** Get info about a specific owned track. */
  getTrackInfo(trackId: string): Promise<PluginTrackInfo>;

  /** Set track mute state. Only works on owned tracks. */
  setTrackMute(trackId: string, muted: boolean): Promise<void>;

  /** Set track volume (linear 0.0 - 1.0). Only works on owned tracks. */
  setTrackVolume(trackId: string, volume: number): Promise<void>;

  /** Set track pan (-1.0 left to 1.0 right). Only works on owned tracks. */
  setTrackPan(trackId: string, pan: number): Promise<void>;

  /** Set track solo state. Only works on owned tracks. */
  setTrackSolo(trackId: string, solo: boolean): Promise<void>;

  /** Whether ANY track in the project is currently soloed (across all panels).
   *  Lets a panel dim its non-soloed rows (the engine silences them via the
   *  effective-mute model). Read-only; not ownership-scoped. */
  isAnySoloActive(): Promise<boolean>;

  /** Rename a track. Only works on owned tracks. */
  setTrackName(trackId: string, name: string): Promise<void>;

  /**
   * Persist a track's musical role to the `tracks.role` column. Call this
   * after an LLM generation classifies the track (e.g. `'bass'`, `'lead'`,
   * `'pad'`, `'fx'`, `'kicks'`) so downstream features — especially the v1
   * transition generator's layer classifier — can see the role.
   *
   * Canonical values understood by the transition classifier include
   * `bass`, `drums`, `lead`, `chords`, `pad`, `arp`, `fx`, `kicks`,
   * `snares`, `hats`, `clap`, `perc`, `riser`, `impact`. Anything else is
   * stored verbatim but won't match the neutral-role set.
   *
   * Only works on owned tracks.
   */
  setTrackRole(trackId: string, role: string): Promise<void>;

  /** Shuffle preset: keep MIDI, apply a random preset from the same category. Only works on owned tracks. */
  /**
   * Shuffle preset: keep MIDI, apply a random preset from the same category.
   * `excludeNames` (since SDK 1.5.0) filters preset names out of the random
   * pool; the current preset is always implicitly excluded. Use this to
   * implement a "no-repeat until full cycle" shuffle: the panel accumulates
   * the history and resets when shufflePreset throws "no presets available".
   */
  shufflePreset(trackId: string, excludeNames?: readonly string[]): Promise<ShufflePresetResult>;

  /** Duplicate track: copy MIDI + role to a new track with a different preset. Only works on owned tracks. */
  duplicateTrack(trackId: string): Promise<PluginTrackHandle>;

  /**
   * Persist this plugin's track row order for the active scene. Pass the stable
   * track dbIds ({@link PluginTrackHandle.dbId}) in the desired top-to-bottom
   * order. Reload-safe — {@link getPluginTracks} returns tracks in this order
   * across scene switches and project reopen.
   *
   * Per-panel and decoupled from the engine-synced global track order, so
   * reordering one panel never disturbs other plugins' tracks. Tracks omitted
   * from the list (e.g. newly added or duplicated) keep their natural order at
   * the end. Pairs with the {@link useTrackReorder} hook, which drives the
   * drag-and-drop UI and calls this on drop.
   *
   * @since SDK 2.16.0
   */
  reorderTracks(orderedTrackIds: readonly string[]): Promise<void>;

  /**
   * Return the canonical list of valid role tokens that the host's
   * classifier and UI understand. Plugins should use this list when
   * building LLM prompts or validating role values before calling
   * {@link setTrackRole}.
   *
   * The assistant owns the canonical taxonomy — plugins MUST NOT ship
   * their own hardcoded list, which would drift from the host. Pair with
   * {@link setTrackRole} to persist a classified role.
   *
   * @since SDK 2.0.0
   */
  getValidRoles(): readonly string[];

  // --- FX Operations (ownership-scoped) ---

  /** Get detailed FX state for a track (enabled, preset, dry/wet per category). */
  getTrackFxState(trackId: string): Promise<PluginTrackFxDetailState>;

  /** Toggle an FX category on/off for a track. */
  toggleTrackFx(trackId: string, category: string, enabled: boolean): Promise<void>;

  /** Set FX preset for a track. Returns the new dry/wet value if applicable. */
  setTrackFxPreset(trackId: string, category: string, presetIndex: number): Promise<{ dryWet?: number }>;

  /** Set FX dry/wet level for a track. */
  setTrackFxDryWet(trackId: string, category: string, value: number): Promise<void>;

  // --- Real-time Track State ---

  /** Subscribe to real-time track state changes (mute, solo, volume, pan). Returns unsubscribe fn. */
  onTrackStateChange(listener: TrackStateChangeListener): UnsubscribeFn;

  // --- MIDI Operations ---

  /** Write MIDI notes to a track this plugin owns. Replaces existing MIDI. */
  writeMidiClip(trackId: string, clip: MidiClipData): Promise<MidiWriteResult>;

  /** Clear all MIDI from a track this plugin owns. */
  clearMidi(trackId: string): Promise<void>;

  /**
   * Export all tracks owned by this plugin in the active scene as a ZIP bundle
   * of Standard MIDI Files (one .mid per track, named after each track with
   * collision-avoidance suffixes). Prompts the user for a save location.
   *
   * Tracks with no MIDI data are skipped. Returns the path written, or
   * `{ canceled: true }` if the user dismissed the save dialog.
   *
   * @since SDK 1.1.0
   */
  exportTracksAsMidiBundle(
    options?: ExportMidiBundleOptions
  ): Promise<ExportMidiBundleResult>;

  /**
   * Run the host's MIDI post-processing pipeline on raw notes.
   * Wraps MidiProcessor: quantize -> swing -> scale -> register -> overlaps -> humanize.
   */
  postProcessMidi(notes: PluginMidiNote[], options: PostProcessOptions): Promise<PluginMidiNote[]>;

  /**
   * Read a track's current MIDI notes for in-place editing (e.g. a piano
   * roll). Returns the track's clips with beat-based notes; an empty `clips`
   * array means the track has no MIDI. Reads LIVE engine state (NOT the DB),
   * so it reflects unsaved generator output too and needs no project_id
   * scoping — do not "fix" this into a DB query.
   *
   * Ownership-gated like {@link writeMidiClip}. Optional so a plugin built
   * against this SDK still loads on an older host — callers MUST null-check.
   * @since SDK 2.15.0
   */
  readMidiNotes?(trackId: string): Promise<ReadMidiResult>;

  // --- Audio Operations ---

  /** Place an audio file on a track this plugin owns. */
  writeAudioClip(trackId: string, filePath: string, position?: number): Promise<void>;

  /**
   * Render a single track to a temporary WAV file and return its path.
   * Only works on owned tracks. For MIDI/synth tracks the host mutes siblings
   * and renders the scene. For single-clip audio tracks the host MAY take a
   * copy-source fast path.
   * @since SDK 1.2.0
   */
  exportTrackAudio?(trackId: string): Promise<ExportTrackAudioResult>;

  /**
   * Run a chain of audio operations on an input WAV via the bundled
   * sas-audio-processor binary. Unsupported ops throw NOT_IMPLEMENTED.
   * @since SDK 1.2.0
   */
  processAudio?(
    inputPath: string,
    operations: AudioProcessingOp[]
  ): Promise<ProcessAudioResult>;

  /**
   * Replace a track's audio content. For audio tracks, clears clips and
   * adds the new audio. For MIDI/synth tracks, the original row is stashed
   * in plugin_data and a new audio_tracks row is inserted (MIDI is lost).
   * @since SDK 1.2.0
   */
  replaceTrackAudio?(trackId: string, audioPath: string): Promise<void>;

  // --- Plugin/Synth Operations ---

  /** Load a VST3/AU plugin onto a track this plugin owns. */
  loadSynthPlugin(trackId: string, pluginName: string): Promise<number>;

  /** Set plugin state (base64-encoded preset data). */
  setPluginState(trackId: string, pluginIndex: number, stateBase64: string): Promise<void>;

  /** Get current plugin state (base64-encoded). */
  getPluginState(trackId: string, pluginIndex: number): Promise<string>;

  /**
   * Set a plugin's RAW VST3/AU state — the plugin's own getStateInformation
   * format, bypassing Tracktion's ValueTree wrapper. Use for third-party
   * instruments (u-he Diva, Serum, …) whose patches the ValueTree round-trip
   * does not faithfully preserve. Default Surge XT presets use setPluginState.
   * @since SDK 2.15.0
   */
  setRawPluginState(trackId: string, pluginIndex: number, stateBase64: string): Promise<void>;

  /** Get a plugin's RAW VST3/AU state (see setRawPluginState). @since SDK 2.15.0 */
  getRawPluginState(trackId: string, pluginIndex: number): Promise<string>;

  /** List plugins currently loaded on a track. */
  getTrackPlugins(trackId: string): Promise<PluginSynthInfo[]>;

  /** Remove a plugin from a track. */
  removePlugin(trackId: string, pluginIndex: number): Promise<void>;

  /** Check if a specific VST/AU plugin is available on the system. */
  isPluginAvailable(pluginName: string): Promise<boolean>;

  // --- Instrument Plugin Selection ---

  /** Get available instrument plugins (VST3/AU synths) scanned by the engine. */
  getAvailableInstruments(): Promise<InstrumentDescriptor[]>;

  /** Get the instrument plugin currently loaded on a track. Null = default (Surge XT). */
  getTrackInstrument(trackId: string): Promise<InstrumentDescriptor | null>;

  /** Change the instrument plugin on a track. Preserves MIDI data. */
  setTrackInstrument(trackId: string, pluginId: string): Promise<void>;

  /** Open the instrument plugin's native editor GUI as a floating window. */
  showInstrumentEditor(trackId: string): Promise<void>;

  /** Close the instrument plugin's editor window. */
  hideInstrumentEditor(trackId: string): Promise<void>;

  // --- Drum Sampler ---

  /**
   * Load the engine's built-in sampler on the track (if not already
   * present) and configure it with a single one-shot sound. Every MIDI
   * note triggers the loaded sample regardless of pitch — used by the
   * drum-generator plugin where the LLM's emitted pitch is advisory.
   *
   * Idempotent: calling repeatedly on the same track swaps the loaded
   * sample without stacking more sampler instances. The sampler counts
   * as the track's instrument; mixing it with `setTrackInstrument` on
   * the same track is undefined behaviour for now.
   *
   * @since SDK 1.2.0
   */
  setTrackDrumKit(trackId: string, kit: DrumKit): Promise<void>;

  /**
   * Load the engine's built-in sampler on the track (if not already
   * present) and configure it with a pitched, polyphonic, multi-zone
   * instrument. Each MIDI note triggers the zone whose [minKey,maxKey]
   * range contains it; the zone is played back pitch-shifted relative
   * to its rootKey. Polyphony is handled by the Tracktion sampler's
   * voice allocator.
   *
   * Used by the instrument-generator plugin to load a pre-rendered
   * pitched-sample manifest. Mutually exclusive with `setTrackDrumKit`
   * on the same track (both occupy the sampler slot) and with
   * `setTrackInstrument(pluginId)` (which loads a VST synth instead).
   *
   * Idempotent: calling repeatedly on the same track swaps the loaded
   * zones without stacking sampler instances.
   *
   * @since SDK 1.3.0
   */
  setTrackInstrumentSampler(trackId: string, instrument: InstrumentSampler): Promise<void>;

  // --- Filesystem (sample library scanning) ---

  /**
   * List audio files (by default `.wav`) under `rootPath`. Returns
   * absolute file paths. `recursive` defaults to false; pass `true` to
   * walk subdirectories. The drum-generator plugin uses this to
   * lazily discover available samples without round-tripping each
   * folder through `getSamples`.
   *
   * Plugins MUST NOT use this to read paths outside their declared
   * sample roots — the host may add path validation in a later release.
   *
   * @since SDK 1.2.0
   */
  listAudioFiles(rootPath: string, options?: ListAudioFilesOptions): Promise<string[]>;

  /**
   * Read a text file's contents from the host filesystem (UTF-8). Returns
   * `null` on any read error (missing file, permission, etc.) — the
   * caller does not need to wrap the call in try/catch.
   *
   * Intended for plugin sample-library metadata: instrument manifest
   * JSON (`<instrument-id>/manifest.json`) and prompt-sibling text
   * (`<id>.txt`). Plugins parse the returned string themselves so the
   * host stays content-agnostic.
   *
   * Plugins MUST NOT use this to read paths outside their declared
   * sample roots — the host may add path validation in a later release.
   *
   * @since SDK 1.4.0
   */
  readTextFile(absolutePath: string): Promise<string | null>;

  // --- Scene Context (read-only) ---

  /** Get the FULL generation context for the active scene. */
  getGenerationContext(excludeTrackId?: string): Promise<PluginGenerationContext>;

  /** Get lightweight musical context (no concurrent track MIDI data). */
  getMusicalContext(): Promise<MusicalContext>;

  /** Get the active scene ID. Null if no scene is active. */
  getActiveSceneId(): string | null;

  /**
   * Get the bound project's DB id. Null when no project is bound.
   * Optional — older hosts and the renderer-side host proxy may omit it;
   * callers MUST feature-check. Used e.g. to detect project switches for
   * per-project conversation persistence.
   * @since SDK 2.18.0
   */
  getProjectId?(): string | null;

  /** Get list of all scenes in the project. */
  getSceneList(): Promise<PluginSceneInfo[]>;

  /**
   * Enumerate importable track candidates from OTHER scenes, scoped to this
   * plugin's track type (derived from the plugin id). Each candidate is
   * annotated with `importable` + `disabledReason` — the host computes the
   * harmonic/length/tempo gate so the UI only renders it. By default the active
   * scene is excluded; pass `includeSameScene` to also surface the active
   * scene's MIDI tracks owned by OTHER panels (the cross-panel re-sound source).
   * Scenes with no candidate of this type are omitted.
   *
   * Optional so a plugin built against this SDK still loads on an older host —
   * callers MUST null-check and hide the affordance when absent.
   * @since SDK 2.13.0
   */
  listImportableTracks?(opts?: ListImportableTracksOptions): Promise<ImportCandidateScene[]>;

  /**
   * Import a source track (from another scene) into the active scene as a
   * faithful, independent copy, delegating to the `import_track_from_scene`
   * tool. Returns the new track's handle so the panel can append a row.
   * Throws on a gate violation — call only for candidates with `importable`.
   * Optional — callers MUST null-check (see `listImportableTracks`).
   * @since SDK 2.13.0
   */
  importTrack?(opts: { sourceSceneId: string; sourceTrackId: string }): Promise<PluginTrackHandle>;

  /**
   * Read a source track's CURRENT sound — sample path (drums), sampler zones
   * (instruments), or Surge preset state (synths) — so a panel can copy just
   * the sound onto another track, IGNORING the contract gate that `importTrack`
   * enforces ("different contract, same preset"). Read-only: applies nothing.
   * The selector is the source track's DB row id (`ImportCandidateTrack.dbId`).
   * Returns null when the track has no stored sound. Optional — callers MUST
   * null-check (see `listImportableTracks`).
   * @since SDK 2.14.0
   */
  getTrackSound?(sourceTrackDbId: string): Promise<TrackSoundSnapshot | null>;

  /**
   * Read a source track's persisted MIDI by its DB row id — the cross-panel
   * READ half of "re-sound a part on a different instrument". Unlike
   * `readMidiNotes` (engine-read, ownership-gated), this reads the DB and is
   * NOT ownership-gated, so a panel can pull a part out of a track owned by a
   * DIFFERENT panel in the same scene (the selector is
   * `ImportCandidateTrack.dbId`, e.g. a `sameScene` candidate). Notes are
   * beat-based, identical shape to `readMidiNotes`; the loop span comes from the
   * source scene. Returns `{ clips: [] }` when the track has no MIDI. Optional —
   * callers MUST null-check (see `listImportableTracks`).
   * @since SDK 2.20.0
   */
  readImportableTrackMidi?(sourceTrackDbId: string): Promise<ReadMidiResult>;

  /**
   * List THIS panel's family tracks in a specific scene (by DB id), WITHOUT the
   * import key/length/tempo gate that `listImportableTracks` applies. Powers the
   * crossfade picker: the origin (from) and target (to) scenes of a transition
   * deliberately differ in key, so gating would wrongly hide valid candidates.
   * Project-scoped, read-only. Returns [] for an unknown/empty scene. Optional —
   * callers MUST null-check (see `listImportableTracks`).
   * @since SDK 2.22.0
   */
  listSceneFamilyTracks?(sceneDbId: string): Promise<SceneFamilyTrack[]>;

  // --- Transport & Playback Events ---

  /** Subscribe to transport state changes. Returns unsubscribe function. */
  onTransportEvent(listener: TransportEventListener): UnsubscribeFn;

  /** Subscribe to deck boundary events. Returns unsubscribe function. */
  onDeckBoundary(listener: DeckBoundaryListener): UnsubscribeFn;

  /** Subscribe to scene change events. Returns unsubscribe function. */
  onSceneChange(listener: SceneChangeListener): UnsubscribeFn;

  /** Get current transport state (one-shot). */
  getTransportState(): Promise<PluginTransportState>;

  /**
   * One-shot mono peak level for every track this plugin owns. Drives the
   * cosmetic per-track strip meters; poll at ~30Hz while the transport is
   * playing. The host scopes the result to this plugin's tracks and coalesces
   * the underlying engine read, so a busy engine yields a STALE meter rather
   * than a backlog (playback always wins over the GUI). Optional: guard with
   * `typeof host.getTrackLevels === 'function'` for older hosts.
   * @since SDK 2.21.0
   */
  getTrackLevels?(): Promise<PluginTrackLevel[]>;

  // --- LLM Access (metered, authenticated) ---

  /** Generate text/JSON via the host's authenticated LLM service. */
  generateWithLLM(request: LLMGenerationRequest): Promise<LLMGenerationResult>;

  /**
   * Generate with native tool-use (function calling). Used by agentic plugins
   * (chat panel, etc.) to drive an iterative loop where the model calls tools,
   * observes results, and decides next steps — same loop class as Claude Code
   * or VS Code agent mode.
   *
   * Shape mirrors Gemini's `generateContent` REST surface; the host forwards
   * verbatim to the gateway's Gemini-native passthrough endpoint, which adds
   * the central Google API key. Plugins never see provider credentials.
   *
   * Available since SDK 2.4.0.
   */
  generateWithLLMTools(request: LLMToolUseRequest): Promise<LLMToolUseResponse>;

  /**
   * Resolve absolute paths for spawning the bundled `sas` CLI as a subprocess.
   * Used by agentic plugins that drive the CLI as their tool surface (chat
   * panel, etc.). Returns `null` when called from a renderer-side host or
   * when the CLI isn't accessible.
   *
   * Available since SDK 2.4.0.
   */
  getCliPaths(): { appExe: string; cliEntry: string } | null;

  /**
   * Resolve the absolute path to a bundled resource directory shipped with
   * the app via `extraResources` (e.g. `'drum-samples'`,
   * `'tracktion-presets'`). In dev, resolves to
   * `<projectRoot>/resources/<name>`. In packaged builds, resolves to
   * `<process.resourcesPath>/<name>`.
   *
   * Returns `null` if the host cannot resolve paths in this context
   * (e.g. Electron mocked out in unit tests). Plugins MUST null-check and
   * either degrade gracefully or fall back to a known dev path.
   *
   * Async by design: the renderer-side host proxy round-trips through IPC.
   *
   * @since SDK 2.7.0
   */
  getBundledResourcePath(name: string): Promise<string | null>;

  /** Check if LLM access is available (user authenticated + gateway reachable). */
  isLLMAvailable(): Promise<boolean>;

  // --- App Tool Bridge ---

  /**
   * List the host's registered app tools. Used by plugins (e.g. the chat
   * panel) that want to expose the same surface external AI agents have.
   *
   * `opts.scope` filters by scope tag — scene-scoped consumers pass
   * `'scene'` to hide project-level tools they shouldn't call. When omitted,
   * every tool regardless of scope is returned.
   *
   * `opts.includeDeferred` (since SDK 2.18.0) opts in to tools flagged with
   * `deferLoading` (progressive disclosure). Default `false` mirrors
   * `/api/v1/actions` — the curated core surface. Used by curation layers
   * that promote specific deferred/project tools onto an agent's default
   * declaration set.
   *
   * @since SDK 1.2.0
   */
  listAppTools(opts?: {
    scope?: 'scene' | 'project';
    includeDeferred?: boolean;
  }): Promise<PluginAppTool[]>;

  /**
   * Execute a host app tool by name. Delegates to the in-process
   * ToolRegistry — every call (including this one) broadcasts to the
   * UI's `mutations:tool-executed` channel so renderer state stays
   * fresh whether the call mutates or is read-only. Read-only callers
   * pay zero extra cost since the renderer debounces and skips
   * redundant reloads.
   *
   * For scene-scoped tools tagged with `autoBindSceneId`, the host
   * overrides the caller's `sceneId` param with the currently-active
   * scene. That keeps a scene-bound caller from accidentally targeting
   * another scene.
   *
   * `opts.provenance` (since SDK 2.18.0) stamps the originating actor onto
   * every domain event this call emits — pass `'agent'` from autonomous
   * agent loops so the UI orchestrator can gate auto-navigation, `'user'`
   * when proxying a direct user gesture. Omitted = `'system'`.
   *
   * @since SDK 1.2.0
   */
  executeAppTool(
    name: string,
    params: Record<string, unknown>,
    opts?: { provenance?: 'agent' | 'user' }
  ): Promise<PluginAppToolResult>;

  /**
   * Monotonic counter that increments on every state mutation
   * (`broadcastMutation('tool-executed', ...)`). Use as a cache key for
   * derived state that depends on the project: when the counter changes,
   * something mutated; when it doesn't, your cache is still valid.
   *
   * Mostly aimed at performance-sensitive callers like ambient-context
   * builders that want to skip re-querying state when nothing has
   * changed. The counter is process-local — it resets on app restart
   * and is not durable across sessions.
   *
   * Implementation detail: the counter is bumped by `mutation-broadcaster`
   * before the broadcaster fires, so a synchronous `getMutationSeq()`
   * call from inside a mutation listener will see the post-bump value.
   *
   * @since SDK 2.6.0
   */
  getMutationSeq(): number;

  // --- Preset System ---

  /** Get available preset categories for a synth plugin. */
  getPresetCategories(pluginName: string): Promise<string[]>;

  /** Get a random preset from a category. */
  getRandomPreset(category: string): Promise<PluginPresetData | null>;

  /** Get a specific preset by name from a category. */
  getPresetByName(category: string, name: string): Promise<PluginPresetData | null>;

  /** Use LLM to classify a text description into a preset category. */
  classifyPresetCategory(description: string): Promise<string>;

  // --- Storage & Settings ---

  /** Get absolute path to this plugin's isolated data directory. */
  getDataDirectory(): string;

  /** Persisted key-value settings store. */
  settings: PluginSettingsStore;

  // --- Sample Pack Distribution ---

  /**
   * Return the absolute path to an installed sample pack's root directory,
   * or `null` if the pack is missing OR its installed version doesn't match
   * what the current app build expects.
   *
   * Plugins should treat `null` as "show the download CTA"; do NOT fall back
   * to a hardcoded path. The host owns where samples live (currently
   * `<userData>/samples/<installSubdir>/`).
   *
   * Stable packIds: `'sas-drum-pack'`, `'sas-instrument-pack'`. Both packs
   * are downloaded on demand via the host's pack-download flow; see
   * `host.isSamplePackCurrent` and the renderer-side `DownloadPackButton`.
   *
   * @since SDK 2.7.0
   */
  getSamplePackRoot(packId: string): Promise<string | null>;

  /**
   * True if the installed version of `packId` matches the version this app
   * build expects. False if the pack is missing OR the installed version
   * differs (older or newer).
   *
   * Plugins call this on activate to decide between rendering their normal
   * UI vs the "Sample library not installed / Update available" CTA.
   *
   * @since SDK 2.7.0
   */
  isSamplePackCurrent(packId: string): Promise<boolean>;

  /**
   * Return the currently-installed version string for `packId` (e.g. `'1'`,
   * `'2'`), or `null` if the pack is not installed at all. Reads the
   * `_pack-version.json` marker inside the pack's install dir.
   *
   * Useful for distinguishing the "missing" CTA from the "stale, update
   * available" CTA — plugins can call this when `isSamplePackCurrent`
   * returns false to pick the right empty-state message.
   *
   * @since SDK 2.7.0
   */
  getSamplePackInstalledVersion(packId: string): Promise<string | null>;

  /**
   * Trigger a download + install of `packId` via the host's pack system (the
   * same flow `getSamplePackRoot` / `isSamplePackCurrent` report on). Resolves
   * when the install completes or fails. Plugins call this from a "download
   * library" CTA instead of reaching into the app's IPC (`window.electronAPI`)
   * directly.
   *
   * @since SDK 2.8.0
   */
  startSamplePackDownload(
    packId: string
  ): Promise<{ success: boolean; error?: string }>;

  /**
   * Subscribe to download/install progress for `packId`. Returns an unsubscribe
   * fn. `status` mirrors the host's pack-download states (e.g. `'downloading' |
   * 'extracting' | 'installing' | 'complete' | 'error'`); `progress` is 0-100.
   *
   * @since SDK 2.8.0
   */
  onSamplePackProgress(
    packId: string,
    listener: (progress: {
      packId?: string;
      status: string;
      progress: number;
      message?: string;
    }) => void
  ): UnsubscribeFn;

  /**
   * Return the canonical display metadata (`displayName`, `description`,
   * `sizeBytes`) for `packId` from the host's pack registry — the SAME source
   * the host uses to download + version-check the pack. A plugin's download CTA
   * should prefer this over a hardcoded copy so the size/description stay in
   * sync with whatever bundle the host actually ships (no per-version drift).
   * Resolves `null` for an unknown packId.
   *
   * Optional so a plugin built against this SDK still runs on an older host:
   * callers should fall back to their own static copy when it is absent or
   * returns `null`.
   *
   * @since SDK 2.12.0
   */
  getSamplePackInfo?(packId: string): Promise<SamplePackPublicInfo | null>;

  /**
   * Per-pack roots of the USER's imported sample packs for `kind`. Each root
   * is laid out exactly like the corresponding stock pack (drums:
   * `<root>/<role>/<file>.wav` + `.txt` sidecars; instruments:
   * `<root>/<category>/<id>/manifest.json`), so resolvers scan them as
   * additional roots alongside `getSamplePackRoot`. `[]` when nothing is
   * imported. User content lives under `<userData>/user-samples/` — strictly
   * separate on disk; stock pack installs never touch it.
   *
   * Optional for older-host compat: feature-check
   * (`host.getUserSampleRoots?.(...)`) and treat absence as `[]`.
   *
   * @since SDK 2.20.0
   */
  getUserSampleRoots?(kind: 'drums' | 'instruments'): Promise<string[]>;

  /**
   * Ask the host app to open its sample-import wizard targeting `kind`.
   * Fire-and-forget; renderer-hosted plugins only (the wizard is an app-level
   * modal — the main-process host no-ops). Library changes land as
   * `onSamplePackProgress` events with packId `user:<kind>` and
   * `status: 'complete'`, so subscribe to that to refresh.
   *
   * @since SDK 2.20.0
   */
  openSampleImportWizard?(kind: 'drums' | 'instruments'): void;

  // --- Deck playback ---
  //
  // The two playback decks: `'loop-a'` (composition / cue, headphones) and
  // `'loop-b'` (performance / main). These route through the SAME host path
  // the workstation UI uses, so the deck mutual-exclusivity rules
  // (PlaybackRuleEngine) are enforced identically — a plugin cannot bypass
  // them. Used by playback-driven plugins (e.g. the recorder, which starts
  // loop-a so a take has a backing loop). Available on renderer-hosted plugins.

  /**
   * Start a deck playing the given scene/transition. Mirrors the workstation's
   * transport play. `contentType` defaults to `'scene'`.
   *
   * @since SDK 2.9.0
   */
  deckPlay(
    deckId: string,
    contentId?: string,
    contentType?: 'scene' | 'transition'
  ): Promise<{ success: boolean; error?: string; code?: string }>;

  /**
   * Stop a deck.
   *
   * @since SDK 2.9.0
   */
  deckStop(deckId: string): Promise<{ success: boolean; error?: string }>;

  /**
   * Subscribe to per-deck state changes. Each event carries the `deckId`, the
   * `property` that changed (e.g. `'playing'`), and its new `value`. Returns an
   * unsubscribe fn.
   *
   * @since SDK 2.9.0
   */
  onDeckStateChanged(
    listener: (event: { deckId: string; property: string; value: unknown }) => void
  ): UnsubscribeFn;

  /**
   * Subscribe to the "all decks stopped" engine event (e.g. global transport
   * stop). Returns an unsubscribe fn.
   *
   * @since SDK 2.9.0
   */
  onAllDecksStopped(listener: () => void): UnsubscribeFn;

  // --- Scoped Data API ---

  /** Get a value from scene-scoped plugin data. */
  getSceneData<T = unknown>(sceneId: string, key: string): Promise<T | null>;

  /** Set a value in scene-scoped plugin data. */
  setSceneData(sceneId: string, key: string, value: unknown): Promise<void>;

  /** Get all key-value pairs for a scene. */
  getAllSceneData(sceneId: string): Promise<Record<string, unknown>>;

  /** Delete a key from scene-scoped plugin data. */
  deleteSceneData(sceneId: string, key: string): Promise<void>;

  /** Get the full project-scoped state object. */
  getProjectData<T = unknown>(key: string): Promise<T | null>;

  /** Set a project-scoped data value. */
  setProjectData(key: string, value: unknown): Promise<void>;

  // --- Notifications & Progress ---

  /** Show a toast notification to the user. */
  showToast(type: 'info' | 'success' | 'warning' | 'error', title: string, message?: string): void;

  /** Set progress indicator on a specific track. -1 to hide. */
  setProgress(trackId: string, progress: number): void;

  /** Set a global status message in the plugin's accordion header. */
  setStatusMessage(message: string | null): void;

  /** Request user confirmation via a modal dialog. */
  confirmAction(title: string, message: string): Promise<boolean>;

  // --- File System (Phase 2) ---

  /** Show a native file open dialog. Requires 'fileDialog' capability. */
  showOpenDialog(options: PluginFileDialogOptions): Promise<string[] | null>;

  /** Show a native file save dialog. Requires 'fileDialog' capability. */
  showSaveDialog(options: PluginFileDialogOptions): Promise<string | null>;

  /** Download a file to the plugin's data directory. */
  downloadFile(url: string, filename: string, options?: PluginDownloadOptions): Promise<string>;

  /** Copy a file into the plugin's data directory. */
  importFile(sourcePath: string, destFilename: string): Promise<string>;

  // --- Network (Phase 2, capability-gated) ---

  /** Make an HTTP request. Requires 'network' capability with allowedHosts. */
  httpRequest(options: PluginHttpRequestOptions): Promise<PluginHttpResponse>;

  // --- Secure Storage (Phase 2) ---

  /** Store a secret in the OS keychain (plugin-scoped). */
  storeSecret(key: string, value: string): Promise<void>;

  /** Retrieve a secret from the OS keychain (plugin-scoped). */
  getSecret(key: string): Promise<string | null>;

  /** Delete a secret from the OS keychain (plugin-scoped). */
  deleteSecret(key: string): Promise<void>;

  // --- Sample Library (Phase 2) ---

  /** Query the sample library with optional filters. */
  getSamples(filter?: PluginSampleFilter): Promise<PluginSampleInfo[]>;

  /** Get a single sample by ID. */
  getSampleById(id: string): Promise<PluginSampleInfo | null>;

  /** Import audio files into the sample library. */
  importSamples(filePaths: string[]): Promise<PluginSampleImportResult>;

  /** Create a sample track in the active scene. */
  createSampleTrack(sampleId: string, options?: { name?: string }): Promise<PluginTrackHandle>;

  /** Delete a sample track. */
  deleteSampleTrack(trackId: string): Promise<void>;

  /** Get all sample tracks in the active scene. Re-establishes ownership. */
  getPluginSampleTracks(): Promise<PluginSampleTrackInfo[]>;

  /** Time-stretch a sample to a target BPM. Returns the new sample info. */
  timeStretchSample(sampleId: string, targetBpm: number): Promise<PluginSampleInfo>;

  /**
   * Fit a sample to the active scene's `(bpm, length_bars)`. Composes:
   *   1. Time-stretch to scene BPM (no-op if already matching).
   *   2. Chop / loop-stitch / passthrough so the resulting clip's duration
   *      equals exactly `length_bars × 4 × (60 / bpm)` seconds.
   *
   * Required because the deck loops the clip at the scene's bar boundary —
   * a 4-bar sample dropped into a 2-bar scene used to over-run; a 4-bar
   * sample dropped into an 8-bar scene used to leave 4 bars of silence.
   *
   * The fitted sample is cached in the library by content hash, so
   * subsequent calls for the same `(sample, bpm, bars)` return instantly.
   */
  fitSampleToScene(sampleId: string): Promise<PluginSampleInfo>;

  /**
   * Lightweight one-shot sample audition through the cue (headphone) output.
   *
   * Plays the file via a dedicated SimpleLoopPlayer instance in the audio
   * engine — no Tracktion track or clip is created, no BPM matching, no
   * sync. Calling previewSample again with a different file replaces the
   * current preview cleanly. Independent of loop-b: starting/stopping a
   * preview never affects the performance deck and vice versa.
   */
  previewSample(filePath: string): Promise<void>;

  /**
   * Stop any in-flight sample preview started by previewSample(). Safe to
   * call when no preview is active — never throws.
   */
  stopPreview(): Promise<void>;

  // --- Audio Generation (Phase 2) ---

  /** Invoke the host's audio texture generation pipeline. */
  generateAudioTexture(request: PluginAudioTextureRequest): Promise<PluginAudioTextureResult>;

  // --- Audio Cue Points + Offset (Migration 060) ---

  /**
   * Persist cue points (detected beat positions) for an audio track.
   * Called once after `writeAudioClip` to remember the trim metadata so the
   * UI can later draw beat ticks and snap-to-beat the manual offset.
   *
   * Pass `null` to clear cue points. Throws OWNERSHIP_VIOLATION if the
   * track wasn't created by this plugin.
   */
  setCuePoints(trackId: string, cues: PluginCuePoints | null): Promise<void>;

  /** Read cue points previously written by `setCuePoints`. Returns null when none stored. */
  getCuePoints(trackId: string): Promise<PluginCuePoints | null>;

  /**
   * Set the manual sample-offset applied to the track's audio clip during
   * playback. Positive shifts later, negative shifts earlier with head
   * silence. Throws OWNERSHIP_VIOLATION if not owned by this plugin.
   */
  setAudioOffsetSamples(trackId: string, offsetSamples: number): Promise<void>;

  /** Read the current manual offset (0 if never set). */
  getAudioOffsetSamples(trackId: string): Promise<number>;

  // --- Raw / pre-trim audio metadata (stems trim editor) ---

  /**
   * Read raw bytes of an audio file written by the host. The path may be
   * `~app/`-relative or project-relative — the host resolves it using the
   * same logic as `writeAudioClip`. Throws FILE_NOT_FOUND if the path
   * can't be resolved or doesn't exist on disk.
   */
  getAudioFileBytes(filePath: string): Promise<ArrayBuffer>;

  /** Persist the original (raw, un-trimmed) audio file path for a track. */
  setRawAudioFilePath(trackId: string, filePath: string | null): Promise<void>;

  /** Read the raw audio file path persisted via `setRawAudioFilePath`. */
  getRawAudioFilePath(trackId: string): Promise<string | null>;

  /**
   * Persist the cue-points detected in the raw (un-trimmed) audio file.
   * Sample positions are in input-file coordinates.
   */
  setRawCuePoints(trackId: string, cues: PluginCuePoints | null): Promise<void>;

  /** Read raw-domain cue points persisted via `setRawCuePoints`. */
  getRawCuePoints(trackId: string): Promise<PluginCuePoints | null>;

  /** Persist the current trim window inside the raw audio file. */
  setTrimWindow(trackId: string, window: PluginTrimWindow | null): Promise<void>;

  /** Read the current trim window persisted via `setTrimWindow`. */
  getTrimWindow(trackId: string): Promise<PluginTrimWindow | null>;

  /**
   * Re-trim the raw audio file at the given sample offset and replace the
   * track's audio clip with the new slice. Persists updated trimmed-domain
   * cue points and the new trim window.
   */
  commitTrimWindow(
    trackId: string,
    startSample: number,
    durationSamples: number,
  ): Promise<{ filePath: string; cuePoints: PluginCuePoints | null }>;

  // --- Scene Composition ---

  /** Trigger bulk composition for the active scene (LLM plans arrangement, creates tracks, generates MIDI). */
  composeScene(options: ComposeSceneOptions): Promise<ComposeSceneResult>;

  /** Subscribe to composition progress events (planning, generating, complete, error). */
  onComposeProgress(listener: ComposeProgressListener): UnsubscribeFn;

  /** Subscribe to engine ready events (fires when the engine finishes loading tracks after a scene change). */
  onEngineReady(listener: () => void): UnsubscribeFn;

  /**
   * Subscribe to external state mutations (CLI, MCP, or HTTP-API tool calls
   * that bypass plugin-host methods). Fires after such a tool finishes,
   * signalling that scene/track DB state may have changed underneath the
   * plugin's local cache. Use it to refresh state that the plugin doesn't
   * own — e.g. re-running adoptSceneTracks() so AI-created tracks become
   * visible without requiring the user to switch scenes.
   *
   * Optional: only the renderer-side host implements this. Main-side
   * plugins should subscribe to the typed domain-event bus instead.
   */
  onAfterAgentMutation?(listener: () => void): UnsubscribeFn;

  // --- MIDI Extensions (Phase 2) ---

  /** Audition a single note on a track (fire-and-forget preview). */
  auditionNote(trackId: string, pitch: number, velocity: number, durationMs: number): Promise<void>;

  // --- Plugin Presets (Phase 2) ---

  /** Get presets for this plugin, optionally filtered by category. */
  getPluginPresets(category?: string): Promise<PluginPresetInfo[]>;

  /** Save a new preset for this plugin. */
  savePluginPreset(options: SavePluginPresetOptions): Promise<PluginPresetInfo>;

  /** Delete a plugin preset by ID. */
  deletePluginPreset(id: string): Promise<void>;

  // --- Performance / Logging (Phase 2) ---

  /** Log a performance metric. */
  logMetric(name: string, durationMs: number, metadata?: Record<string, unknown>): void;

  /** Start a timer. Returns a stop function that logs the duration. */
  startTimer(name: string): () => void;

  // --- Stem Splitting ---

  /** Split an audio track into stems (vocals, drums, bass, other). Creates new muted tracks. */
  splitStems(trackId: string): Promise<PluginStemSplitResult>;

  /** Check if the stem splitter binary is available. */
  isStemSplitterAvailable(): Promise<boolean>;

  // --- Audio Recording (capability-gated, since SDK 2.1.0) ---

  /**
   * Enumerate audio input devices visible to the engine. Empty list means
   * no input device is available (or the OS denied permission). Requires
   * `audioCapture` capability.
   * @since SDK 2.1.0
   */
  getAudioInputDevices(): Promise<AudioInputDevice[]>;

  /**
   * Snapshot of engine state needed to start a recording session. Reads
   * the engine sample rate, the active scene id, the transition-render
   * lock state, and current BPM/bars. Requires `audioCapture`.
   * @since SDK 2.1.0
   */
  getRecordingTargetInfo(): Promise<RecordingTargetInfo>;

  /**
   * Begin a recording session. Engine writes integer-PCM WAV chunks to
   * disk; one chunk per call to `markRecordingChunkBoundary`. Each
   * finalized chunk fires a `RecordingChunkFinalizedEvent` to
   * subscribers of `onRecordingChunkFinalized`. Throws
   * AUDIO_CAPTURE_DENIED on permission failure or if no device is
   * available.
   *
   * Pass `deviceId` to override the platform-configured input (rare —
   * only useful for tests or workflows that need a specific device).
   * Omit it to use the platform's selected input from
   * `AudioRoutingConfig.inputDeviceId` — this is the recommended path
   * for plugins post-SDK-2.2.0.
   *
   * @since SDK 2.1.0 (deviceId required) — 2.2.0 made it optional.
   */
  startTrackRecording(deviceId?: string): Promise<void>;

  /**
   * Mark the boundary between two recording chunks. The engine closes the
   * currently-open WAV writer and opens a new one; the closed file fires
   * a `RecordingChunkFinalizedEvent` once flush completes. No-op if no
   * recording session is active.
   *
   * Pass `boundaryHostTimeNs` from `DeckBoundaryEvent.boundaryHostTimeNs`
   * for sample-perfect take alignment (Path 2). The engine then splits
   * the chunk at the EXACT recorder-sample that corresponds to that
   * host-time, eliminating the ~5–50 ms of jitter introduced by the
   * legacy "split wherever the writer is" path. Required for any
   * workflow that overlays multiple takes (vocalist comping, layered
   * dubs); optional for single-take captures.
   *
   * @since SDK 2.1.0 — 2.4.0 added optional boundaryHostTimeNs.
   */
  markRecordingChunkBoundary(boundaryHostTimeNs?: number): Promise<void>;

  /**
   * Stop the active recording session. The final chunk is closed and
   * finalized; its `RecordingChunkFinalizedEvent` fires before this
   * promise resolves. Returns the path of the final chunk (also delivered
   * via the event for symmetry).
   * @since SDK 2.1.0
   */
  stopTrackRecording(): Promise<{ finalChunkPath: string; durationMs: number }>;

  /**
   * Subscribe to chunk-finalized events for this plugin's active recording
   * session. Auto-unsubscribed on `deactivate`. Returns unsubscribe fn.
   * @since SDK 2.1.0
   */
  onRecordingChunkFinalized(
    listener: (event: RecordingChunkFinalizedEvent) => void
  ): UnsubscribeFn;

  /**
   * Get the platform-configured audio input device, or null when no
   * device is set. Read-only; configured via the assistant's
   * AudioRoutingPanel. Plugins use this to display the current input
   * to the user without exposing their own picker.
   *
   * @since SDK 2.2.0
   */
  getCurrentInputDevice(): Promise<AudioInputDevice | null>;

  /**
   * Subscribe to input-device changes (user picks a new mic in the
   * Audio Routing panel). Listeners should refetch via
   * `getCurrentInputDevice()`. Returns an unsubscribe fn.
   *
   * @since SDK 2.4.0
   */
  onInputDeviceChange(listener: () => void): UnsubscribeFn;

  /**
   * Get the platform's mic-to-output round-trip latency offset in
   * samples. 0 = uncalibrated. Plugins recording audio apply this via
   * `setAudioOffsetSamples` so takes line up with the source loop.
   *
   * @since SDK 2.2.0
   */
  getRecordingLatencyOffsetSamples(): Promise<number>;

  /**
   * Snapshot of the input level for the most recent audio block.
   * Renderer polls at ~30Hz to drive a level meter / scrolling
   * waveform without an event-channel subscription.
   *
   * @since SDK 2.3.0
   */
  getRecordingInputLevel(): Promise<{
    peakDb: number;
    peakLinear: number;
    clipped: boolean;
    active: boolean;
  }>;

  /**
   * Reset the latched clip indicator. Safe regardless of whether
   * monitoring or recording is active.
   *
   * @since SDK 2.3.0
   */
  clearRecordingInputClipIndicator(): Promise<void>;
}

// ============================================================================
// Stem Splitting Types
// ============================================================================

/** Stem type identifiers */
export type StemType = 'vocals' | 'drums' | 'bass' | 'other';

/** Result of splitting an audio track into stems */
export interface PluginStemSplitResult {
  /** Created stem tracks with audio loaded (all auto-muted) */
  stems: PluginStemTrackInfo[];
}

/** Information about a single stem track created by stem splitting */
export interface PluginStemTrackInfo {
  /** The stem type (vocals, drums, bass, other) */
  stemType: StemType;
  /** Track handle for the new stem track */
  track: PluginTrackHandle;
}

// ============================================================================
// Exported Plugin Data Types (for .sasproj portability)
// ============================================================================

export interface ExportedPluginData {
  pluginId: string;
  scope: 'project' | 'scene' | 'global';
  scopeId: string | null;
  key: string;
  value: string; // JSON-serialized
}

// ============================================================================
// Track Types
// ============================================================================

export interface CreateTrackOptions {
  /** Display name for the track. Auto-generated if omitted. */
  name?: string;
  /** Musical role hint: 'bass', 'drums', 'lead', 'chords', 'pad', 'arp', 'fx' */
  role?: string;
  /** Load a synth plugin immediately (default: false) */
  loadSynth?: boolean;
  /** Which synth to load (default: 'Surge XT'). Ignored if loadSynth=false. */
  synthName?: string;
  /**
   * Stable plugin identifier for a custom instrument (VST3 TUID or AU component ID).
   * If provided with loadSynth=true, loads this plugin instead of synthName.
   * Null/undefined = use default (Surge XT).
   */
  instrumentPluginId?: string | null;
  /** Metadata stored in DB. Plugins can use this for plugin-specific data. */
  metadata?: Record<string, unknown>;
}

export interface PluginTrackHandle {
  /** Tracktion engine track ID (stable, GUID-based) */
  id: string;
  /** Display name */
  name: string;
  /** Database row ID */
  dbId: string;
  /** Musical role (if set) */
  role?: string;
  /** Prompt from tracks table (fallback when plugin_data not yet populated) */
  prompt?: string;
  /** Custom instrument plugin ID (null = default Surge XT) */
  instrumentPluginId?: string | null;
  /** Custom instrument display name (null = Surge XT) */
  instrumentName?: string | null;
}

/**
 * One source track offered by `listImportableTracks`, already filtered to the
 * calling panel's type. The host computes the gate; the UI only renders it.
 * @since SDK 2.13.0
 */
export interface ImportCandidateTrack {
  /** Source track's engine track id (the selector passed back to importTrack). */
  trackId: string;
  /** Source track's DB row id (globally unique; good React key). */
  dbId: string;
  /** Display name shown in the modal row. */
  name: string;
  /** Musical role if set (drives the row icon). */
  role?: string;
  /** True when this track can be copied into the active scene as-is. */
  importable: boolean;
  /** Why the track is disabled (shown as a tooltip). Present iff `!importable`. */
  disabledReason?: string;
}

/**
 * One track in a specific scene, returned by `host.listSceneFamilyTracks`,
 * already narrowed to the calling panel's family. Unlike `ImportCandidateTrack`
 * it carries NO import gate — the crossfade picker lists every same-family track
 * in the origin/target scene regardless of key/length. @since SDK 2.22.0
 */
export interface SceneFamilyTrack {
  /** Track's DB row id — the selector for getTrackSound + crossfade metadata. */
  dbId: string;
  /** Display name shown in the picker. */
  name: string;
  /** Musical role if set — used to enforce same-role crossfade pairing. */
  role?: string;
}

/**
 * One OTHER scene and its candidate tracks (already type-filtered). Scenes with
 * zero candidates of the panel's type are omitted by the host.
 * @since SDK 2.13.0
 */
export interface ImportCandidateScene {
  /** Source scene's engine scene id. */
  sceneId: string;
  /** Source scene's display name. */
  sceneName: string;
  /** Candidate tracks of this panel's type (may include disabled ones). */
  tracks: ImportCandidateTrack[];
  /**
   * True for the synthetic "this scene — other panels" entry: the ACTIVE
   * scene's MIDI tracks owned by OTHER panels. Importing one re-sounds the part
   * on the calling panel's instrument (via `readImportableTrackMidi` +
   * `writeMidiClip`) rather than faithfully copying it. Absent/false for
   * ordinary cross-scene entries. @since SDK 2.20.0
   */
  sameScene?: boolean;
}

/**
 * A source track's current sound, as returned by `host.getTrackSound`. The
 * discriminant matches the panel that reads it: drums → 'sample', instruments →
 * 'instrument', synths → 'preset'. `label` is the human name for the History row.
 * @since SDK 2.14.0
 */
/**
 * How a synth `state` blob is serialized. `valuetree` is Tracktion's wrapped
 * format (default Surge XT presets); `raw` is the plugin's own
 * getStateInformation format (third-party instruments). Absent ⇒ `valuetree`,
 * for backward compatibility with history recorded before SDK 2.15.0.
 * @since SDK 2.15.0
 */
export type SynthStateType = 'raw' | 'valuetree';

export type TrackSoundSnapshot =
  | { kind: 'sample'; samplePath: string; label: string }
  | { kind: 'instrument'; displayName: string; instrumentId: string | null; zones: InstrumentZone[]; label: string }
  | { kind: 'preset'; state: string; label: string; stateType?: SynthStateType };

/** Options for `PluginHost.listImportableTracks`. @since SDK 2.13.0 */
export interface ListImportableTracksOptions {
  /**
   * Coarse content family. 'midi' = synth/drum/instrument, 'audio' = stems,
   * 'sample' = loops. Defaults are derived from the calling plugin id, so
   * panels normally pass nothing.
   */
  family?: 'midi' | 'audio' | 'sample';
  /**
   * When true, prepend the active scene's MIDI tracks owned by OTHER panels as a
   * `sameScene` entry (the cross-panel re-sound source). Off by default so the
   * plain cross-scene import is unchanged. MIDI panels only. @since SDK 2.20.0
   */
  includeSameScene?: boolean;
}

export interface PluginTrackInfo extends PluginTrackHandle {
  /** Is track muted? */
  muted: boolean;
  /** Is track soloed? */
  soloed: boolean;
  /** Volume (linear 0-1) */
  volume: number;
  /** Pan (-1 to 1) */
  pan: number;
  /** Loaded plugins on this track */
  plugins: PluginSynthInfo[];
  /** Has MIDI clips? */
  hasMidi: boolean;
  /** Has audio clips? */
  hasAudio: boolean;
}

export interface PluginSynthInfo {
  index: number;
  name: string;
  type: string; // 'VST3' | 'AudioUnit' | 'Internal'
  enabled: boolean;
}

// ============================================================================
// Real-time Track State Types
// ============================================================================

/** Real-time runtime state of a track (pushed from engine) */
export interface PluginTrackRuntimeState {
  id: string;
  muted: boolean;
  solo: boolean;
  volume: number;
  pan: number;
}

/** Listener for real-time track state changes */
export type TrackStateChangeListener = (trackId: string, state: PluginTrackRuntimeState) => void;

// ============================================================================
// FX Detail Types (SDK-friendly re-export)
// ============================================================================

/** Per-category FX detail state */
export interface PluginFxCategoryDetailState {
  enabled: boolean;
  presetIndex: number;  // 0-4
  dryWet: number;       // 0.0-1.0
}

/** Full FX detail state for a track — one entry per FX category */
export type PluginTrackFxDetailState = Record<string, PluginFxCategoryDetailState>;

// ============================================================================
// MIDI Types
// ============================================================================

export interface MidiClipData {
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** BPM for beat<->time conversion */
  tempo: number;
  /** MIDI notes */
  notes: PluginMidiNote[];
}

export interface PluginMidiNote {
  /** MIDI pitch 0-127 */
  pitch: number;
  /** Start position in quarter-note beats (0 = beginning of clip) */
  startBeat: number;
  /** Duration in quarter-note beats */
  durationBeats: number;
  /** Velocity 1-127 */
  velocity: number;
  /** MIDI channel 0-15 (default: 0) */
  channel?: number;
}

export interface MidiWriteResult {
  /** Number of notes written */
  notesInserted: number;
  /** Actual bars covered */
  bars: number;
}

/**
 * One clip returned by {@link PluginHost.readMidiNotes}. `endTime - startTime`
 * (seconds) is the clip's loop span; round-trip it back into
 * {@link MidiClipData} on save so an edit never changes the clip length.
 * @since SDK 2.15.0
 */
export interface ReadMidiClip {
  /** Clip start in seconds (engine timeline). */
  startTime: number;
  /** Clip end in seconds. Loop span = endTime - startTime. */
  endTime: number;
  /** Beat-based notes, identical shape to {@link MidiClipData.notes}. */
  notes: PluginMidiNote[];
}

/**
 * Result of {@link PluginHost.readMidiNotes}: every clip on the track. Drum /
 * instrument / synth tracks are single-clip, so callers normally use
 * `clips[0]`; the array form mirrors the engine and is future-proof.
 * @since SDK 2.15.0
 */
export interface ReadMidiResult {
  clips: ReadMidiClip[];
}

/**
 * Options for {@link PluginHost.exportTracksAsMidiBundle}.
 * @since SDK 1.1.0
 */
export interface ExportMidiBundleOptions {
  /** Default ZIP filename suggested in the save dialog (without extension). */
  defaultName?: string;
}

/**
 * Result of {@link PluginHost.exportTracksAsMidiBundle}.
 * @since SDK 1.1.0
 */
export type ExportMidiBundleResult =
  | { success: true; filePath: string; trackCount: number; skippedCount: number }
  | { success: false; canceled: true }
  | { success: false; canceled?: false; error: string };

// ============================================================================
// Audio Processing Bridge (SDK 1.2.0 — see ai-orchestration-design.md §16)
// ============================================================================

/** @since SDK 1.2.0 */
export interface ExportTrackAudioResult {
  path: string;
  bpm: number;
  durationMs: number;
  fromCopyFastPath?: boolean;
}

/** @since SDK 1.2.0 */
export interface ProcessAudioResult {
  outputPath: string;
}

/** @since SDK 1.2.0 */
export type AudioProcessingOp =
  | { tool: 'normalize' }
  | { tool: 'compress'; params?: { threshold?: number; ratio?: number } }
  | { tool: 'eq'; params?: { low_gain?: number; mid_gain?: number; high_gain?: number } }
  | { tool: 'reverb'; params?: { room_size?: number; dry_wet?: number } }
  | { tool: 'pitch-shift'; params: { semitones: number } }
  | { tool: 'time-stretch'; params: { target_bpm: number } }
  | { tool: 'filter'; params: { type: 'lowpass' | 'highpass'; cutoff: number } }
  | { tool: 'gain'; params: { db: number } }
  | { tool: 'limit' }
  | { tool: 'trim'; params?: { start?: number; end?: number } };

export interface PostProcessOptions {
  /** Snap notes to grid (default: true) */
  quantize?: boolean;
  /** Grid size: '1/4', '1/8', '1/16', '1/32', '1/8T', '1/16T' (default: '1/16') */
  quantizeGrid?: string;
  /** Quantize strength 0-100 (default: 75) */
  quantizeStrength?: number;
  /** Swing amount 0-100 (default: 0) */
  swing?: number;
  /** Humanize timing/velocity variation 0-100 (default: 0) */
  humanize?: number;
  /** Enforce diatonic scale (default: false). Uses scene key/mode. */
  enforceScale?: boolean;
  /** Clamp notes to pitch range [low, high] */
  clampRegister?: [number, number];
  /** Remove overlapping notes on same pitch/channel (default: true) */
  removeOverlaps?: boolean;
}

// ============================================================================
// Context Types
// ============================================================================

export interface MusicalContext {
  key: string;           // 'C', 'D', 'Eb', 'F#', etc.
  mode: string;          // 'major', 'minor', 'dorian', 'mixolydian', etc.
  bpm: number;           // 20-960
  bars: number;          // Scene length in bars
  genre: string | null;  // 'Drum & Bass', 'Lo-fi Hip Hop', etc.
  timeSignature: string; // '4/4', '3/4', '6/8'
  chordProgression: PluginChordTiming[];
  /**
   * The scene's natural-language contract prompt (e.g. "dark psytrance,
   * driving 130 BPM, claustrophobic"). Null when the scene has no
   * contract set yet. Auto-prefixed to the LLM by `host.generateWithLLM`
   * so every per-track generation sees the scene-level intent without
   * each plugin having to plumb it through manually.
   * @since SDK 1.2.0
   */
  contractPrompt: string | null;
}

export interface PluginChordTiming {
  /** Chord symbol: 'Cm7', 'G', 'Fmaj7', etc. */
  symbol: string;
  /** Start position in quarter notes */
  startQn: number;
  /** End position in quarter notes */
  endQn: number;
}

/** Full generation context — includes concurrent track MIDI data */
export interface PluginGenerationContext {
  chordProgression: {
    key: { tonic: string; mode: string };
    chordsWithTiming: PluginChordTiming[];
    genre: string | null;
  };
  concurrentTracks: PluginConcurrentTrackInfo[];
  /**
   * Count of tracks the host had to drop entirely from `concurrentTracks`
   * because their notes pushed the running total past the cross-track
   * budget. Panels should disclose this to the LLM (e.g. "… N additional
   * tracks omitted to fit token budget") so the model knows it is
   * working with partial context.
   * @since SDK 1.2.0
   */
  truncatedTrackCount?: number;
}

export interface PluginConcurrentTrackInfo {
  trackId: string;
  role: string | undefined;
  presetCategory: string | null;
  /** Notes organized by which chord they fall under */
  notesByChord: PluginChordSegment[];
  /**
   * The user-typed prompt that produced this track's MIDI (from
   * `tracks.prompt`). Lets the LLM see *intent* alongside the notes —
   * "punchy 909 kick" carries more meaning than the kick MIDI alone.
   * @since SDK 1.2.0
   */
  prompt?: string;
  /**
   * True when the host capped this track's notes (per-track budget).
   * The `notesByChord` payload is a prefix of the real content; the
   * total dropped count is `originalNoteCount - sum(notesByChord.notes.length)`.
   * @since SDK 1.2.0
   */
  truncated?: boolean;
  /** The track's full note count before per-track truncation. */
  originalNoteCount?: number;
}

export interface PluginChordSegment {
  chord: string;
  chordRangeQn: [number, number];
  notes: PluginMidiNote[];
}

// ============================================================================
// Transport Types
// ============================================================================

export interface TransportEvent {
  type: 'play' | 'stop' | 'pause' | 'bpmChange' | 'positionChange';
  bpm?: number;
  position?: number;       // in seconds
  isPlaying?: boolean;
}

export interface DeckBoundaryEvent {
  deckId: string;          // 'loop-a', 'loop-b'
  bar: number;             // Current bar number (1-based)
  beat: number;            // Current beat within bar (1-based)
  loopCount: number;       // How many loops completed
  /**
   * Stream-time sample index at which the loop wrap was detected in the
   * audio thread (engine's AudioBoundaryProbe). Undefined when the
   * audio-thread anchor was unavailable. @since SDK 2.4.0
   */
  boundaryAudioSamplePosition?: number;
  /**
   * Monotonic host-time (nanoseconds) at the audio block in which the
   * loop wrap was detected. Same clock as
   * `juce::AudioIODeviceCallbackContext::hostTimeNs`. Pair with
   * `markRecordingChunkBoundary(boundaryHostTimeNs)` for sample-perfect
   * take alignment. @since SDK 2.4.0
   */
  boundaryHostTimeNs?: number;
}

export interface PluginTransportState {
  isPlaying: boolean;
  isPaused: boolean;
  bpm: number;
  position: number;        // in seconds
  timeSignature: string;
}

/**
 * Mono peak level for a single track, as reported by `getTrackLevels()`.
 * Drives the cosmetic per-track strip meters. `peakDb` is the max of the
 * L/R channels, floored at -120 (the "no signal" sentinel).
 * @since SDK 2.21.0
 */
export interface PluginTrackLevel {
  /** Tracktion engine track id — matches `PluginTrackHandle.id`. */
  trackId: string;
  /** Mono peak in dBFS (max of L/R), floored at -120. */
  peakDb: number;
  /** Latched overload since the last poll. */
  clipped: boolean;
}

export interface PluginSceneInfo {
  id: string;
  name: string;
  isMuted: boolean;
}

/** Scene-level contract/context state passed to plugin UIs as a prop */
export interface PluginSceneContext {
  /** Whether a contract has been generated (genre or contractPrompt exists AND chords exist) */
  hasContract: boolean;
  /** Original user prompt text (e.g., "dark psytrance"). Null if none. */
  contractPrompt: string | null;
  /** Extracted genre. Null if none. */
  genre: string | null;
  /** Musical key. Null if no chord progression. */
  key: { tonic: string; mode: string } | null;
  /** Chord symbols (e.g., ["Cm", "Fm", "G"]). Empty if no chords. */
  chords: string[];
  /** BPM from project tempo */
  bpm: number;
  /** Scene length in bars */
  bars: number;
  /** Whether any synth tracks exist in this scene */
  hasTracks: boolean;
  /** Whether bulk generation is currently in progress */
  isBulkGenerating: boolean;
  /**
   * Scene kind. A 'transition' scene bridges two other scenes (the
   * transition-as-scene feature) and unlocks the crossfade-track UI in the
   * instrument panels; ordinary scenes are 'scene'. Absent on older hosts.
   * @since SDK 2.22.0
   */
  sceneType?: 'scene' | 'transition';
  /** For a transition scene, the DB id of the scene it bridges FROM (origin). Null otherwise. @since SDK 2.22.0 */
  transitionFromSceneId?: string | null;
  /** For a transition scene, the DB id of the scene it bridges TO (target). Null otherwise. @since SDK 2.22.0 */
  transitionToSceneId?: string | null;
}

/** Placeholder track state for the progressive bulk-add UX */
export interface BulkAddPlaceholderTrack {
  id: string;
  planIndex: number;
  role: string;
  description: string;
  status: 'planned' | 'creating' | 'completed' | 'failed';
  error?: string;
}

export type TransportEventListener = (event: TransportEvent) => void;
export type DeckBoundaryListener = (event: DeckBoundaryEvent) => void;
export type SceneChangeListener = (sceneId: string | null) => void;
export type UnsubscribeFn = () => void;

// ============================================================================
// LLM Types
// ============================================================================

export interface LLMGenerationRequest {
  /** System prompt (instructions, role, output format) */
  system: string;
  /** User prompt (the actual request) */
  user: string;
  /** Max tokens for response (host may cap this) */
  maxTokens?: number;
  /** Expected response format hint */
  responseFormat?: 'text' | 'json';
  /**
   * If true, the host will NOT auto-prefix the user prompt with musical
   * context (key, BPM, chords, genre, etc.). Default: false (context IS
   * prefixed automatically).
   */
  skipContextPrefix?: boolean;
}

export interface LLMGenerationResult {
  /** Raw response text */
  content: string;
  /** Tokens consumed */
  tokensUsed: number;
  /** Model that generated the response */
  model: string;
}

// ----------------------------------------------------------------------------
// Tool-use LLM types (Gemini-native shape, since SDK 2.4.0)
// ----------------------------------------------------------------------------
//
// Plugins that want a Claude-Code / VS-Code-agent-mode loop call
// `host.generateWithLLMTools(...)` with these shapes. The host forwards to
// the gateway's Gemini-native passthrough endpoint, where Google's API key
// is added centrally — plugins never see the raw key. Token usage is
// tracked by the gateway just like `generateWithLLM`.
//
// Shapes mirror Gemini's REST `generateContent` surface deliberately. We do
// not pull in `@google/genai` as a dependency: with the gateway as a
// passthrough and the host owning auth, an SDK adds no value over typed
// JSON, and we keep tighter control of breaking changes.

/** A single part of a Gemini-style content block. */
export interface LLMPart {
  /** Plain text. Mutually exclusive with functionCall / functionResponse. */
  text?: string;
  /** A tool/function the model is asking the host to invoke. */
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
    /**
     * Opaque signature returned by Gemini 3+ tool-use models. Must be echoed
     * verbatim when the assistant turn is replayed on a later iteration, or
     * the API rejects the request with a 400 ("Function call is missing a
     * thought_signature in functionCall parts."). Pre-Gemini-3 models leave
     * this undefined; preserving it round-trip is safe across families.
     */
    thoughtSignature?: string;
  };
  /** The result of a tool call, fed back into the loop on the next turn. */
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
}

export interface LLMContent {
  /** 'user' = user/tool-result; 'model' = assistant. */
  role: 'user' | 'model';
  parts: LLMPart[];
}

export interface LLMFunctionDeclaration {
  name: string;
  description: string;
  /** JSON Schema. Use `type: 'object'` with `properties` for any tool. */
  parameters: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface LLMTool {
  functionDeclarations: LLMFunctionDeclaration[];
}

export interface LLMGenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
}

export interface LLMSystemInstruction {
  parts: { text: string }[];
}

export interface LLMToolUseRequest {
  /** Gemini model id (e.g. 'gemini-2.5-flash'). */
  model: string;
  /** Conversation so far, including any tool-result turns. */
  contents: LLMContent[];
  /** System prompt as Gemini-native systemInstruction. */
  systemInstruction?: LLMSystemInstruction;
  /** Tool declarations the model may call. */
  tools?: LLMTool[];
  /** Optional tool-call mode override. */
  toolConfig?: {
    functionCallingConfig?: {
      mode?: 'AUTO' | 'ANY' | 'NONE';
      allowedFunctionNames?: string[];
    };
  };
  generationConfig?: LLMGenerationConfig;
}

export interface LLMUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

export interface LLMCandidate {
  content: LLMContent;
  finishReason?: string;
  index?: number;
}

export interface LLMToolUseResponse {
  candidates: LLMCandidate[];
  usageMetadata?: LLMUsageMetadata;
}

// ============================================================================
// Preset Types
// ============================================================================

export interface PluginPresetData {
  name: string;
  category: string;
  /** Base64-encoded plugin state — pass to setPluginState() */
  state: string;
}

/** Result of shufflePreset() — the new preset that was applied */
export interface ShufflePresetResult {
  presetName: string;
  presetCategory: string;
}

/**
 * One entry in a track's in-session "sound history" — the data behind the
 * TrackRow ↩ back-arrow and the drawer "History" tab (see `useSoundHistory`).
 *
 * `descriptor` is opaque to the SDK: each generator plugin defines its own shape
 * (a drum sample path string, an instrument `{ displayName, zones }`, a synth
 * `{ pluginIndex, stateBase64 }`) and is the value handed back to the plugin's
 * `applySound` callback to re-apply the sound.
 */
export interface SoundHistoryEntry {
  /** Human-readable label shown in the History list (filename, preset/instrument name). */
  label: string;
  /** Opaque, plugin-defined value used to re-apply this sound. */
  descriptor: unknown;
  /** User-starred. Favorited entries are never auto-evicted by the history cap. */
  favorite?: boolean;
}

// ============================================================================
// Settings Types
// ============================================================================

export interface PluginSettingsSchema {
  type: 'object';
  properties: Record<string, SettingDefinition>;
}

export interface SettingDefinition {
  type: 'string' | 'number' | 'boolean' | 'select';
  label: string;
  description?: string;
  default?: unknown;
  /** For 'select' type */
  options?: Array<{ label: string; value: string }>;
  /** For 'number' type */
  min?: number;
  max?: number;
}

export interface PluginSettingsStore {
  get<T>(key: string, defaultValue: T): T;
  set(key: string, value: unknown): void;
  getAll(): Record<string, unknown>;
  /** Subscribe to settings changes. Returns unsubscribe fn. */
  onChange(listener: (key: string, value: unknown) => void): UnsubscribeFn;
}

// ============================================================================
// Error Types
// ============================================================================

export type PluginErrorCode =
  | 'NOT_OWNED'              // Tried to modify a track not owned by this plugin
  | 'TRACK_NOT_FOUND'        // Track ID doesn't exist in engine
  | 'TRACK_LIMIT_EXCEEDED'   // Plugin has too many tracks
  | 'NO_ACTIVE_SCENE'        // No scene selected
  | 'ENGINE_ERROR'           // Tracktion engine call failed
  | 'INVALID_MIDI'           // Malformed MIDI data
  | 'FILE_NOT_FOUND'         // Audio file doesn't exist
  | 'INVALID_FORMAT'         // Unsupported audio format
  | 'PLUGIN_NOT_FOUND'       // VST/AU plugin not installed
  | 'LLM_BUDGET_EXCEEDED'    // Over token limit
  | 'LLM_UNAVAILABLE'        // Gateway unreachable
  | 'NOT_AUTHENTICATED'      // User not logged in
  | 'TIMEOUT'                // Operation timed out
  | 'CANCELLED'              // User cancelled the operation
  | 'INCOMPATIBLE'           // Plugin requires newer SDK version
  | 'CAPABILITY_DENIED'      // Plugin lacks required capability
  | 'SECRET_NOT_FOUND'       // Secret key doesn't exist
  | 'VALIDATION_ERROR'       // Inputs failed schema/format validation
  | 'AUDIO_CAPTURE_DENIED';  // OS-level mic permission denied or input device unavailable

export class PluginError extends Error {
  public readonly code: PluginErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: PluginErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PluginError';
    this.code = code;
    this.details = details;
  }
}

// ============================================================================
// Plugin Manifest (on-disk plugin.json)
// ============================================================================

export interface PluginManifest {
  id: string;
  displayName: string;
  version: string;
  description: string;
  generatorType: GeneratorType;
  main: string;               // e.g., 'dist/index.js'
  renderer?: string;           // e.g., 'dist/ui.bundle.js' (UMD bundle for renderer)
  icon?: string;               // e.g., 'assets/icon.svg'
  author?: string;
  license?: string;
  minHostVersion?: string;
  capabilities?: PluginCapabilities;
  settings?: Record<string, SettingDefinition>;
  builtIn?: boolean;
  repository?: string;         // e.g., 'https://github.com/user/my-plugin'
}

export interface PluginCapabilities {
  requiresLLM?: boolean;
  requiresSurgeXT?: boolean;
  requiresNetwork?: boolean;
  /** Allowed network hosts for httpRequest (e.g., ['api.splice.com']) */
  network?: { allowedHosts?: string[] };
  /** Plugin needs native file dialog access */
  fileDialog?: boolean;
  /**
   * Plugin needs microphone / line-in capture. Gates the recording host
   * methods (getAudioInputDevices, startTrackRecording, etc).
   * @since SDK 2.1.0
   */
  audioCapture?: boolean;
}

// ============================================================================
// Audio Recording (since SDK 2.1.0)
// ============================================================================

/**
 * Audio input device exposed by the audio engine. The `deviceId` is the
 * stable identifier returned by JUCE's AudioDeviceManager and accepted as
 * the device argument to `startTrackRecording`.
 * @since SDK 2.1.0
 */
export interface AudioInputDevice {
  /** Stable device identifier — passed back to startTrackRecording. */
  deviceId: string;
  /** Human-readable device name (e.g., "MacBook Pro Microphone", "USB Mic"). */
  label: string;
  /** True if this is the system default input device. */
  isDefault: boolean;
  /** Number of input channels the device supports (1 = mono, 2 = stereo). */
  channelCount: number;
}

/**
 * Engine state snapshot that an audio-recording plugin needs before
 * starting a session.
 * @since SDK 2.1.0
 */
export interface RecordingTargetInfo {
  /** Engine device sample rate, e.g. 44100 or 48000. */
  engineSampleRate: number;
  /** Active scene id, or null when no scene is selected. */
  sceneId: string | null;
  /** True when a transition render lock is held — recorder must refuse. */
  isRenderLocked: boolean;
  /** Current project BPM. */
  bpm: number;
  /** Active scene length in bars (4/4 assumed), or null when no scene. */
  bars: number | null;
  /**
   * Sample-perfect-recording compatibility (Path 2 gate). When false,
   * the recorder must refuse to start a session and surface
   * `recordingCompatibilityReason` to the user — input + output
   * devices cannot be sample-aligned.
   * @since SDK 2.4.0
   */
  canRecordSamplePerfect?: boolean;
  recordingCompatibilityReason?: string;
}

/**
 * Event payload fired when the engine finalizes a recording chunk WAV
 * file (either at a boundary mark or at session stop).
 * @since SDK 2.1.0
 */
export interface RecordingChunkFinalizedEvent {
  /** Absolute path to the finalized WAV file on disk. */
  filePath: string;
  /** Zero-based chunk index within the active session. */
  chunkIndex: number;
  /** Duration of this chunk in milliseconds. */
  durationMs: number;
  /** WAV sample rate. */
  sampleRate: number;
  /** WAV channel count. */
  channels: number;
  /**
   * Sample-perfect-recording metadata (Path 2). When the chunk was
   * closed via a host-time-anchored `markRecordingChunkBoundary` call,
   * carries recorder-local sample positions plus the host-time at
   * which the boundary fired. Undefined / -1 means the boundary
   * lacked a host-time anchor (legacy or stop-driven finalize).
   * @since SDK 2.4.0
   */
  recorderSampleStart?: number;
  recorderSampleEnd?: number;
  boundaryHostTimeNs?: number;
}

// ============================================================================
// Phase 2: File System Types
// ============================================================================

export interface PluginFileDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  /** For open dialog: allow selecting multiple files */
  multiSelections?: boolean;
  /** For open dialog: allow selecting directories */
  directories?: boolean;
}

export interface PluginDownloadOptions {
  /** HTTP headers to include */
  headers?: Record<string, string>;
  /** Overwrite if file exists (default: false) */
  overwrite?: boolean;
}

// ============================================================================
// Phase 2: Network Types
// ============================================================================

export interface PluginHttpRequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
}

export interface PluginHttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

// ============================================================================
// Phase 2: Sample Library Types
// ============================================================================

export interface PluginSampleFilter {
  bpm?: number;
  key?: { tonic: string; mode?: string };
  category?: string;
  searchQuery?: string;
}

export interface PluginSampleInfo {
  id: string;
  filename: string;
  filePath: string;
  category: string | null;
  bpm: number | null;
  keyTonic: string | null;
  keyMode: string | null;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
  tags: string[] | null;
}

export interface PluginSampleImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/** Sample track with associated sample metadata (returned by getPluginSampleTracks) */
export interface PluginSampleTrackInfo {
  track: PluginTrackHandle;
  sample: PluginSampleInfo;
  volume: number;
  pan: number;
}

// ============================================================================
// Phase 2: Audio Generation Types
// ============================================================================

export interface PluginAudioTextureRequest {
  /** Text prompt describing the audio texture */
  prompt: string;
  /** Duration in seconds (default: scene length) */
  durationSeconds?: number;
  /** Target BPM (default: project BPM) */
  bpm?: number;
}

export interface PluginAudioTextureResult {
  /** Path to the generated audio file */
  filePath: string;
  /** Duration of the generated audio in seconds */
  durationSeconds: number;
  /**
   * Beat positions inside the generated audio file plus the detected BPM.
   * Sample positions are relative to the file at `filePath`. Null when the
   * audio-processor did not surface detection data (older binary, fallback
   * path, or processing failed). Persist via `host.setCuePoints` after the
   * clip is written so the OffsetScrubber UI can read them later.
   */
  cuePoints: PluginCuePoints | null;
  /**
   * Path to the un-trimmed (raw) Lyria output. Used by the stems
   * trim editor to draw the full waveform. Persist via
   * `host.setRawAudioFilePath`. Null when no raw file is available.
   */
  rawFilePath?: string | null;
  /** Same beats as `cuePoints` in raw-file sample coordinates. */
  rawCuePoints?: PluginCuePoints | null;
  /**
   * Auto-detected start of the trim window inside the raw file (sample
   * offset). Null when detection was skipped.
   */
  inputStartSample?: number | null;
}

/**
 * Cue-points sidecar surfaced by the audio-processor `trim` command —
 * sample positions for each detected beat inside the generated WAV.
 * Mirrors the canonical `CuePoints` shape from the assistant; duplicated
 * here so external plugins don't reach into sas-app internals.
 */
export interface PluginCuePoints {
  /** Schema version (currently 1). */
  schema: 1;
  /** Sample rate the beat positions are expressed in. */
  sample_rate: number;
  /** Detected BPM (may differ from project BPM). Null when detection failed. */
  detected_bpm: number | null;
  /** Sample position of bar 1 / beat 1 inside the clip. */
  downbeat_sample: number;
  /** Monotone-increasing array of beat positions in samples. */
  beats: number[];
  /** ISO-8601 timestamp of when detection ran. */
  detected_at: string;
}

/**
 * A trim window inside a raw (un-trimmed) audio file. `start_sample` is
 * the offset from the start of the raw file; `duration_samples` is the
 * length of the trimmed slice. Both are in raw-file sample coordinates.
 */
export interface PluginTrimWindow {
  start_sample: number;
  duration_samples: number;
}

// ============================================================================
// Scene Composition Types
// ============================================================================

/** Options for composing a full scene arrangement via LLM. */
export interface ComposeSceneOptions {
  /** The contract prompt / musical direction for the arrangement. */
  contractPrompt: string;
  /** Genre hint (e.g. 'techno', 'jazz'). Optional. */
  genre?: string | null;
}

/** Result from a scene composition. */
export interface ComposeSceneResult {
  /** Whether the composition completed successfully. */
  success: boolean;
  /** Number of tracks created. */
  tracksCreated: number;
  /** Error message if not successful. */
  error?: string;
}

/** Listener for composition progress events. */
export type ComposeProgressListener = (event: ComposeProgressEvent) => void;

/** Progress event emitted during scene composition. */
export interface ComposeProgressEvent {
  /** Current phase: 'planning' (LLM deciding tracks), 'generating' (creating MIDI), 'complete', 'error'. */
  phase: 'planning' | 'generating' | 'complete' | 'error';
  /** Per-track placeholder state (available once planning is done). */
  placeholders?: BulkAddPlaceholderTrack[];
  /** Error message when phase is 'error'. */
  error?: string;
  /** Scene ID this compose event belongs to (for scene-keyed UI state). */
  sceneId?: string;
}

// ============================================================================
// Phase 2: Plugin Preset Types
// ============================================================================

export interface PluginPresetInfo {
  id: string;
  name: string;
  category: string | null;
  isBuiltIn: boolean;
  data: Record<string, unknown>;
}

export interface SavePluginPresetOptions {
  name: string;
  category?: string;
  data: Record<string, unknown>;
}

// ============================================================================
// App Tool Bridge (since SDK 1.2.0)
// ============================================================================

/** JSON Schema shape for a tool's input params. */
export interface PluginAppToolInputSchema {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
}

/** Lightweight descriptor returned by `PluginHost.listAppTools`. */
export interface PluginAppTool {
  name: string;
  description: string;
  inputSchema: PluginAppToolInputSchema;
  /** `'scene'` = safe for scene-scoped callers. `'project'` = cross-scene. */
  scope?: 'scene' | 'project';
  /**
   * `true` = the operation cannot be undone via the host's checkpoint/undo
   * system (project delete, disk overwrite, external export, …). The host
   * gates such calls behind a user-approval flow when invoked with agent
   * provenance; agent UIs may also surface the flag (e.g. ⚠ in a tool list).
   * @since SDK 2.18.0
   */
  irreversible?: boolean;
}

/** Result shape returned by `PluginHost.executeAppTool`. */
export interface PluginAppToolResult {
  success: boolean;
  action: string;
  message?: string;
  error?: string;
  /**
   * Tool-specific payload. Concrete shape depends on the tool — callers
   * should treat this as opaque unless they know the tool.
   */
  data?: unknown;
}

// ============================================================================
// Plugin Registry Types (used by host internals)
// ============================================================================

export type PluginStatus = 'pending' | 'active' | 'failed' | 'disabled' | 'incompatible';

export interface PluginRegistration {
  /** The loaded plugin instance */
  plugin: GeneratorPlugin;
  /** Current status */
  status: PluginStatus;
  /** Resolved manifest from disk */
  manifest: PluginManifest;
  /** The scoped PluginHost instance for this plugin */
  host: PluginHost | null;
  /** Sort order for accordion display */
  sortOrder: number;
  /** Whether the plugin is enabled */
  enabled: boolean;
  /** Error message if status is 'failed' */
  error?: string;
}
