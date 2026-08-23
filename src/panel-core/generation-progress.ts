/**
 * Generation-turn progress — the lifecycle + step-reporting contract shared
 * by every generator panel built on the panel-core (@since SDK 3.11.0).
 *
 * A generation turn (LLM compose → create tracks → write clips → choose
 * sounds → save metas) runs 15–110 s, so the row's progress overlay must say
 * something real. This runner owns the observable contract, mirroring
 * `runLinkedBroadcast`:
 *
 *   - the well-known `started` step is emitted before the strategy runs, so
 *     every panel-core panel gets an explicit "started" lifecycle even when
 *     its strategy reports nothing;
 *   - each strategy report REPLACES the current step (labels are transient
 *     display state, never history);
 *   - `onStep(null)` fires once the turn ends (always — a throwing strategy
 *     cannot leave a stale label), and the strategy's error is rethrown for
 *     the core's catch (error patch + toast). "Completed" and "failed" are
 *     therefore implicit: cleared step + the core's `isGenerating`/`error`
 *     patches.
 *
 * Pure with respect to React/host: callers inject the sink and body, which
 * keeps the contract unit-testable without a panel.
 */

/** One reported step of a generation turn. @since SDK 3.11.0 */
export interface GenerationStep {
  /**
   * Machine id of the pipeline stage, e.g. 'compose' | 'create-tracks' |
   * 'choose-sounds'. 'started' is reserved for the core-emitted opening step.
   */
  stage: string;
  /** Display text (arcane all-caps, matching the bar), e.g. 'CHOOSING SOUNDS'. */
  label: string;
  /**
   * When BOTH are present, renderers append " (done/total)" via
   * stepStatusText. Display-only — a stage-internal fraction is not the whole
   * turn's fraction, so it never positions the bar; use percentFloor for that.
   */
  done?: number;
  total?: number;
  /**
   * 0–95. Lifts the time-eased progress bar to at least this value. The bar
   * is monotonic, so a lower floor reported later simply does nothing.
   */
  percentFloor?: number;
}

/**
 * The opening step the core emits before a strategy runs. Byte-identical to
 * the pre-3.11 hardcoded overlay text, so un-instrumented panels look
 * exactly as they always did.
 */
export const GENERATION_STARTED_STEP: GenerationStep = {
  stage: 'started',
  label: 'CONJURING MIDI...',
};

/**
 * "LABEL (3/6)" when done+total are both present, the label alone otherwise,
 * undefined for a null/absent step (callers fall back to their default text).
 */
export function stepStatusText(step: GenerationStep | null | undefined): string | undefined {
  if (!step) return undefined;
  return step.done != null && step.total != null
    ? `${step.label} (${step.done}/${step.total})`
    : step.label;
}

export interface RunGenerationTurnOptions {
  /**
   * Step sink — the core binds this to the prompted track's `generationStep`
   * field. Receives null once the turn ends (always, success or throw).
   */
  onStep(step: GenerationStep | null): void;
  /**
   * The strategy body; receives the bound reporter to hand into
   * GenerationServices. The reporter never accepts null — only the runner
   * clears.
   */
  run(reportStep: (step: GenerationStep) => void): Promise<void>;
  /** Emitted before run(); defaults to GENERATION_STARTED_STEP. */
  startedStep?: GenerationStep;
}

/**
 * Run one generation turn under the step-reporting lifecycle: emit the
 * started step, run the strategy, null-clear in a finally (rethrowing any
 * strategy error after clearing).
 */
export async function runGenerationTurn(opts: RunGenerationTurnOptions): Promise<void> {
  const { onStep, run, startedStep = GENERATION_STARTED_STEP } = opts;
  onStep(startedStep);
  try {
    await run((step: GenerationStep): void => onStep(step));
  } finally {
    onStep(null);
  }
}
