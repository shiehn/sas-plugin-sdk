/**
 * ensemble-core — voice-coordination primitives for multi-voice (ensemble)
 * generation: the instrumentation axis (strings / horns / winds — parent
 * mode gating styles + voice tables), voice specs as data, hard per-voice
 * enforcement, soft cross-voice analysis, style packs, the submit_ensemble
 * function-calling contract, and the mode-branched joint-composition
 * prompt. Consumed by sas-ensemble-plugin; deliberately pure and
 * dependency-free so future instrumentations (vocals, …) slot in as data.
 *
 * @since SDK 2.42.0
 */

export {
  ENSEMBLE_MIN_VOICES,
  ENSEMBLE_MAX_VOICES,
  HORN_MAX_NOTES_PER_BAR,
  defaultVoiceSpecs,
  type EnsembleVoiceSpec,
} from './voice-spec';

export {
  MIN_NOTE_DURATION_BEATS,
  enforceVoice,
  foldPitchToRegister,
  nearestPitchWithPc,
  type EnsembleNote,
  type EnforceVoiceOptions,
  type EnforceVoiceResult,
} from './enforce-voice';

export {
  analyzeEnsemble,
  describeViolations,
  type AdjacentPairAnalysis,
  type EnsembleAnalysis,
  type MotionKind,
} from './analyze-ensemble';

export {
  ENSEMBLE_STYLES,
  STYLE_RULES,
  STAB_MAX_ONSET_INDEPENDENCE,
  RIFF_MAX_ONSET_INDEPENDENCE,
  UNISON_MAX_ONSET_INDEPENDENCE,
  STAB_MAX_NOTE_DURATION_BEATS,
  type EnsembleStyle,
  type EnsembleStyleRules,
} from './styles';

export {
  ENSEMBLE_INSTRUMENTATIONS,
  STYLES_FOR_INSTRUMENTATION,
  DEFAULT_STYLE_FOR_INSTRUMENTATION,
  normalizeInstrumentation,
  styleForInstrumentation,
  type EnsembleInstrumentation,
} from './instrumentation';

export {
  SUBMIT_ENSEMBLE_TOOL_NAME,
  buildSubmitEnsembleParameters,
  parseEnsembleArgs,
  type ParsedEnsemble,
} from './ensemble-schema';

export {
  buildEnsembleSystemPrompt,
  buildViolationRetrySuffix,
} from './ensemble-prompt';
