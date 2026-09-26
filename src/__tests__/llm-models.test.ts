import { LLM_MODEL } from '../constants/llm-models';
import { LLM_MODEL as exported } from '../index';

describe('LLM_MODEL role aliases', () => {
  it('are roles, never Google model ids', () => {
    for (const value of Object.values(LLM_MODEL)) {
      expect(value).not.toMatch(/^(gemini|lyria)-/);
      expect(value).toMatch(/^[a-z]+$/);
    }
  });

  it('are exported from the SDK root', () => {
    expect(exported).toBe(LLM_MODEL);
  });
});
