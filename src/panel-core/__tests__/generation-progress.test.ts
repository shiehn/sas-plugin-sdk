import {
  runGenerationTurn,
  stepStatusText,
  GENERATION_STARTED_STEP,
  type GenerationStep,
} from '../generation-progress';

describe('stepStatusText — display formatting', () => {
  it('returns undefined for null/undefined (callers fall back to their default)', () => {
    expect(stepStatusText(null)).toBeUndefined();
    expect(stepStatusText(undefined)).toBeUndefined();
  });

  it('renders the label alone when counts are absent', () => {
    expect(stepStatusText({ stage: 'compose', label: 'COMPOSING 4 VOICES...' })).toBe(
      'COMPOSING 4 VOICES...',
    );
  });

  it('appends "(done/total)" only when BOTH counts are present', () => {
    expect(stepStatusText({ stage: 'choose-sounds', label: 'CHOOSING SOUNDS', done: 3, total: 6 })).toBe(
      'CHOOSING SOUNDS (3/6)',
    );
    expect(stepStatusText({ stage: 'x', label: 'X', done: 3 })).toBe('X');
    expect(stepStatusText({ stage: 'x', label: 'X', total: 6 })).toBe('X');
  });

  it('renders a zero count (loop-top reporting starts at 0/N)', () => {
    expect(stepStatusText({ stage: 'create-tracks', label: 'CREATING VOICE TRACKS', done: 0, total: 3 })).toBe(
      'CREATING VOICE TRACKS (0/3)',
    );
  });
});

describe('runGenerationTurn — lifecycle contract', () => {
  const record = (): { steps: Array<GenerationStep | null>; onStep: (s: GenerationStep | null) => void } => {
    const steps: Array<GenerationStep | null> = [];
    return { steps, onStep: (s: GenerationStep | null): void => { steps.push(s); } };
  };

  it('emits the started step BEFORE the strategy runs, then null-clears after', async () => {
    const { steps, onStep } = record();
    let stepsAtRunStart: number | null = null;
    await runGenerationTurn({
      onStep,
      run: async () => {
        stepsAtRunStart = steps.length;
      },
    });
    expect(stepsAtRunStart).toBe(1);
    expect(steps).toEqual([GENERATION_STARTED_STEP, null]);
  });

  it('forwards strategy reports in order between started and the final null', async () => {
    const { steps, onStep } = record();
    const a: GenerationStep = { stage: 'compose', label: 'COMPOSING...' };
    const b: GenerationStep = { stage: 'save', label: 'SAVING...', percentFloor: 92 };
    await runGenerationTurn({
      onStep,
      run: async (reportStep) => {
        reportStep(a);
        reportStep(b);
      },
    });
    expect(steps).toEqual([GENERATION_STARTED_STEP, a, b, null]);
  });

  /**
   * The regression this runner exists for: a throwing strategy must still
   * null-clear (no stale label, no stuck overlay) AND rethrow so the core's
   * catch shows the error patch + toast.
   */
  it('null-clears in a finally on throw and rethrows the strategy error', async () => {
    const { steps, onStep } = record();
    const boom = new Error('LLM unavailable');
    await expect(
      runGenerationTurn({
        onStep,
        run: async (reportStep) => {
          reportStep({ stage: 'compose', label: 'COMPOSING...' });
          throw boom;
        },
      }),
    ).rejects.toBe(boom);
    expect(steps[steps.length - 1]).toBeNull();
    expect(steps).toHaveLength(3);
  });

  it('honors a custom startedStep', async () => {
    const { steps, onStep } = record();
    const custom: GenerationStep = { stage: 'started', label: 'CONJURING BEAT...' };
    await runGenerationTurn({ onStep, run: async () => {}, startedStep: custom });
    expect(steps).toEqual([custom, null]);
  });

  it('default started step matches the pre-3.11 hardcoded overlay text', () => {
    expect(GENERATION_STARTED_STEP).toEqual({ stage: 'started', label: 'CONJURING MIDI...' });
  });
});
