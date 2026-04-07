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
  PluginPresetData,
  ShufflePresetResult,
  PluginSettingsSchema,
  SettingDefinition,
  PluginSettingsStore,
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
  ComposeSceneOptions,
  ComposeSceneResult,
  ComposeProgressListener,
  ComposeProgressEvent,
  PluginPresetInfo,
  SavePluginPresetOptions,
  PluginStatus,
  PluginRegistration,
  StemType,
  PluginStemSplitResult,
  PluginStemTrackInfo,
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

// ============================================================================
// Hooks
// ============================================================================

export { useSceneState } from './hooks/useSceneState';

// ============================================================================
// Constants
// ============================================================================

export { VALID_INSTRUMENT_ROLES } from './constants/instrument-roles';
export { PLUGIN_SDK_VERSION } from './constants/sdk-version';
export { FX_PRESET_CONFIGS } from './constants/fx-presets';

// ============================================================================
// Utils
// ============================================================================

export { sliderToDb, dbToSlider, SLIDER_UNITY, DB_MAX, DB_MIN } from './utils/volume-conversion';
