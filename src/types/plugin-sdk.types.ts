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
}

// ============================================================================
// PluginHost API
// ============================================================================

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
  shufflePreset(trackId: string): Promise<ShufflePresetResult>;

  /** Duplicate track: copy MIDI + role to a new track with a different preset. Only works on owned tracks. */
  duplicateTrack(trackId: string): Promise<PluginTrackHandle>;

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

  // --- Scene Context (read-only) ---

  /** Get the FULL generation context for the active scene. */
  getGenerationContext(excludeTrackId?: string): Promise<PluginGenerationContext>;

  /** Get lightweight musical context (no concurrent track MIDI data). */
  getMusicalContext(): Promise<MusicalContext>;

  /** Get the active scene ID. Null if no scene is active. */
  getActiveSceneId(): string | null;

  /** Get list of all scenes in the project. */
  getSceneList(): Promise<PluginSceneInfo[]>;

  // --- Transport & Playback Events ---

  /** Subscribe to transport state changes. Returns unsubscribe function. */
  onTransportEvent(listener: TransportEventListener): UnsubscribeFn;

  /** Subscribe to deck boundary events. Returns unsubscribe function. */
  onDeckBoundary(listener: DeckBoundaryListener): UnsubscribeFn;

  /** Subscribe to scene change events. Returns unsubscribe function. */
  onSceneChange(listener: SceneChangeListener): UnsubscribeFn;

  /** Get current transport state (one-shot). */
  getTransportState(): Promise<PluginTransportState>;

  // --- LLM Access (metered, authenticated) ---

  /** Generate text/JSON via the host's authenticated LLM service. */
  generateWithLLM(request: LLMGenerationRequest): Promise<LLMGenerationResult>;

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
   * @since SDK 1.2.0
   */
  listAppTools(opts?: { scope?: 'scene' | 'project' }): Promise<PluginAppTool[]>;

  /**
   * Execute a host app tool by name. Delegates to the in-process
   * ToolRegistry — every mutation broadcasts to the UI automatically.
   *
   * For scene-scoped tools tagged with `autoBindSceneId`, the host
   * overrides the caller's `sceneId` param with the currently-active
   * scene. That keeps a scene-bound caller from accidentally targeting
   * another scene.
   *
   * @since SDK 1.2.0
   */
  executeAppTool(
    name: string,
    params: Record<string, unknown>
  ): Promise<PluginAppToolResult>;

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

  // --- Scene Composition ---

  /** Trigger bulk composition for the active scene (LLM plans arrangement, creates tracks, generates MIDI). */
  composeScene(options: ComposeSceneOptions): Promise<ComposeSceneResult>;

  /** Subscribe to composition progress events (planning, generating, complete, error). */
  onComposeProgress(listener: ComposeProgressListener): UnsubscribeFn;

  /** Subscribe to engine ready events (fires when the engine finishes loading tracks after a scene change). */
  onEngineReady(listener: () => void): UnsubscribeFn;

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
}

export interface PluginConcurrentTrackInfo {
  trackId: string;
  role: string | undefined;
  presetCategory: string | null;
  /** Notes organized by which chord they fall under */
  notesByChord: PluginChordSegment[];
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
}

export interface PluginTransportState {
  isPlaying: boolean;
  isPaused: boolean;
  bpm: number;
  position: number;        // in seconds
  timeSignature: string;
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
  | 'VALIDATION_ERROR';      // Inputs failed schema/format validation

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
}

/**
 * Cue-points sidecar surfaced by the audio-processor `trim` command —
 * sample positions for each detected beat inside the generated WAV.
 * Mirrors the canonical `CuePoints` shape from the assistant; duplicated
 * here so external plugins don't reach into sas-assistant internals.
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
