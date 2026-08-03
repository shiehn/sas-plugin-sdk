import { generationBlockedBy } from '../panel-helpers';

describe('generationBlockedBy — prompt and auth are separate gates', () => {
  const normal = {};
  const promptless = { promptlessGeneration: true };
  const local = { localGeneration: true };

  it('blocks an ordinary family on an empty prompt', () => {
    expect(generationBlockedBy(normal, '   ', true)).toBe('prompt');
  });

  it('blocks an ordinary family on sign-in', () => {
    expect(generationBlockedBy(normal, 'a bassline', false)).toBe('auth');
  });

  it('lets an ordinary family through when prompted and signed in', () => {
    expect(generationBlockedBy(normal, 'a bassline', true)).toBeNull();
  });

  /**
   * The regression this split exists for: a promptless family still calls the
   * model, so it must still require sign-in. Conflated, it fell through to an
   * unexplained failure.
   */
  it('still requires sign-in for a promptless family', () => {
    expect(generationBlockedBy(promptless, '', false)).toBe('auth');
  });

  it('waives only the prompt for a promptless family', () => {
    expect(generationBlockedBy(promptless, '', true)).toBeNull();
  });

  it('waives sign-in only when generation is local', () => {
    expect(generationBlockedBy({ ...promptless, ...local }, '', false)).toBeNull();
  });

  it('a local family with a prompt box still needs a prompt', () => {
    expect(generationBlockedBy(local, '', false)).toBe('prompt');
  });
});
