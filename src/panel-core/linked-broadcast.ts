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
}

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
  const { kind, label, targets, applyToTarget, onProgress, showToast, onTargetError } = options;
  const appliedIds = new Set<string>();
  const failed: string[] = [];
  if (targets.length === 0) {
    return { appliedIds, failed };
  }

  const noun = kind === 'sound' ? 'Linked sound' : 'Instrument';
  let done = 0;
  onProgress({ kind, label, total: targets.length, done });
  try {
    for (const target of targets) {
      try {
        await applyToTarget(target);
        appliedIds.add(target.engineId);
      } catch (err: unknown) {
        failed.push(target.label ?? target.engineId);
        onTargetError?.(target, err);
      }
      done++;
      onProgress({ kind, label, total: targets.length, done });
    }
  } finally {
    onProgress(null);
  }

  if (failed.length > 0) {
    showToast('warning', `${noun} applied to some parts only`, `Skipped: ${failed.join(', ')}`);
  } else {
    const parts = `${targets.length} part${targets.length === 1 ? '' : 's'}`;
    showToast('success', `${noun} applied to all parts`, `${label} → ${parts}`);
  }
  return { appliedIds, failed };
}
