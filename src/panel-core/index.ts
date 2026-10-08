/**
 * panel-core — the shared generator-panel engine (hook + shell + adapter).
 * See useGeneratorPanelCore.tsx for the architecture notes.
 * @since SDK 2.35.0
 */

export {
  useGeneratorPanelCore,
  type UseGeneratorPanelCoreOptions,
  type GeneratorPanelCore,
} from './useGeneratorPanelCore';
export { GeneratorPanelShell, type GeneratorPanelShellProps } from './GeneratorPanelShell';
export {
  useTransitionOps,
  type TransitionOps,
  type UseTransitionOpsInputs,
  type ResolvedCrossfadePair,
  type ResolvedFade,
  type ResolvedGroupFade,
} from './useTransitionOps';
export { type GeneratorTrackState, newTrackState, carryTrackViewState } from './track-state';
// Agent auto-reveal: map a host PluginRevealRequest to a panel's own track.
// Monolith panels that subscribe to host.onRevealRequest themselves use it too.
// Since 3.20.0.
export { findRevealTrackId } from './reveal';
export {
  trackDataKey,
  generationBlockedBy,
  type GenerationBlock,
  parseLLMNoteResponse,
  promptEnterToGenerate,
  type LLMNoteResponse,
} from './panel-helpers';
export {
  createSurgeSoundAdapter,
  type SurgeSoundAdapterOverrides,
} from './surge-sound-adapter';
export {
  runLinkedBroadcast,
  type GroupBroadcastProgress,
  type LinkedBroadcastTarget,
  type RunLinkedBroadcastOptions,
  type LinkedBroadcastResult,
  type LinkedApplyVerdict,
  LINKED_APPLY_VERDICT_TIMEOUT_MS,
} from './linked-broadcast';
export {
  runGenerationTurn,
  stepStatusText,
  GENERATION_STARTED_STEP,
  type GenerationStep,
  type RunGenerationTurnOptions,
} from './generation-progress';
export {
  panelMeter,
  panelClipEndSeconds,
  panelMaxBeats,
  panelQuarterNotesPerBar,
  type PanelMeterContext,
} from './meter';
export {
  buildPluginMeterGuidance,
  formatPluginMeterGuidance,
  type PluginMeterGuidance,
} from './meter-prompt';
export {
  parseTrackGroups,
  resolveTrackGroups,
  type TrackGroupMember,
  type TrackGroupMeta,
  type GroupParseSpec,
  type ResolvedTrackGroup,
  type ResolveGroupsOptions,
  type ResolvedGroupsResult,
} from './group-meta';
export {
  altGroupsFromTracks,
  altGroupCandidates,
  type AltTrackMeta,
  type AltTrackCandidate,
} from './alt-tracks';
export type {
  PanelIdentity,
  PanelFeatureFlags,
  PanelSoundAdapter,
  PanelShuffleAdapter,
  GenerationServices,
  PanelGenerationStrategy,
  CoreTrackHandlers,
  GroupRenderContext,
  PanelGroupExtension,
  GeneratorPanelAdapter,
  GeneratorPanelSlots,
  TrackCreatedContext,
  PortedTrackSource,
  VerbatimFadeMember,
  PanelTransitionGroupAdapter,
} from './adapter.types';
