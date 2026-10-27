/**
 * Song lyrics (SDK 3.24.0): the limits and pure rules of the host-owned song
 * lyric document, shared by plugins (feature probe, song order, staleness) and
 * the host (patch validation, `sameAs` mirroring), so both halves apply one
 * tested rule set. React-free: also the subpath
 * `@signalsandsorcery/plugin-sdk/song-lyrics`.
 */

import type {
  ArrangementOutline,
  ArrangementOutlineSection,
  PluginHost,
  SongLyrics,
  SongLyricsChange,
  SongLyricsHint,
  SongLyricsSection,
  SongLyricsSectionPatch,
  SongLyricsWriteFailure,
  SongRole,
} from '../types/plugin-sdk.types';

// The document types, so the subpath's users (the host's main process) need not load the React-typed root.
export type {
  SongLyrics,
  SongLyricsChange,
  SongLyricsHint,
  SongLyricsSection,
  SongLyricsSectionPatch,
  SongLyricsSpareVerse,
  SongLyricsWriteFailure,
  SongRole,
} from '../types/plugin-sdk.types';

export const SONG_LYRICS_VERSION = 1 as const;

/** Common song-form roles, for prompts and pickers. Not a closed list: `SongRole` is free text. */
export const SONG_ROLE_SUGGESTIONS: readonly SongRole[] = [
  'intro',
  'verse',
  'pre-chorus',
  'chorus',
  'post-chorus',
  'hook',
  'refrain',
  'bridge',
  'breakdown',
  'build',
  'drop',
  'interlude',
  'solo',
  'outro',
];

/** The host's caps on the document. Lines and the description are refused past them; hints are trimmed. */
export const SONG_LYRICS_LIMITS = {
  /** Lines (phrases) in one section. */
  maxLinesPerSection: 64,
  /** Characters in one line. */
  maxLineChars: 300,
  /** Hint turns kept per section (the latest). */
  maxHintsPerSection: 40,
  /** Characters kept per hint. */
  maxHintChars: 600,
  /** Characters in the song description (after trimming). */
  maxDescriptionChars: 2000,
  /** Characters in a role. */
  maxRoleChars: 40,
  /** Characters in `renderedSig`. */
  maxSigChars: 256,
} as const;

/** Every `SongLyricsWriteFailure`. */
export const SONG_LYRICS_WRITE_FAILURES = [
  'no-arrangement',
  'unknown-section',
  'invalid-patch',
  'too-long',
  'same-as-lines',
  'same-as-unknown',
  'same-as-other-scene',
  'same-as-cycle',
  'not-owned',
] as const satisfies readonly SongLyricsWriteFailure[];

// Compile-time: the list names every reason.
type MissingFailure = Exclude<SongLyricsWriteFailure, (typeof SONG_LYRICS_WRITE_FAILURES)[number]>;
const everyFailureListed: MissingFailure extends never ? true : never = true;
void everyFailureListed;

/** The fields `setSectionLyrics` accepts; any other key is `invalid-patch`. */
export const SONG_LYRICS_PATCH_KEYS = [
  'lines',
  'locks',
  'hints',
  'role',
  'sameAs',
  'take',
  'renderedSig',
  'voiceTrackDbId',
] as const satisfies readonly (keyof SongLyricsSectionPatch)[];

type MissingPatchKey = Exclude<keyof SongLyricsSectionPatch, (typeof SONG_LYRICS_PATCH_KEYS)[number]>;
const everyPatchKeyListed: MissingPatchKey extends never ? true : never = true;
void everyPatchKeyListed;

type SongLyricsMethods = 'getSongLyrics' | 'setSectionLyrics' | 'setSongDescription' | 'onSongLyricsChanged';

/** Whether this host keeps the song lyric document (all four methods). */
export function hasSongLyrics(
  host: Partial<Pick<PluginHost, SongLyricsMethods>> | null | undefined,
): host is Required<Pick<PluginHost, SongLyricsMethods>> {
  return (
    !!host &&
    typeof host.getSongLyrics === 'function' &&
    typeof host.setSectionLyrics === 'function' &&
    typeof host.setSongDescription === 'function' &&
    typeof host.onSongLyricsChanged === 'function'
  );
}

export function emptySongLyrics(arrangementId: string, now: number): SongLyrics {
  return { version: SONG_LYRICS_VERSION, arrangementId, description: '', sections: {}, spare: [], updatedAt: now };
}

export function emptySongLyricsSection(sceneId: string): SongLyricsSection {
  return { sceneId, voiceTrackDbId: null, lines: [], locks: [], hints: [] };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * The words a section sings: its own lines, or, following `sameAs`, the lines
 * of the section it repeats. `[]` for a section the document doesn't hold. A
 * `sameAs` naming a missing section, or a loop, falls back to the last
 * section's own lines.
 */
export function resolveSectionLines(doc: SongLyrics | null | undefined, instanceId: string): string[] {
  const end = sameAsTarget(doc, instanceId);
  return end ? [...end.lines] : [];
}

function sameAsTarget(doc: SongLyrics | null | undefined, instanceId: string): SongLyricsSection | null {
  let cur = doc?.sections[instanceId];
  if (!doc || !cur) return null;
  const seen = new Set([instanceId]);
  while (cur.sameAs && !seen.has(cur.sameAs)) {
    const next: SongLyricsSection | undefined = doc.sections[cur.sameAs];
    if (!next) break;
    seen.add(cur.sameAs);
    cur = next;
  }
  return cur;
}

/** One section of the song with its words, in play order. */
export interface SongLyricsInOrder {
  section: ArrangementOutlineSection;
  /** The document's section; null when nothing is written for this placement. */
  lyrics: SongLyricsSection | null;
  /** The words sung here (`sameAs` followed). */
  lines: string[];
}

/** The song in play order (the outline's), each section with its words. */
export function songLyricsInOrder(
  outline: ArrangementOutline | null | undefined,
  doc: SongLyrics | null | undefined,
): SongLyricsInOrder[] {
  return (outline?.sections ?? []).map((section) => ({
    section,
    lyrics: doc?.sections[section.instanceId] ?? null,
    lines: resolveSectionLines(doc, section.instanceId),
  }));
}

/**
 * The words' identity for staleness. A plugin stores
 * `renderedSig = songLinesSignature(lines it sang)` after a render. The host's
 * Lyrics tab compares it with the current lines. Whitespace- and
 * case-insensitive per line; line order and count matter.
 */
export function songLinesSignature(lines: readonly string[]): string {
  const norm = lines.map((l) => l.trim().replace(/\s+/g, ' ').toLowerCase()).join('\n');
  // FNV-1a, two 32-bit lanes (different offsets), as 16 hex chars.
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < norm.length; i += 1) {
    const c = norm.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 13);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `sl1:${hex(a)}${hex(b)}:${lines.length}`;
}

/** Whether the section was rendered and its words have changed since (`renderedSig` vs its current lines). */
export function isSectionTakeStale(doc: SongLyrics | null | undefined, instanceId: string): boolean {
  const s = doc?.sections[instanceId];
  if (!s || s.renderedSig === undefined) return false;
  return s.renderedSig !== songLinesSignature(resolveSectionLines(doc, instanceId));
}

// ---------------------------------------------------------------------------
// Writing (pure: the host runs these, then persists and emits)
// ---------------------------------------------------------------------------

/** What a write needs to know about the bound arrangement. */
export interface SongLyricsWriteContext {
  /** The bound arrangement; null = none (every write is `no-arrangement`). */
  arrangementId: string | null;
  /** Its placements: the outline's sections, or just their `instanceId` + `sceneId`. */
  placements: ReadonlyArray<Pick<ArrangementOutlineSection, 'instanceId' | 'sceneId'>>;
  /** Epoch ms stamped on the change. */
  now: number;
}

export type SongLyricsWriteResult =
  | {
      ok: true;
      /** The new document (the input is never mutated). */
      doc: SongLyrics;
      /** Whether anything changed. When false, the host doesn't persist or emit. */
      changed: boolean;
      /** What changed, for `onSongLyricsChanged` (the host adds `byPluginId`). */
      change: SongLyricsChange;
    }
  | { ok: false; reason: SongLyricsWriteFailure; detail: string };

const fail = (reason: SongLyricsWriteFailure, detail: string): SongLyricsWriteResult => ({ ok: false, reason, detail });

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isIndex = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/**
 * Apply `setSectionLyrics(instanceId, patch)` to `doc` under the rules in its
 * doc comment, except ownership, which only the host can check: it runs
 * before this. Creates the document and the section on first write. A
 * section that repeats the written one (`sameAs`, at any depth) gets its new
 * lines too and is listed in `change.instanceIds`.
 */
export function applySongLyricsPatch(
  doc: SongLyrics | null | undefined,
  ctx: SongLyricsWriteContext,
  instanceId: string,
  patch: SongLyricsSectionPatch,
): SongLyricsWriteResult {
  if (!ctx.arrangementId) return fail('no-arrangement', 'No arrangement is bound');
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return fail('invalid-patch', 'The patch must be an object');
  for (const key of Object.keys(patch)) {
    if (!(SONG_LYRICS_PATCH_KEYS as readonly string[]).includes(key)) return fail('invalid-patch', `Unknown field "${key}"`);
  }
  const L = SONG_LYRICS_LIMITS;
  const placed = new Map(ctx.placements.map((p) => [p.instanceId, p.sceneId]));
  const sceneId = placed.get(instanceId);
  if (sceneId === undefined) return fail('unknown-section', `Section "${instanceId}" is not placed in the arrangement`);
  if (Object.keys(patch).length === 0) {
    return { ok: true, doc: doc ?? emptySongLyrics(ctx.arrangementId, ctx.now), changed: false, change: {} };
  }

  // --- Shape and caps ---
  if (patch.lines !== undefined) {
    if (!Array.isArray(patch.lines) || !patch.lines.every((l) => typeof l === 'string')) {
      return fail('invalid-patch', 'lines must be an array of strings');
    }
    if (patch.lines.some((l) => /[\r\n]/.test(l))) return fail('invalid-patch', 'A line holds one phrase: no line breaks');
    if (patch.lines.length > L.maxLinesPerSection) return fail('too-long', `At most ${L.maxLinesPerSection} lines per section`);
    if (patch.lines.some((l) => l.length > L.maxLineChars)) return fail('too-long', `At most ${L.maxLineChars} characters per line`);
  }
  if (patch.locks !== undefined && (!Array.isArray(patch.locks) || !patch.locks.every(isIndex))) {
    return fail('invalid-patch', 'locks must be an array of line indexes');
  }
  if (patch.hints !== undefined) {
    const ok =
      Array.isArray(patch.hints) &&
      patch.hints.every(
        (h) =>
          isPlainObject(h) &&
          (h.role === 'user' || h.role === 'model') &&
          typeof h.text === 'string' &&
          typeof h.at === 'number' &&
          Number.isFinite(h.at),
      );
    if (!ok) return fail('invalid-patch', 'hints must be [{ role: "user" | "model", text, at }]');
  }
  if (patch.role !== undefined && patch.role !== null) {
    if (typeof patch.role !== 'string') return fail('invalid-patch', 'role must be a string or null');
    if (patch.role.trim().length > L.maxRoleChars) return fail('too-long', `At most ${L.maxRoleChars} characters in a role`);
  }
  if (patch.sameAs !== undefined && patch.sameAs !== null && (typeof patch.sameAs !== 'string' || !patch.sameAs)) {
    return fail('invalid-patch', 'sameAs must be an instanceId or null');
  }
  if (patch.take !== undefined && patch.take !== null && !isIndex(patch.take)) {
    return fail('invalid-patch', 'take must be a 0-based index or null');
  }
  if (patch.renderedSig !== undefined && patch.renderedSig !== null) {
    if (typeof patch.renderedSig !== 'string') return fail('invalid-patch', 'renderedSig must be a string or null');
    if (patch.renderedSig.length > L.maxSigChars) return fail('too-long', `At most ${L.maxSigChars} characters in renderedSig`);
  }
  if (
    patch.voiceTrackDbId !== undefined &&
    patch.voiceTrackDbId !== null &&
    (typeof patch.voiceTrackDbId !== 'string' || !patch.voiceTrackDbId)
  ) {
    return fail('invalid-patch', 'voiceTrackDbId must be a track id or null');
  }

  const base = doc ?? emptySongLyrics(ctx.arrangementId, ctx.now);
  const before = base.sections[instanceId];
  const next: SongLyricsSection = before ? cloneSection(before) : emptySongLyricsSection(sceneId);

  // --- sameAs ---
  if (patch.sameAs === null) delete next.sameAs;
  else if (patch.sameAs !== undefined) {
    const target = patch.sameAs;
    if (target === instanceId || !placed.has(target)) {
      return fail('same-as-unknown', `sameAs "${target}" is not another placed section`);
    }
    if (placed.get(target) !== sceneId) return fail('same-as-other-scene', 'sameAs must name a placement of the same scene');
    // A loop: following the target's chain reaches this section.
    const seen = new Set<string>();
    for (let cur: string | undefined = target; cur; cur = base.sections[cur]?.sameAs) {
      if (cur === instanceId) return fail('same-as-cycle', `sameAs "${target}" repeats this section`);
      if (seen.has(cur)) break;
      seen.add(cur);
    }
    next.sameAs = target;
  }
  if (patch.lines !== undefined && next.sameAs) {
    return fail('same-as-lines', 'This section repeats another; clear sameAs to give it its own lines');
  }

  // --- Plain fields ---
  if (patch.lines !== undefined) next.lines = [...patch.lines];
  if (patch.hints !== undefined) {
    next.hints = patch.hints
      .slice(-L.maxHintsPerSection)
      .map((h: SongLyricsHint) => ({ role: h.role, text: h.text.slice(0, L.maxHintChars), at: h.at }));
  }
  if (patch.role === null) delete next.role;
  else if (patch.role !== undefined) {
    const role = patch.role.trim().toLowerCase();
    if (role) next.role = role;
    else delete next.role;
  }
  if (patch.take === null) delete next.take;
  else if (patch.take !== undefined) next.take = patch.take;
  if (patch.renderedSig === null) delete next.renderedSig;
  else if (patch.renderedSig !== undefined) next.renderedSig = patch.renderedSig;
  if (patch.voiceTrackDbId !== undefined) next.voiceTrackDbId = patch.voiceTrackDbId;

  const sections: Record<string, SongLyricsSection> = { ...base.sections, [instanceId]: next };
  const draft: SongLyrics = { ...base, sections };
  if (next.sameAs) next.lines = resolveSectionLines(draft, instanceId);
  next.locks = normalizeLocks(patch.locks ?? next.locks, next.lines.length);
  if (before ? !sameStrings(before.lines, next.lines) : next.lines.length > 0) next.writtenAt = ctx.now;

  // --- Mirrors: every section repeating this one (at any depth) sings its new lines ---
  const changedIds: string[] = [];
  if (!before || !sectionsEqual(before, next)) changedIds.push(instanceId);
  for (const [id, s] of Object.entries(sections)) {
    if (id === instanceId || !s.sameAs) continue;
    const lines = resolveSectionLines(draft, id);
    if (sameStrings(s.lines, lines)) continue;
    sections[id] = { ...cloneSection(s), lines, locks: normalizeLocks(s.locks, lines.length), writtenAt: ctx.now };
    changedIds.push(id);
  }

  if (changedIds.length === 0) return { ok: true, doc: base, changed: false, change: {} };
  return { ok: true, doc: { ...draft, updatedAt: ctx.now }, changed: true, change: { instanceIds: changedIds } };
}

/** Apply `setSongDescription(description)`: trimmed, `''` clears, refused past the cap. */
export function applySongDescription(
  doc: SongLyrics | null | undefined,
  ctx: Pick<SongLyricsWriteContext, 'arrangementId' | 'now'>,
  description: string,
): SongLyricsWriteResult {
  if (!ctx.arrangementId) return fail('no-arrangement', 'No arrangement is bound');
  if (typeof description !== 'string') return fail('invalid-patch', 'The description must be a string');
  const text = description.trim();
  if (text.length > SONG_LYRICS_LIMITS.maxDescriptionChars) {
    return fail('too-long', `At most ${SONG_LYRICS_LIMITS.maxDescriptionChars} characters in the description`);
  }
  const base = doc ?? emptySongLyrics(ctx.arrangementId, ctx.now);
  if (doc && doc.description === text) return { ok: true, doc, changed: false, change: {} };
  if (!doc && !text) return { ok: true, doc: base, changed: false, change: {} };
  return { ok: true, doc: { ...base, description: text, updatedAt: ctx.now }, changed: true, change: { description: true } };
}

function cloneSection(s: SongLyricsSection): SongLyricsSection {
  return { ...s, lines: [...s.lines], locks: [...s.locks], hints: s.hints.map((h) => ({ ...h })) };
}

function normalizeLocks(locks: readonly number[], lineCount: number): number[] {
  return [...new Set(locks)].filter((i) => i < lineCount).sort((x, y) => x - y);
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function sectionsEqual(a: SongLyricsSection, b: SongLyricsSection): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
