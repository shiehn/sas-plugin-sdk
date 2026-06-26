/**
 * Transition Designer — pure helpers for the per-panel transition staging board.
 *
 * The designer is the multi-row, persistent successor to CrossfadeModal/FadeModal:
 * it lays out ONE panel-family's origin (scene A) and target (scene B) source
 * tracks as two index-aligned, drag-reorderable columns. Row i pairs the origin
 * slot at index i with the target slot at index i, and the pairing DERIVES the
 * transition type:
 *   - both filled            → crossfade (morph A→B)
 *   - origin filled, target blank → fade out (the track leaves)
 *   - target filled, origin blank → fade in  (the track enters)
 * A slot may be a source-track dbId or `null` (a blank spacer). Blanks let the
 * user open a gap so a mid-list track becomes a fade instead of crossfading with
 * whatever happens to sit opposite it (the CSV-style layout).
 *
 * The "available pool" per column is the scene's family tracks MINUS the sources
 * already consumed by a committed crossfade/fade (excludeSourceDbIds). Creating a
 * row reuses the panel's existing crossfade/fade orchestration; deleting the
 * committed crossfade/fade on the deck returns its source to the pool.
 *
 * This module owns only the shape + the pure slot/row math so it can be unit
 * tested without a DOM and can't drift across the three panels. The component
 * (TransitionDesigner.tsx) owns the overlay, drag wiring, and persistence.
 *
 * @since SDK 2.29.0
 */

/**
 * Persisted per-transition-scene draft: the two columns' slot orders. A slot is
 * a source-track dbId, or `null` for a blank spacer (an intentional gap). Stored
 * in the transition scene's plugin_data under {@link TRANSITION_DESIGNER_DRAFT_KEY};
 * because plugin_data is scoped by (plugin_id, sceneId), each panel family keeps
 * its own draft automatically.
 */
export interface TransitionDesignerDraft {
  /** Origin (scene A) column order — dbIds or `null` blanks. */
  originOrder: (string | null)[];
  /** Target (scene B) column order — dbIds or `null` blanks. */
  targetOrder: (string | null)[];
  /** Per one-sided-row audio effect, keyed by the source dbId. @since SDK 2.32.0 */
  rowEffects?: Record<string, AudioEffect>;
}

/** scene-data key (under the transition scene) holding the staged draft. */
export const TRANSITION_DESIGNER_DRAFT_KEY = 'transitionDesigner:draft';

/** The transition a single aligned row represents (derived from its two slots). */
export type TransitionRowType = 'crossfade' | 'fade-out' | 'fade-in';

/**
 * Audio-only transition gesture for a ONE-SIDED (orphan) loop. `'fade'` is the
 * default level ramp (works for any family); `stutter`/`chopped`/`delay` are
 * audio panels only, surfaced via the row's effect selector when the panel
 * passes `onCreateAudioTransition`. @since SDK 2.32.0
 */
export type AudioEffect = 'fade' | 'stutter' | 'chopped' | 'delay';
export const AUDIO_EFFECTS: readonly AudioEffect[] = ['fade', 'stutter', 'chopped', 'delay'];
export const AUDIO_EFFECT_LABEL: Record<AudioEffect, string> = {
  fade: 'Fade',
  stutter: 'Stutter',
  chopped: 'Chopped',
  delay: 'Delay',
};
export function asAudioEffect(v: unknown): AudioEffect | null {
  return v === 'fade' || v === 'stutter' || v === 'chopped' || v === 'delay' ? v : null;
}

/** Derive a row's transition type from which slots are filled. `null` = empty row. */
export function rowType(hasOrigin: boolean, hasTarget: boolean): TransitionRowType | null {
  if (hasOrigin && hasTarget) return 'crossfade';
  if (hasOrigin) return 'fade-out';
  if (hasTarget) return 'fade-in';
  return null;
}

/** Narrow an unknown scene-data value to a TransitionDesignerDraft (defensive). */
export function asTransitionDesignerDraft(val: unknown): TransitionDesignerDraft | null {
  if (!val || typeof val !== 'object') return null;
  const d = val as Partial<TransitionDesignerDraft>;
  const clean = (a: unknown): (string | null)[] =>
    Array.isArray(a)
      ? (a.filter((x) => x === null || typeof x === 'string') as (string | null)[])
      : [];
  const cleanEffects = (e: unknown): Record<string, AudioEffect> => {
    const out: Record<string, AudioEffect> = {};
    if (e && typeof e === 'object') {
      for (const [k, v] of Object.entries(e as Record<string, unknown>)) {
        const eff = asAudioEffect(v);
        if (eff) out[k] = eff;
      }
    }
    return out;
  };
  return {
    originOrder: clean(d.originOrder),
    targetOrder: clean(d.targetOrder),
    rowEffects: cleanEffects(d.rowEffects),
  };
}

/**
 * Reconcile a saved slot order against the current pool of available source ids:
 * - keep saved ids still in the pool (in their saved position),
 * - keep `null` blanks,
 * - drop ids no longer in the pool (consumed by a created crossfade/fade, or the
 *   source track was deleted) and any duplicates,
 * - append pool ids missing from the saved order (newly added tracks) at the end.
 *
 * Pure; exported for unit testing.
 */
export function reconcileSlots(
  saved: readonly (string | null)[] | undefined,
  poolIds: readonly string[],
): (string | null)[] {
  const pool = new Set(poolIds);
  const seen = new Set<string>();
  const out: (string | null)[] = [];
  for (const slot of saved ?? []) {
    if (slot === null) {
      out.push(null);
      continue;
    }
    if (pool.has(slot) && !seen.has(slot)) {
      out.push(slot);
      seen.add(slot);
    }
  }
  for (const id of poolIds) {
    if (!seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  return out;
}

/** One assembled designer row: the two source dbIds (or `null`) + derived type. */
export interface DesignerRowSlots {
  originId: string | null;
  targetId: string | null;
  type: TransitionRowType | null;
}

/** Zip two slot columns into index-aligned rows with their derived type. */
export function buildRowSlots(
  originSlots: readonly (string | null)[],
  targetSlots: readonly (string | null)[],
): DesignerRowSlots[] {
  const n = Math.max(originSlots.length, targetSlots.length);
  const rows: DesignerRowSlots[] = [];
  for (let i = 0; i < n; i++) {
    const originId = originSlots[i] ?? null;
    const targetId = targetSlots[i] ?? null;
    rows.push({ originId, targetId, type: rowType(originId !== null, targetId !== null) });
  }
  return rows;
}

/**
 * Tidy the columns for persistence: drop rows where BOTH slots are blank (a
 * meaningless gap) and trim trailing blanks per column. Returns clean columns
 * suitable for {@link TransitionDesignerDraft}.
 */
export function normalizeSlots(
  originSlots: readonly (string | null)[],
  targetSlots: readonly (string | null)[],
): TransitionDesignerDraft {
  const rows = buildRowSlots(originSlots, targetSlots).filter(
    (r) => r.originId !== null || r.targetId !== null,
  );
  const trimTrailing = (a: (string | null)[]): (string | null)[] => {
    let end = a.length;
    while (end > 0 && a[end - 1] === null) end--;
    return a.slice(0, end);
  };
  return {
    originOrder: trimTrailing(rows.map((r) => r.originId)),
    targetOrder: trimTrailing(rows.map((r) => r.targetId)),
  };
}

/** Pad a column with trailing `null`s up to `n` (so both columns render aligned). */
export function padSlots(slots: readonly (string | null)[], n: number): (string | null)[] {
  if (slots.length >= n) return slots.slice();
  return [...slots, ...new Array<null>(n - slots.length).fill(null)];
}

/** Pad both columns to equal length (= the longer column). */
export function padPair(
  originSlots: readonly (string | null)[],
  targetSlots: readonly (string | null)[],
): [(string | null)[], (string | null)[]] {
  const n = Math.max(originSlots.length, targetSlots.length);
  return [padSlots(originSlots, n), padSlots(targetSlots, n)];
}

/** Shallow element-wise equality for two slot columns. */
export function slotsEqual(a: readonly (string | null)[], b: readonly (string | null)[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Stable key identifying an in-flight create, derived from the row's SOURCE dbIds
 * (not its row index) — so reordering or inserting a gap mid-create still maps the
 * progress indicator to the right row, and concurrent creates never collide. dbIds
 * are UUIDs, so `|` is a safe origin/target separator. `null` for an empty row.
 *
 * @since SDK 2.30.0
 */
export function rowKey(row: DesignerRowSlots): string | null {
  if (row.type === 'crossfade') return `xf:${row.originId}|${row.targetId}`;
  if (row.type === 'fade-out') return `fo:${row.originId}`;
  if (row.type === 'fade-in') return `fi:${row.targetId}`;
  return null;
}

/**
 * The set of source dbIds referenced by a collection of in-flight {@link rowKey}s —
 * used to lock those cells (no drag / gap edits) while their create runs.
 *
 * @since SDK 2.30.0
 */
export function dbIdsFromKeys(keys: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const k of keys) {
    const body = k.slice(3); // strip the 3-char "xf:" / "fo:" / "fi:" tag
    if (k.startsWith('xf:')) {
      const sep = body.indexOf('|');
      out.add(body.slice(0, sep));
      out.add(body.slice(sep + 1));
    } else {
      out.add(body);
    }
  }
  return out;
}
