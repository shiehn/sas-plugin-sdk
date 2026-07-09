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
  PanelBusState,
  PanelBusFxEntry,
  PanelBusLevels,
  TrackExternalFxEntry,
  GeneratorPlugin,
  PluginUIProps,
  PluginHost,
  ExportedPluginData,
  CreateTrackOptions,
  PluginTrackHandle,
  PluginTrackInfo,
  ImportCandidateTrack,
  ImportCandidateScene,
  SceneFamilyTrack,
  TrackSoundSnapshot,
  ListImportableTracksOptions,
  PluginSynthInfo,
  PluginTrackRuntimeState,
  TrackStateChangeListener,
  PluginFxCategoryDetailState,
  PluginTrackFxDetailState,
  MidiClipData,
  PluginMidiNote,
  MidiWriteResult,
  ReadMidiClip,
  ReadMidiResult,
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
  PluginTrackLevel,
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
  SoundHistoryEntry,
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
export {
  CrossfadeTrackRow,
  type CrossfadeTrackRowProps,
  type CrossfadeLayer,
} from './components/CrossfadeTrackRow';
export {
  EQUAL_POWER_GAIN,
  parseCrossfadePairs,
  asCrossfadeMeta,
  soundIdentity,
  hashString,
  buildCrossfadeVolumeCurves,
  type CrossfadeSlot,
  type CrossfadeMeta,
  type CrossfadePairMeta,
  type VolumeAutomationPoint,
  type CrossfadeVolumeCurves,
} from './crossfade-meta';
export { buildCrossfadeInpaintPrompt, type CrossfadeInpaintInput } from './crossfade-inpaint';
export {
  parseFades,
  asFadeMeta,
  buildFadeVolumeCurve,
  defaultFadeGesture,
  splitFadeEntries,
  TEXTURAL_ROLES,
  type FadeDirection,
  type FadeGesture,
  type FadeMeta,
  type FadeEntry,
  type GroupFadeEntry,
  type GroupFadeEntryOf,
} from './fade-meta';
export { FadeTrackRow, type FadeTrackRowProps, type FadeLayer } from './components/FadeTrackRow';
export {
  GroupFadeTrackRow,
  type GroupFadeTrackRowProps,
  type GroupFadeMemberLayer,
} from './components/GroupFadeTrackRow';
export { FadeModal, type FadeModalProps, type FadeSelection } from './components/FadeModal';
export { ImportTrackModal, type ImportTrackModalProps } from './components/ImportTrackModal';
export {
  CrossfadeModal,
  type CrossfadeModalProps,
  type CrossfadeSelection,
} from './components/CrossfadeModal';
// Transition Designer — the multi-row, persistent successor to CrossfadeModal +
// FadeModal: a per-panel staging board that lays out every A→B pairing at once.
// Reuses the panel's existing create/delete orchestration. Since 2.29.0.
export {
  TransitionDesigner,
  type TransitionDesignerProps,
} from './components/TransitionDesigner';
export {
  TRANSITION_DESIGNER_DRAFT_KEY,
  rowType,
  asTransitionDesignerDraft,
  reconcileSlots,
  buildRowSlots,
  normalizeSlots,
  padSlots,
  padPair,
  slotsEqual,
  rowKey,
  dbIdsFromKeys,
  AUDIO_EFFECTS,
  AUDIO_EFFECT_LABEL,
  asAudioEffect,
  type TransitionDesignerDraft,
  type TransitionRowType,
  type DesignerRowSlots,
  type AudioEffect,
} from './transition-designer-meta';
export { ConfirmDialog, type ConfirmDialogProps } from './components/ConfirmDialog';
export { Modal, type ModalProps } from './components/Modal';
export {
  TrackDrawer,
  type TrackDrawerProps,
  type DrawerTab,
  // Backwards-compatible aliases — the drawer was `InstrumentDrawer` before it
  // grew an FX tab + Import tab and became the unified per-track drawer.
  InstrumentDrawer,
  type TrackDrawerProps as InstrumentDrawerProps,
} from './components/TrackDrawer';
export {
  PianoRollEditor,
  type PianoRollEditorProps,
  PX_PER_BEAT,
  ROW_HEIGHT,
  GUTTER_W,
  DRAG_DEAD_ZONE,
  RESIZE_HANDLE_PX,
  pxToCell,
  cellToPx,
  resizeNoteDuration,
  centerScrollTop,
  transposeNotes,
  pitchToName,
} from './components/PianoRollEditor';
export { VolumeSlider } from './components/VolumeSlider';
export { PanelMasterStrip, type PanelMasterStripProps } from './components/PanelMasterStrip';
export { usePanelBus, type UsePanelBusResult } from './hooks/usePanelBus';
export { TrackExternalFxSection, type TrackExternalFxSectionProps } from './components/TrackExternalFxSection';
export { useTrackExternalFx, type UseTrackExternalFxResult } from './hooks/useTrackExternalFx';
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
export { TrackMeterStrip, type TrackMeterStripProps } from './components/TrackMeterStrip';
export { ScrollingWaveform, type ScrollingWaveformProps } from './components/ScrollingWaveform';
export { OffsetScrubber, type OffsetScrubberProps } from './components/OffsetScrubber';
export { computePeaks, drawWaveform, type WaveformPeaks } from './components/waveform';
export { analyzeWavPeak, type PeakAnalysis } from './components/wavPeakAnalyzer';
export { synthesizeCuePoints, type SynthesizeCuePointsOptions } from './components/synthesizeCuePoints';

// ============================================================================
// Panel core — the shared generator-panel engine (hook + shell + adapter).
// Panels supply a GeneratorPanelAdapter; the core owns the duplicated ~85%
// (load/reconcile, events, prompts, mixer/FX, drawer, piano roll, transition
// machinery, render skeleton). Since 2.35.0.
// ============================================================================

export * from './panel-core';

// ============================================================================
// Hooks
// ============================================================================

export { useSceneState } from './hooks/useSceneState';
export { useAnySolo } from './hooks/useAnySolo';
export {
  useSoundHistory,
  type UseSoundHistoryResult,
  type UseSoundHistoryOptions,
  type TrackSoundHistory,
} from './hooks/useSoundHistory';
export {
  useTrackReorder,
  moveItem,
  type UseTrackReorderOptions,
  type UseTrackReorderResult,
  type TrackRowDragProps,
} from './hooks/useTrackReorder';
export {
  useTrackLevels,
  useTrackLevel,
  useTrackMeter,
  useTransportPlaying,
  type TrackLevelsHandle,
  type TrackMeterView,
} from './hooks/useTrackLevels';

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

// Semantic sample matching — pick the closest sample to a text intent by
// scoring against each sample's StableAudio prompt, with variety-preserving
// top-k weighted selection. Shared by the drum + instrument resolvers. Since 2.11.0.
export {
  tokenizePrompt,
  scorePromptMatch,
  pickTopKWeighted,
  type ScoredCandidate,
  type PickTopKOptions,
} from './utils/semantic-match';
