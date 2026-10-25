/**
 * Song order (SDK 3.23.0): pure helpers over `PluginHost.getArrangementOutline`'s
 * result, for panels that write for one scene and need its place in the song.
 */

import type { ArrangementOutline, ArrangementOutlineSection, PluginHost } from '../types/plugin-sdk.types';

/** Whether this host can tell a plugin the song order. */
export function hasArrangementOutline(
  host: Partial<Pick<PluginHost, 'getArrangementOutline'>> | null | undefined,
): host is Required<Pick<PluginHost, 'getArrangementOutline'>> {
  return !!host && typeof host.getArrangementOutline === 'function';
}

/** The sections that play `sceneId`, in song order (empty when it is not placed). */
export function sectionsOfScene(outline: ArrangementOutline | null | undefined, sceneId: string): ArrangementOutlineSection[] {
  return (outline?.sections ?? []).filter((s) => s.sceneId === sceneId);
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * The song order as numbered lines for a prompt or a tooltip, one per
 * section: `3. Chorus 2 · scene "Lift" · bars 17–24`. The section's label
 * names it, else its role, else its scene; a role or scene name is numbered
 * by occurrence when the scene plays more than once. Pickup bars come first,
 * as their own line. `currentSceneId` marks that scene's sections with `← this scene`.
 * '' for a null or empty outline.
 */
export function formatSongOrder(
  outline: ArrangementOutline | null | undefined,
  opts: { currentSceneId?: string } = {},
): string {
  const sections = outline?.sections ?? [];
  if (sections.length === 0) return '';
  const plays = new Map<string, number>();
  for (const s of sections) plays.set(s.sceneId, (plays.get(s.sceneId) ?? 0) + 1);

  const lines: string[] = [];
  const pickup = outline?.pickupBars ?? 0;
  if (pickup > 0) lines.push(`Pickup: ${pickup} bar${pickup === 1 ? '' : 's'} leading in to section 1`);
  sections.forEach((s, i) => {
    const label = s.label?.trim();
    const name = label || (s.role ? capitalise(s.role) : s.sceneName);
    // A user's label is shown as typed ("Verse 2" stays "Verse 2").
    const nth = !label && (plays.get(s.sceneId) ?? 1) > 1 ? ` ${s.occurrence}` : '';
    const scene = name !== s.sceneName ? ` · scene "${s.sceneName}"` : '';
    const end = s.startBar + s.bars - 1;
    const barsText = s.bars === 1 ? `bar ${s.startBar}` : `bars ${s.startBar}–${end}`;
    const mark = opts.currentSceneId && s.sceneId === opts.currentSceneId ? ' ← this scene' : '';
    lines.push(`${i + 1}. ${name}${nth}${scene} · ${barsText}${mark}`);
  });
  return lines.join('\n');
}
