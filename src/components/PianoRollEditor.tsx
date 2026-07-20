/**
 * PianoRollEditor — a compact, DOM-based MIDI note editor for the track drawer.
 *
 * Controlled: `notes` in, `onChange(next)` out. Notes render as absolutely-
 * positioned divs over a beat/pitch grid (DOM, not canvas — so it themes with
 * sas-* tokens and is fully driveable by React Testing Library). Supports:
 *   - add     : click an empty grid cell
 *   - delete  : click an existing note (no drag)
 *   - move    : drag a note's body (snap-quantised)
 *   - resize  : drag a note's right-edge handle (snap-quantised, ≥ one step)
 *   - octave  : shift the whole clip ±12 (toolbar) — no velocity lane
 *               / marquee yet.
 * On load the viewport auto-scrolls to vertically center the note cluster, so a
 * low melody isn't stranded off-screen at the bottom of the pitch range.
 *
 * Coordinate spaces:
 *   pitch (0-127)  ── row = hi - pitch ──  top px  = row * ROW_HEIGHT
 *   beat (¼ notes) ─────────────────────── left px = beat * pxPerBeat
 * where pxPerBeat is the EFFECTIVE horizontal scale: at least PX_PER_BEAT
 * (long clips overflow into a horizontal scroll), stretched up so short clips
 * fill the viewport width (see effectivePxPerBeat).
 *
 * The pure helpers (`cellToPx` / `pxToCell` / `transposeNotes`) and layout
 * constants are exported so coordinate math can be unit-tested without a DOM.
 */
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PluginMidiNote } from '../types/plugin-sdk.types';

// ============================================================================
// Layout constants (exported for tests)
// ============================================================================

/**
 * MINIMUM horizontal pixels per quarter-note beat. The grid never renders
 * tighter than this (long clips overflow into a horizontal scroll), but it
 * stretches beyond it to fill the container when the clip is short — see
 * {@link effectivePxPerBeat}.
 */
export const PX_PER_BEAT = 24;
/** Vertical pixels per semitone row. */
export const ROW_HEIGHT = 12;
/** Left keyboard-gutter width (px). */
export const GUTTER_W = 28;
/** Pointer travel (px) before a press on a note becomes a drag instead of a click. */
export const DRAG_DEAD_ZONE = 4;
/** Width (px) of the right-edge grab handle that resizes a note's length. */
export const RESIZE_HANDLE_PX = 6;
/** Max height (px) of the vertical scroll viewport — drives load-time centering. */
export const SCROLL_MAX_H = 150;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

const SNAP_LABELS: Record<string, string> = {
  '2': '1/2',
  '1': '1/4',
  '0.5': '1/8',
  '0.25': '1/16',
  '0.125': '1/32',
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function snapLabel(s: number): string {
  return SNAP_LABELS[String(s)] ?? `${s}`;
}

// ============================================================================
// Pure helpers (DOM-free, exported for unit tests)
// ============================================================================

/**
 * Pixels per beat for a grid of `totalBeats` inside a `containerWidth`-px
 * scroll viewport (which also holds the {@link GUTTER_W} keyboard gutter).
 * Fills the available width when the clip is short; never drops below
 * {@link PX_PER_BEAT}, so long clips overflow into a horizontal scroll.
 * An unknown/unmeasured container (≤ gutter width) yields the minimum.
 */
export function effectivePxPerBeat(containerWidth: number, totalBeats: number): number {
  if (totalBeats <= 0) return PX_PER_BEAT;
  const available = containerWidth - GUTTER_W;
  if (available <= 0) return PX_PER_BEAT;
  return Math.max(PX_PER_BEAT, available / totalBeats);
}

/** MIDI pitch → scientific note name (60 = C4). */
export function pitchToName(pitch: number): string {
  const name = NOTE_NAMES[((pitch % 12) + 12) % 12];
  const octave = Math.floor(pitch / 12) - 1;
  return `${name}${octave}`;
}

/**
 * Cell (pitch, startBeat) → top-left pixel offset within the grid.
 * `hi` is the highest (top) visible pitch. `pxPerBeat` is the effective
 * (possibly stretched) horizontal scale; defaults to the minimum.
 */
export function cellToPx(
  pitch: number,
  startBeat: number,
  hi: number,
  pxPerBeat: number = PX_PER_BEAT,
): { left: number; top: number } {
  return { left: startBeat * pxPerBeat, top: (hi - pitch) * ROW_HEIGHT };
}

/**
 * Grid-local pixel → snapped cell. `hi` is the highest visible pitch; the beat
 * snaps to the nearest `snap` step and clamps to `[0, totalBeats - snap]`;
 * pitch clamps to `[0, 127]`.
 */
export function pxToCell(
  localX: number,
  localY: number,
  hi: number,
  snap: number,
  bars: number,
  beatsPerBar: number,
  pxPerBeat: number = PX_PER_BEAT,
): { pitch: number; startBeat: number } {
  const totalBeats = bars * beatsPerBar;
  const pitch = clamp(hi - Math.floor(localY / ROW_HEIGHT), 0, 127);
  const rawBeat = localX / pxPerBeat;
  const snapped = Math.round(rawBeat / snap) * snap;
  const startBeat = clamp(snapped, 0, Math.max(0, totalBeats - snap));
  return { pitch, startBeat };
}

/**
 * New `durationBeats` for a note whose right edge is dragged to grid-local pixel
 * `localX`. The end snaps to the nearest `snap` step, is clamped to at least one
 * step past `startBeat`, and never extends beyond the grid's right edge
 * (`bars * beatsPerBar`). `startBeat` and `pitch` are untouched.
 */
export function resizeNoteDuration(
  startBeat: number,
  localX: number,
  snap: number,
  bars: number,
  beatsPerBar: number,
  pxPerBeat: number = PX_PER_BEAT,
): number {
  const totalBeats = bars * beatsPerBar;
  const snappedEnd = Math.round(localX / pxPerBeat / snap) * snap;
  const end = clamp(snappedEnd, startBeat + snap, totalBeats);
  return end - startBeat;
}

/**
 * `scrollTop` that vertically centers the bulk of the notes in a `viewportH`-px
 * window. Targets the MEDIAN pitch (robust to a stray high/low outlier — keeps
 * "where the majority of notes are" framed) and clamps to the valid scroll
 * range. `hi` is the top visible pitch; `rowCount` the total rows in the grid.
 * Returns 0 when there are no notes.
 */
export function centerScrollTop(
  pitches: readonly number[],
  hi: number,
  rowCount: number,
  viewportH: number,
): number {
  if (pitches.length === 0) return 0;
  const sorted = [...pitches].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  // Pixel center of the median row, then offset so it lands mid-viewport.
  const medianRowCenterPx = (hi - median) * ROW_HEIGHT + ROW_HEIGHT / 2;
  const maxScroll = Math.max(0, rowCount * ROW_HEIGHT - viewportH);
  return clamp(medianRowCenterPx - viewportH / 2, 0, maxScroll);
}

/** Transpose every note by `semitones`, clamping pitch to [0,127] (never drops a note). */
export function transposeNotes(
  notes: readonly PluginMidiNote[],
  semitones: number,
): PluginMidiNote[] {
  return notes.map((n) => ({ ...n, pitch: clamp(n.pitch + semitones, 0, 127) }));
}

// ============================================================================
// Props
// ============================================================================

export interface PianoRollEditorProps {
  /** Controlled note list (quarter-note beats). The editor never mutates this. */
  notes: readonly PluginMidiNote[];
  /** Emitted on every edit (add / delete / move / transpose) with the full next array. */
  onChange: (next: PluginMidiNote[]) => void;
  /** Scene length in bars → grid width = bars * beatsPerBar * pxPerBeat (min PX_PER_BEAT, stretched to fill). */
  bars: number;
  /** BPM — used only for audition timing in v1. */
  bpm: number;
  /** Beats per bar (time-signature numerator). Default 4. */
  beatsPerBar?: number;
  /** Snap step in quarter notes (1 = ¼ note, 0.25 = 1/16). Default 0.25. */
  snap?: number;
  /** Snap steps the toolbar selector offers. Default [1, 0.5, 0.25]. */
  snapOptions?: number[];
  /** Notified when the user changes snap (the editor still tracks it internally). */
  onSnapChange?: (snap: number) => void;
  /** Lowest pitch always visible. Default C2 (36). */
  minPitch?: number;
  /** Highest pitch always visible. Default C6 (84). */
  maxPitch?: number;
  /** Expand the visible window to include notes outside [minPitch,maxPitch]. Default true. */
  autoFit?: boolean;
  /** Optional single-note preview, fired when a note is added. */
  onAuditionNote?: (pitch: number, velocity: number, durationMs: number) => void;
  /** Velocity for newly-added notes. Default 100. */
  defaultVelocity?: number;
  /** Disable all interaction (e.g. while the track is generating). Default false. */
  disabled?: boolean;
  /** Extra className for the outer container. */
  className?: string;
  /** Test id for the outer container. Default "sdk-piano-roll". */
  testId?: string;
}

interface DragState {
  /**
   * `pending-*` is an undecided press (becomes the matching committed mode once
   * the pointer travels past {@link DRAG_DEAD_ZONE}, else resolves on pointer-up):
   *   pending-note   → drag (move)   |  no travel → delete
   *   pending-resize → resize        |  no travel → delete
   *   pending-add    → (on up) add a note
   */
  mode: 'pending-note' | 'pending-resize' | 'pending-add' | 'drag' | 'resize';
  /** Index into `notes` for a note press; -1 for an empty-grid press. */
  index: number;
  startX: number;
  startY: number;
}

// ============================================================================
// Component
// ============================================================================

export function PianoRollEditor({
  notes,
  onChange,
  bars,
  bpm,
  beatsPerBar = 4,
  snap = 0.25,
  snapOptions = [1, 0.5, 0.25],
  onSnapChange,
  minPitch = 36,
  maxPitch = 84,
  autoFit = true,
  onAuditionNote,
  defaultVelocity = 100,
  disabled = false,
  className,
  testId = 'sdk-piano-roll',
}: PianoRollEditorProps): React.ReactElement {
  const [snapState, setSnapState] = useState(snap);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  // True once we've auto-centered the current note set; re-armed when the notes
  // clear or the user octave-shifts, so the view re-frames only on a fresh load.
  const didCenterRef = useRef(false);

  // Visible pitch window: the default [minPitch, maxPitch], expanded to include
  // any notes that fall outside (± 2 semitones of headroom). Stable + testable.
  const { lo, hi } = useMemo((): { lo: number; hi: number } => {
    if (autoFit && notes.length > 0) {
      const ps = notes.map((n) => n.pitch);
      return {
        lo: Math.max(0, Math.min(minPitch, Math.min(...ps) - 2)),
        hi: Math.min(127, Math.max(maxPitch, Math.max(...ps) + 2)),
      };
    }
    return { lo: minPitch, hi: maxPitch };
  }, [autoFit, notes, minPitch, maxPitch]);

  const rowCount = hi - lo + 1;
  const totalBeats = bars * beatsPerBar;

  // Track the scroll viewport's width so short clips stretch to fill it while
  // long clips keep the PX_PER_BEAT floor and overflow into a horizontal
  // scroll. jsdom / pre-measure renders report 0 → floor scale.
  const [containerW, setContainerW] = useState(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = (): void => setContainerW(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return (): void => ro.disconnect();
  }, []);

  const pxPerBeat = effectivePxPerBeat(containerW, totalBeats);
  const gridWidth = totalBeats * pxPerBeat;
  const gridHeight = rowCount * ROW_HEIGHT;

  // Latest values for the stable pointer handlers — avoids stale closures and
  // handler re-binding (the documented render-loop hazard). Assigned during
  // render so the handlers always read current props/state.
  const stateRef = useRef({
    notes, onChange, snapState, hi, bars, beatsPerBar, defaultVelocity, bpm, onAuditionNote, disabled, pxPerBeat,
  });
  stateRef.current = {
    notes, onChange, snapState, hi, bars, beatsPerBar, defaultVelocity, bpm, onAuditionNote, disabled, pxPerBeat,
  };

  const localCoords = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const rect = gridRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>): void => {
    if (stateRef.current.disabled) return;
    const target = e.target as HTMLElement;
    const noteEl = target.closest('[data-testid="sdk-pr-note"]') as HTMLElement | null;
    const idxAttr = noteEl?.getAttribute('data-index');
    // A press that lands on the note's right-edge handle resizes; anywhere else
    // on the note moves/deletes; empty grid adds.
    const onResizeHandle = idxAttr != null && target.closest('[data-resize-handle]') != null;
    dragRef.current = {
      mode: idxAttr == null ? 'pending-add' : onResizeHandle ? 'pending-resize' : 'pending-note',
      index: idxAttr != null ? Number(idxAttr) : -1,
      startX: e.clientX,
      startY: e.clientY,
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* jsdom / unsupported — drag still works via grid-level handlers */
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag) return;
    const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
    if (dist > DRAG_DEAD_ZONE) {
      if (drag.mode === 'pending-note') drag.mode = 'drag';
      else if (drag.mode === 'pending-resize') drag.mode = 'resize';
    }
    const s = stateRef.current;
    const { x, y } = localCoords(e.clientX, e.clientY);

    if (drag.mode === 'resize') {
      const note = s.notes[drag.index];
      if (!note) return;
      const durationBeats = resizeNoteDuration(note.startBeat, x, s.snapState, s.bars, s.beatsPerBar, s.pxPerBeat);
      if (durationBeats === note.durationBeats) return;
      const next = s.notes.map((n, i) => (i === drag.index ? { ...n, durationBeats } : n));
      s.onChange(next);
      return;
    }

    if (drag.mode !== 'drag') return;
    const { pitch, startBeat } = pxToCell(x, y, s.hi, s.snapState, s.bars, s.beatsPerBar, s.pxPerBeat);
    const next = s.notes.map((n, i) => (i === drag.index ? { ...n, pitch, startBeat } : n));
    s.onChange(next);
  }, [localCoords]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const s = stateRef.current;
    if (s.disabled) return;

    if (drag.mode === 'pending-note' || drag.mode === 'pending-resize') {
      // Pressed a note (body or resize handle) without dragging past the dead
      // zone → treat as a plain click → delete it.
      s.onChange(s.notes.filter((_, i) => i !== drag.index));
      return;
    }
    if (drag.mode === 'pending-add') {
      const { x, y } = localCoords(e.clientX, e.clientY);
      const { pitch, startBeat } = pxToCell(x, y, s.hi, s.snapState, s.bars, s.beatsPerBar, s.pxPerBeat);
      const note: PluginMidiNote = {
        pitch,
        startBeat,
        durationBeats: s.snapState,
        velocity: s.defaultVelocity,
        channel: 0,
      };
      s.onChange([...s.notes, note]);
      s.onAuditionNote?.(pitch, s.defaultVelocity, Math.max(1, s.snapState * (60 / s.bpm) * 1000));
    }
    // mode 'drag' / 'resize' already emitted their final state during pointermove.
  }, [localCoords]);

  const handlePointerCancel = useCallback((): void => {
    dragRef.current = null;
  }, []);

  const handleOctave = useCallback((delta: number): void => {
    const s = stateRef.current;
    if (s.disabled) return;
    // The whole clip jumps an octave — re-frame the view onto its new position.
    didCenterRef.current = false;
    s.onChange(transposeNotes(s.notes, delta));
  }, []);

  const handleSnapChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>): void => {
    const v = Number(e.target.value);
    setSnapState(v);
    onSnapChange?.(v);
  }, [onSnapChange]);

  // Auto-frame the notes on load: the autoFit window already contains every note
  // vertically, but the scroll viewport starts pinned to the top — so a melody
  // sitting low needs a manual scroll to find. Center the note cluster once per
  // load (re-armed on clear / octave-shift), never mid-edit or mid-drag.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (notes.length === 0) {
      didCenterRef.current = false;
      return;
    }
    if (didCenterRef.current || dragRef.current) return;
    didCenterRef.current = true;
    const viewportH = el.clientHeight || SCROLL_MAX_H;
    el.scrollTop = centerScrollTop(
      notes.map((n) => n.pitch),
      hi,
      rowCount,
      viewportH,
    );
  }, [notes, hi, rowCount]);

  // Pitch rows for the keyboard gutter, top (hi) first.
  const rows = useMemo((): number[] => {
    const out: number[] = [];
    for (let p = hi; p >= lo; p--) out.push(p);
    return out;
  }, [hi, lo]);

  // Beat columns + bar columns + row lines, drawn purely in CSS so the only
  // hit-testable DOM in the grid is the notes themselves.
  const gridBg = useMemo((): string => {
    const beatPx = pxPerBeat;
    const barPx = pxPerBeat * beatsPerBar;
    return [
      `repeating-linear-gradient(to right, transparent 0 ${beatPx - 1}px, rgba(255,255,255,0.06) ${beatPx - 1}px ${beatPx}px)`,
      `repeating-linear-gradient(to right, transparent 0 ${barPx - 1}px, rgba(255,255,255,0.16) ${barPx - 1}px ${barPx}px)`,
      `repeating-linear-gradient(to bottom, transparent 0 ${ROW_HEIGHT - 1}px, rgba(255,255,255,0.04) ${ROW_HEIGHT - 1}px ${ROW_HEIGHT}px)`,
    ].join(', ');
  }, [beatsPerBar, pxPerBeat]);

  const octaveDisabled = disabled || notes.length === 0;

  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`} data-testid={testId}>
      {/* Toolbar */}
      <div className="flex items-center gap-1" data-testid="sdk-pr-toolbar">
        <button
          type="button"
          data-testid="sdk-pr-octave-down"
          disabled={octaveDisabled}
          onClick={() => handleOctave(-12)}
          className="px-1.5 py-0.5 text-[10px] rounded-sm border border-sas-border text-sas-muted hover:text-sas-accent hover:border-sas-accent transition-colors disabled:opacity-40"
          title="Octave down (−12 semitones)"
        >
          Oct −
        </button>
        <button
          type="button"
          data-testid="sdk-pr-octave-up"
          disabled={octaveDisabled}
          onClick={() => handleOctave(12)}
          className="px-1.5 py-0.5 text-[10px] rounded-sm border border-sas-border text-sas-muted hover:text-sas-accent hover:border-sas-accent transition-colors disabled:opacity-40"
          title="Octave up (+12 semitones)"
        >
          Oct +
        </button>
        <label className="flex items-center gap-1 text-[10px] text-sas-muted/70 ml-1">
          Snap
          <select
            data-testid="sdk-pr-snap"
            value={snapState}
            disabled={disabled}
            onChange={handleSnapChange}
            className="sas-input px-1 py-0.5 text-[10px]"
          >
            {snapOptions.map((s) => (
              <option key={s} value={s}>
                {snapLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <span className="text-[10px] text-sas-muted/60 ml-auto" data-testid="sdk-pr-note-count">
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </span>
      </div>

      {/* Scroll region: keyboard gutter + note grid */}
      <div
        ref={scrollRef}
        className="overflow-auto border border-sas-border rounded-sm bg-sas-bg"
        style={{ maxHeight: SCROLL_MAX_H }}
        data-testid="sdk-pr-scroll"
      >
        <div className="flex" style={{ width: GUTTER_W + gridWidth }}>
          {/* Keyboard gutter — pinned left during horizontal scroll */}
          <div
            data-testid="sdk-pr-gutter"
            className="sticky left-0 z-10 flex-shrink-0 bg-sas-panel-alt"
            style={{ width: GUTTER_W }}
          >
            {rows.map((p) => (
              <div
                key={p}
                data-testid="sdk-pr-key"
                data-pitch={p}
                className={`flex items-center justify-end pr-1 text-[8px] leading-none border-b border-sas-border/30 ${
                  BLACK_KEYS.has(((p % 12) + 12) % 12)
                    ? 'bg-sas-bg text-sas-muted/40'
                    : 'text-sas-muted/70'
                }`}
                style={{ height: ROW_HEIGHT }}
              >
                {p % 12 === 0 ? pitchToName(p) : ''}
              </div>
            ))}
          </div>

          {/* Note grid */}
          <div
            ref={gridRef}
            data-testid="sdk-pr-grid"
            className="relative flex-shrink-0"
            style={{
              width: gridWidth,
              height: gridHeight,
              backgroundImage: gridBg,
              cursor: disabled ? 'not-allowed' : 'crosshair',
              touchAction: 'none',
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            {notes.map((n, i) => {
              const { left, top } = cellToPx(n.pitch, n.startBeat, hi, pxPerBeat);
              const width = Math.max(3, n.durationBeats * pxPerBeat);
              // Handle never exceeds half the note, so even a 1-step note keeps a
              // left "body" zone for moving.
              const handleW = Math.min(RESIZE_HANDLE_PX, width / 2);
              return (
                <div
                  key={i}
                  data-testid="sdk-pr-note"
                  data-index={i}
                  data-pitch={n.pitch}
                  data-start-beat={n.startBeat}
                  data-duration-beats={n.durationBeats}
                  className="absolute rounded-[2px] bg-sas-accent/80 border border-sas-accent hover:bg-sas-accent"
                  style={{ left, top, width, height: ROW_HEIGHT }}
                  title={`${pitchToName(n.pitch)} · beat ${n.startBeat} · ${n.durationBeats}♪ · vel ${n.velocity}`}
                >
                  {!disabled && (
                    <div
                      data-resize-handle=""
                      data-testid="sdk-pr-note-resize"
                      className="absolute top-0 right-0 h-full rounded-r-[2px] hover:bg-sas-bg/40"
                      style={{ width: handleW, cursor: 'ew-resize' }}
                    />
                  )}
                </div>
              );
            })}
            {notes.length === 0 && (
              <div
                data-testid="sdk-pr-empty"
                className="absolute inset-0 flex items-center justify-center text-[10px] text-sas-muted/50 pointer-events-none"
              >
                No notes — click to add
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PianoRollEditor;
