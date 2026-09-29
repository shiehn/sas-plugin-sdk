/**
 * Agent-skill helpers (SDK 3.20.0): the size limits, validation and
 * action-token rewriting shared by plugin authors (in their tests) and the
 * host's agent-skill registry (at registration and load time).
 *
 * Agent skills are knowledge packs (see `PluginAgentSkill`). Limits keep the
 * agent's Level-1 index cheap and a loaded body within one tool result.
 */

import type { PluginAgentSkill } from '../types/plugin-sdk.types';

export const AGENT_SKILL_LIMITS = {
  /** kebab-case name length. */
  nameMaxChars: 64,
  /** Level-1 description: one line in every agent's skill index. */
  descriptionMaxChars: 200,
  whenToUseMaxChars: 160,
  /** Body of a plugin-contributed skill. */
  pluginBodyMaxChars: 12_000,
  /** Body of a built-in SKILL.md (the host's own catalog). */
  builtinBodyMaxChars: 10_000,
  /** Skills one plugin may contribute. */
  maxSkillsPerPlugin: 8,
} as const;

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `{{action:<id>}}`, whitespace-tolerant. Ids follow `PluginSkill.id` (snake_case in practice). */
const ACTION_TOKEN_RE = /\{\{\s*action:\s*([A-Za-z0-9_-]+)\s*\}\}/g;

/** True for a valid agent-skill name: kebab-case, at most `nameMaxChars`. */
export function isValidAgentSkillName(name: string): boolean {
  return name.length > 0 && name.length <= AGENT_SKILL_LIMITS.nameMaxChars && NAME_RE.test(name);
}

/** Action ids referenced as `{{action:<id>}}` in a body, in first-seen order, deduplicated. */
export function extractAgentSkillActionTokens(body: string): string[] {
  const seen = new Set<string>();
  for (const m of body.matchAll(ACTION_TOKEN_RE)) seen.add(m[1]);
  return [...seen];
}

/**
 * Rewrite every `{{action:<id>}}` token to the registered tool name
 * `plugin:<pluginId>:<id>`, the name agents call. The host applies this when a
 * plugin skill is loaded.
 */
export function resolveAgentSkillActionTokens(body: string, pluginId: string): string {
  return body.replace(ACTION_TOKEN_RE, (_match, id: string) => `plugin:${pluginId}:${id}`);
}

export interface ValidatePluginAgentSkillOptions {
  /**
   * Ids of the plugin's declared actions (`getSkills().map(s => s.id)`). When
   * given, every `{{action:x}}` token and `relatedActions` entry must name one.
   */
  actionIds?: readonly string[];
}

/**
 * Problems with one plugin agent skill, as human-readable strings. Empty means
 * valid. The host rejects a skill with any problem, so plugin authors should
 * assert this is empty in a test.
 */
export function validatePluginAgentSkill(
  skill: PluginAgentSkill,
  opts: ValidatePluginAgentSkillOptions = {},
): string[] {
  const problems: string[] = [];
  const label = typeof skill?.name === 'string' && skill.name ? `'${skill.name}'` : '(unnamed)';
  const L = AGENT_SKILL_LIMITS;

  if (typeof skill?.name !== 'string' || !isValidAgentSkillName(skill.name)) {
    problems.push(`${label}: name must be kebab-case, 1-${L.nameMaxChars} chars`);
  }
  if (typeof skill?.description !== 'string' || skill.description.trim() === '') {
    problems.push(`${label}: description is required`);
  } else {
    if (skill.description.length > L.descriptionMaxChars) {
      problems.push(`${label}: description is ${skill.description.length} chars (max ${L.descriptionMaxChars})`);
    }
    if (/[\r\n]/.test(skill.description)) problems.push(`${label}: description must be one line`);
  }
  if (skill?.whenToUse !== undefined && skill.whenToUse.length > L.whenToUseMaxChars) {
    problems.push(`${label}: whenToUse is ${skill.whenToUse.length} chars (max ${L.whenToUseMaxChars})`);
  }
  if (typeof skill?.body !== 'string' || skill.body.trim() === '') {
    problems.push(`${label}: body is required`);
  } else if (skill.body.length > L.pluginBodyMaxChars) {
    problems.push(`${label}: body is ${skill.body.length} chars (max ${L.pluginBodyMaxChars})`);
  }

  if (opts.actionIds && typeof skill?.body === 'string') {
    const known = new Set(opts.actionIds);
    for (const id of extractAgentSkillActionTokens(skill.body)) {
      if (!known.has(id)) problems.push(`${label}: body references unknown action {{action:${id}}}`);
    }
    for (const id of skill.relatedActions ?? []) {
      if (!known.has(id)) problems.push(`${label}: relatedActions names unknown action '${id}'`);
    }
  }
  return problems;
}

/**
 * Problems with a plugin's whole `getAgentSkills()` list: each skill's own
 * problems, plus duplicate names and the per-plugin count limit.
 */
export function validatePluginAgentSkills(
  skills: readonly PluginAgentSkill[],
  opts: ValidatePluginAgentSkillOptions = {},
): string[] {
  const problems: string[] = [];
  if (skills.length > AGENT_SKILL_LIMITS.maxSkillsPerPlugin) {
    problems.push(`${skills.length} skills (max ${AGENT_SKILL_LIMITS.maxSkillsPerPlugin} per plugin)`);
  }
  const seen = new Set<string>();
  for (const skill of skills) {
    if (seen.has(skill.name)) problems.push(`'${skill.name}': duplicate skill name`);
    seen.add(skill.name);
    problems.push(...validatePluginAgentSkill(skill, opts));
  }
  return problems;
}
