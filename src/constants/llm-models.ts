/**
 * LLM model ROLE aliases (SDK 3.17.0).
 *
 * Plugins never name a Google model version. They ask for a role, and the
 * HOST maps it to the current id from its registry
 * (`sas-app/src/shared/config/llm-models.ts`) at the single choke point in
 * `LLMService`. A raw id still passes through untouched (user settings that
 * stored one keep working), but new code should use a role so a Google
 * version bump is one registry edit instead of a change in every plugin.
 */
export const LLM_MODEL = {
  /** Best tier: MIDI / counterpoint / agent tool-use (Gemini Pro class). */
  BEST: 'best',
  /** Cheap, fast tier: classification, summaries, compaction (Flash-Lite class). */
  LIGHTWEIGHT: 'lightweight',
} as const;

export type LLMModelRole = (typeof LLM_MODEL)[keyof typeof LLM_MODEL];
