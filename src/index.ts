/**
 * @sas/plugin-sdk — Public API
 *
 * Everything an external plugin author needs to build a generator plugin
 * for Signals & Sorcery.
 */

// ============================================================================
// Types — Core plugin contract
// ============================================================================

export type {
  GeneratorType,
  InstrumentDescriptor,
  GeneratorPlugin,
  PluginUIProps,
  PluginHost,
  ExportedPluginData,
  CreateTrackOptions,
  PluginTrackHandle,
  PluginTrackInfo,
  PluginSynthInfo,
  PluginTrackRuntimeState,
  TrackStateChangeListener,
  PluginFxCategoryDetailState,
  PluginTrackFxDetailState,
  MidiClipData,
  PluginMidiNote,
  MidiWriteResult,
  ExportMidiBundleOptions,
  ExportMidiBundleResult,
  PostProcessOptions,
  MusicalContext,
  PluginChordTiming,
  PluginGenerationContext,
  PluginConcurrentTrackInfo,
  PluginChordSegment,
  TransportEvent,
  DeckBoundaryEvent,
  PluginTransportState,
  PluginSceneInfo,
  PluginSceneContext,
  BulkAddPlaceholderTrack,
  TransportEventListener,
  DeckBoundaryListener,
  SceneChangeListener,
  UnsubscribeFn,
  LLMGenerationRequest,
  LLMGenerationResult,
  // Tool-use LLM types — agentic plugins (chat panel, etc.) use these via
  // `host.generateWithLLMTools` to drive a Claude-Code-style loop. SDK 2.4.0+.
  LLMPart,
  LLMContent,
  LLMFunctionDeclaration,
  LLMTool,
  LLMGenerationConfig,
  LLMSystemInstruction,
  LLMToolUseRequest,
  LLMUsageMetadata,
  LLMCandidate,
  LLMToolUseResponse,
  PluginPresetData,
  ShufflePresetResult,
  PluginSettingsSchema,
  SettingDefinition,
  PluginSettingsStore,
  // AI skill surface — lets plugins declare LLM-callable actions
  // registered as namespaced tools (plugin:<id>:<skill>). Required for
  // plugins that expose a `chat` or similar agent-delegation skill.
  PluginSkill,
  PluginSkillInputSchema,
  PluginErrorCode,
  PluginManifest,
  PluginCapabilities,
  PluginFileDialogOptions,
  PluginDownloadOptions,
  PluginHttpRequestOptions,
  PluginHttpResponse,
  PluginSampleFilter,
  PluginSampleInfo,
  PluginSampleImportResult,
  PluginSampleTrackInfo,
  PluginAudioTextureRequest,
  PluginAudioTextureResult,
  PluginCuePoints,
  PluginTrimWindow,
  ComposeSceneOptions,
  ComposeSceneResult,
  ComposeProgressListener,
  ComposeProgressEvent,
  PluginPresetInfo,
  SavePluginPresetOptions,
  PluginAppTool,
  PluginAppToolInputSchema,
  PluginAppToolResult,
  PluginStatus,
  PluginRegistration,
  StemType,
  PluginStemSplitResult,
  PluginStemTrackInfo,
  // Audio recording (since SDK 2.1.0)
  AudioInputDevice,
  RecordingTargetInfo,
  RecordingChunkFinalizedEvent,
  // Drum sampler (since SDK 1.2.0)
  DrumKit,
  // Pitched instrument sampler (since SDK 1.3.0)
  InstrumentZone,
  InstrumentSampler,
  ListAudioFilesOptions,
} from './types/plugin-sdk.types';

export { PluginError } from './types/plugin-sdk.types';

// ============================================================================
// Types — FX toggle system
// ============================================================================

export type {
  FxCategory,
  FxPreset,
  MixInterpolation,
  FxPresetConfig,
  FxCategoryDetailState,
  TrackFxDetailState,
  TrackFxState,
  FxPresetDataEntry,
  FxPresetData,
} from './types/fx-toggle.types';

export {
  FX_CATEGORIES,
  FX_CHAIN_ORDER,
  FX_ENGINE_PLUGIN_NAMES,
  FX_DISPLAY_LABELS,
  EMPTY_FX_STATE,
  DEFAULT_FX_DRY_WET,
  DEFAULT_FX_CATEGORY_DETAIL,
  EMPTY_FX_DETAIL_STATE,
} from './types/fx-toggle.types';

// ============================================================================
// Components
// ============================================================================

export { TrackRow, type SDKTrackRowProps } from './components/TrackRow';
export { InstrumentDrawer, type InstrumentDrawerProps } from './components/InstrumentDrawer';
export { VolumeSlider } from './components/VolumeSlider';
export { PanSlider } from './components/PanSlider';
export { FxToggleBar, type FxToggleBarProps } from './components/FxToggleBar';
export { SorceryProgressBar, calculateTimeBasedTarget } from './components/SorceryProgressBar';
export { DownloadPackButton, type DownloadPackButtonProps, type DownloadPackButtonVariant } from './components/DownloadPackButton';
export {
  SamplePackCTACard,
  type SamplePackCTACardProps,
  type SamplePackCTACardStatus,
  type SamplePackCardInfo,
} from './components/SamplePackCTACard';

// Waveform / audio-clip UI toolkit — shared by audio-oriented plugins (stems,
// recorder). Promoted from the app's src/plugins/shared (W9 — so extracted
// plugins reach it through the SDK, not a relative app path). Since 2.10.0.
export { WaveformView, type WaveformViewProps } from './components/WaveformView';
export { LevelMeter, type LevelMeterProps } from './components/LevelMeter';
export { ScrollingWaveform, type ScrollingWaveformProps } from './components/ScrollingWaveform';
export { OffsetScrubber, type OffsetScrubberProps } from './components/OffsetScrubber';
export { computePeaks, drawWaveform, type WaveformPeaks } from './components/waveform';
export { analyzeWavPeak, type PeakAnalysis } from './components/wavPeakAnalyzer';
export { synthesizeCuePoints, type SynthesizeCuePointsOptions } from './components/synthesizeCuePoints';

// ============================================================================
// Hooks
// ============================================================================

export { useSceneState } from './hooks/useSceneState';

// ============================================================================
// Constants
// ============================================================================

// VALID_INSTRUMENT_ROLES (SDK 1.x) removed in 2.0.0 — external plugins now
// call `host.getValidRoles()` on PluginHost at runtime. The canonical list
// lives in the assistant (src/music-engine/constants/instrument-classification.ts)
// and is exposed via that accessor.
export { PLUGIN_SDK_VERSION } from './constants/sdk-version';
export { FX_PRESET_CONFIGS } from './constants/fx-presets';

// ============================================================================
// Utils
// ============================================================================

export { sliderToDb, dbToSlider, SLIDER_UNITY, DB_MAX, DB_MIN } from './utils/volume-conversion';
export { formatConcurrentTracks } from './utils/format-concurrent-tracks';
