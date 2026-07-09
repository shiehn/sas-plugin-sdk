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
export { type GeneratorTrackState, newTrackState } from './track-state';
export {
  trackDataKey,
  pluginFxToToggleFx,
  parseLLMNoteResponse,
  type LLMNoteResponse,
} from './panel-helpers';
export {
  createSurgeSoundAdapter,
  type SurgeSoundAdapterOverrides,
} from './surge-sound-adapter';
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
  VerbatimFadeMember,
  PanelTransitionGroupAdapter,
} from './adapter.types';
