import {
  AGENT_SKILL_LIMITS,
  extractAgentSkillActionTokens,
  isValidAgentSkillName,
  resolveAgentSkillActionTokens,
  validatePluginAgentSkill,
  validatePluginAgentSkills,
} from '../agent-skills';
import type { PluginAgentSkill } from '../../types/plugin-sdk.types';

const skill = (over: Partial<PluginAgentSkill> = {}): PluginAgentSkill => ({
  name: 'bass-voices',
  description: 'How the bass generator voices sub, reese, acid and 808 basslines.',
  body: 'Lock the bass to the kick. Realize it with {{action:generate_bassline}}.',
  relatedActions: ['generate_bassline'],
  ...over,
});

describe('isValidAgentSkillName', () => {
  it('accepts kebab-case and rejects everything else', () => {
    expect(isValidAgentSkillName('beat-construction')).toBe(true);
    expect(isValidAgentSkillName('genre-drum-and-bass')).toBe(true);
    expect(isValidAgentSkillName('Beat-Construction')).toBe(false);
    expect(isValidAgentSkillName('beat_construction')).toBe(false);
    expect(isValidAgentSkillName('-beat')).toBe(false);
    expect(isValidAgentSkillName('')).toBe(false);
    expect(isValidAgentSkillName('a'.repeat(AGENT_SKILL_LIMITS.nameMaxChars + 1))).toBe(false);
  });
});

describe('action tokens', () => {
  const body = 'Use {{action:generate_bassline}} then {{ action: shuffle_bass }}; again {{action:generate_bassline}}.';

  it('extracts ids in first-seen order, deduplicated', () => {
    expect(extractAgentSkillActionTokens(body)).toEqual(['generate_bassline', 'shuffle_bass']);
  });

  it('rewrites every token to the registered plugin tool name', () => {
    expect(resolveAgentSkillActionTokens(body, '@signalsandsorcery/bass-generator')).toBe(
      'Use plugin:@signalsandsorcery/bass-generator:generate_bassline then ' +
        'plugin:@signalsandsorcery/bass-generator:shuffle_bass; again ' +
        'plugin:@signalsandsorcery/bass-generator:generate_bassline.',
    );
  });

  it('leaves a body without tokens unchanged', () => {
    expect(resolveAgentSkillActionTokens('plain {{notAToken}} text', '@x/y')).toBe('plain {{notAToken}} text');
  });
});

describe('validatePluginAgentSkill', () => {
  it('passes a well-formed skill', () => {
    expect(validatePluginAgentSkill(skill(), { actionIds: ['generate_bassline'] })).toEqual([]);
  });

  it('flags a bad name, a missing or overlong description, and a multi-line description', () => {
    expect(validatePluginAgentSkill(skill({ name: 'Bass Voices' })).join('\n')).toMatch(/kebab-case/);
    expect(validatePluginAgentSkill(skill({ description: '' })).join('\n')).toMatch(/description is required/);
    expect(
      validatePluginAgentSkill(skill({ description: 'x'.repeat(AGENT_SKILL_LIMITS.descriptionMaxChars + 1) })).join('\n'),
    ).toMatch(/description is \d+ chars/);
    expect(validatePluginAgentSkill(skill({ description: 'one\ntwo' })).join('\n')).toMatch(/one line/);
  });

  it('flags a missing or overlong body', () => {
    expect(validatePluginAgentSkill(skill({ body: '  ' })).join('\n')).toMatch(/body is required/);
    expect(
      validatePluginAgentSkill(skill({ body: 'x'.repeat(AGENT_SKILL_LIMITS.pluginBodyMaxChars + 1) })).join('\n'),
    ).toMatch(/body is \d+ chars/);
  });

  it('checks tokens and relatedActions against the declared actions only when given', () => {
    const bad = skill({ body: 'Call {{action:generate_melody}}.', relatedActions: ['nope'] });
    expect(validatePluginAgentSkill(bad)).toEqual([]);
    const problems = validatePluginAgentSkill(bad, { actionIds: ['generate_bassline'] });
    expect(problems).toHaveLength(2);
    expect(problems.join('\n')).toMatch(/unknown action \{\{action:generate_melody\}\}/);
    expect(problems.join('\n')).toMatch(/relatedActions names unknown action 'nope'/);
  });
});

describe('validatePluginAgentSkills', () => {
  it('flags duplicate names and the per-plugin count limit', () => {
    const many = Array.from({ length: AGENT_SKILL_LIMITS.maxSkillsPerPlugin + 1 }, (_, i) =>
      skill({ name: `bass-skill-${i}` }),
    );
    expect(validatePluginAgentSkills(many).join('\n')).toMatch(/max \d+ per plugin/);
    expect(validatePluginAgentSkills([skill(), skill()]).join('\n')).toMatch(/duplicate skill name/);
    expect(validatePluginAgentSkills([skill()])).toEqual([]);
  });
});
