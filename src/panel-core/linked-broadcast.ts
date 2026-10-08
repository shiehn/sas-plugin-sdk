/**
 * Linked-group broadcast runner — the progress/outcome bookkeeping shared by
 * the core's sound and instrument broadcasts (@since SDK 2.49.0).
 *
 * Applying a preset (or instrument) across a linked group is SERIAL and each
 * per-track apply is an engine round-trip with a large state blob, so a
 * 4–6 part group takes long enough that the UI must say something. This
 * runner owns the observable contract:
 *
 *   - `onProgress` fires with `{done: 0, total}` before the first apply,
 *     after EVERY target (success or failure), and `null` once the run ends
 *     (always — a throwing target cannot leave the progress stuck).
 *   - one completion toast per run: success when every target applied,
 *     the pre-2.49 partial warning ("… applied to some parts only",
 *     `Skipped: …`) when some failed.
 *   - per-target failures never abort the run (a frozen sibling with missing
 *     plugins refuses via the host's freeze gate — warn + continue).
 *
 * Pure with respect to React/host: callers inject apply/progress/toast, which
 * is also what makes the contract unit-testable from the plugin repos (the
 * SDK carries no jest of its own).
 */

export interface GroupBroadcastProgress {
  /** What is being propagated. */
  kind: 'sound' | 'instrument';
  /** Human label of the propagated sound/instrument (preset name, plugin id). */
  label: string;
  /** Linked targets in this run (the source track is never counted). */
  total: number;
  /** Targets attempted so far, successes and failures alike. */
  done: number;
  /**
   * 'verifying' once every target is applied and the run is waiting for the
   * engine's verdicts (`verifyTarget`, @since SDK 3.22.0). Absent = applying.
   */
  phase?: 'verifying';
}

/**
 * Did a target's plugin actually load what was applied (@since SDK 3.22.0)?
 * 'unknown' covers a timeout, an engine that can't tell, or a host without
 * `awaitStateApplied` — all treated as applied, exactly as before.
 */
export type LinkedApplyVerdict = 'verified' | 'not_applied' | 'unknown';

/**
 * How long the linked broadcast waits for each part's verdict (@since SDK 3.22.0).
 * The engine judges ~20 s after a write, and serial writes queue (~0.55 s per
 * 2 MB Kontakt part): a 15-voice "→ All" judges its last part at ~28 s. Passed
 * explicitly so a host's default can never turn a real miss into 'timeout'.
 */
export const LINKED_APPLY_VERDICT_TIMEOUT_MS = 45_000;

export interface LinkedBroadcastTarget {
  engineId: string;
  label?: string;
}

export interface RunLinkedBroadcastOptions<T extends LinkedBroadcastTarget> {
  kind: GroupBroadcastProgress['kind'];
  /** Label shown in progress UI + toasts (preset name / plugin id). */
  label: string;
  /** Linked siblings to apply to — pre-filtered, source excluded. */
  targets: readonly T[];
  /** Apply to ONE target; a throw marks that target failed and the run continues. */
  applyToTarget(target: T): Promise<void>;
  /** Progress sink; receives null when the run ends. */
  onProgress(progress: GroupBroadcastProgress | null): void;
  /** Completion toast sink (host.showToast-compatible). */
  showToast(type: 'success' | 'warning', title: string, message?: string): void;
  /** Per-target failure logger (label-or-id + error). */
  onTargetError?(target: T, err: unknown): void;
  /**
   * The engine's verdict for one applied target (@since SDK 3.22.0). Started
   * right after that target's apply resolves, so the verdicts are awaited in
   * PARALLEL while the remaining targets apply one after another. A
   * 'not_applied' target is re-applied ONCE (`reapplyTarget`), and if it is
   * still 'not_applied' it counts as FAILED (named in the "some parts only"
   * toast). Absent = no verification (the pre-3.22 behaviour).
   */
  verifyTarget?(target: T): Promise<LinkedApplyVerdict>;
  /**
   * The re-apply for a 'not_applied' target. Default `applyToTarget`; pass
   * just the state write when `applyToTarget` also records history or
   * persists identity, so a retry doesn't repeat those.
   */
  reapplyTarget?(target: T): Promise<void>;
}

export interface LinkedBroadcastResult {
  /** engineIds that applied cleanly. */
  appliedIds: Set<string>;
  /** Display labels (or engineIds) of targets that failed. */
  failed: string[];
}

export async function runLinkedBroadcast<T extends LinkedBroadcastTarget>(
  options: RunLinkedBroadcastOptions<T>,
): Promise<LinkedBroadcastResult> {
  const { kind, label, targets, applyToTarget, onProgress, showToast, onTargetError, verifyTarget } = options;
  const reapply = options.reapplyTarget ?? applyToTarget;
  const appliedIds = new Set<string>();
  const failedIds = new Set<string>();
  if (targets.length === 0) {
    return { appliedIds, failed: [] };
  }

  // A verdict that throws is no verdict: 'unknown' (applied, as before).
  const verdictOf = (target: T): Promise<LinkedApplyVerdict> =>
    verifyTarget ? verifyTarget(target).catch((): LinkedApplyVerdict => 'unknown') : Promise.resolve('unknown');
  const fail = (target: T, err: unknown): void => {
    failedIds.add(target.engineId);
    onTargetError?.(target, err);
  };

  const noun = kind === 'sound' ? 'Linked sound' : 'Instrument';
  const total = targets.length;
  let done = 0;
  onProgress({ kind, label, total, done });
  try {
    // Apply one target at a time; start each verdict as soon as its apply
    // resolves, so the waits overlap the remaining applies.
    const verdicts = new Map<T, Promise<LinkedApplyVerdict>>();
    for (const target of targets) {
      try {
        await applyToTarget(target);
        if (verifyTarget) verdicts.set(target, verdictOf(target));
      } catch (err: unknown) {
        fail(target, err);
      }
      done++;
      onProgress({ kind, label, total, done });
    }

    if (verdicts.size > 0) {
      onProgress({ kind, label, total, done, phase: 'verifying' });
      const firstPass = await settle(verdicts);
      // Re-apply each part the plugin ignored ONCE, then judge it again.
      const retried = new Map<T, Promise<LinkedApplyVerdict>>();
      for (const [target, verdict] of firstPass) {
        if (verdict !== 'not_applied') continue;
        try {
          await reapply(target);
          retried.set(target, verdictOf(target));
        } catch (err: unknown) {
          fail(target, err);
        }
      }
      for (const [target, verdict] of await settle(retried)) {
        if (verdict === 'not_applied') {
          fail(target, new Error(`STATE_NOT_APPLIED: ${target.label ?? target.engineId} did not load the state (re-applied once)`));
        }
      }
    }
  } finally {
    onProgress(null);
  }

  for (const target of targets) {
    if (!failedIds.has(target.engineId)) appliedIds.add(target.engineId);
  }
  const failed = targets.filter((t) => failedIds.has(t.engineId)).map((t) => t.label ?? t.engineId);

  if (failed.length > 0) {
    showToast('warning', `${noun} applied to some parts only`, `Skipped: ${failed.join(', ')}`);
  } else {
    const parts = `${targets.length} part${targets.length === 1 ? '' : 's'}`;
    showToast('success', `${noun} applied to all parts`, `${label} → ${parts}`);
  }
  return { appliedIds, failed };
}

/** Await every pending verdict; the map's order (apply order) is kept. */
async function settle<T>(pending: Map<T, Promise<LinkedApplyVerdict>>): Promise<Array<[T, LinkedApplyVerdict]>> {
  const entries = Array.from(pending.entries());
  const verdicts = await Promise.all(entries.map(([, p]) => p));
  return entries.map(([target], i) => [target, verdicts[i]]);
}
