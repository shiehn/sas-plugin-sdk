/**
 * ensemble-core — voice-coordination primitives for multi-voice (ensemble)
 * generation: voice specs (register + complexity hierarchy as data), hard
 * per-voice enforcement, soft cross-voice analysis, style packs, the
 * submit_ensemble function-calling contract, and the joint-composition
 * prompt. Consumed by sas-ensemble-plugin; deliberately pure and
 * dependency-free so future style packs (vocals, brass) reuse it verbatim.
 *
 * @since SDK 2.42.0
 */

export {
  ENSEMBLE_MIN_VOICES,
  ENSEMBLE_MAX_VOICES,
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
  type EnsembleStyle,
  type EnsembleStyleRules,
} from './styles';

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
