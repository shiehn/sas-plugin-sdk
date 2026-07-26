/**
 * GroupCollapseChevron — the shared collapse/expand toggle for voice-group
 * header bars (ensemble / arp / bass / pad). One component so all four
 * headers look identical and plugins don't need their own lucide dep; the
 * state itself is owned by the shell's CollapsibleGroup wrapper and arrives
 * via GroupRenderContext (`ctx.collapsed` / `ctx.onToggleCollapse`).
 *
 * Renders nothing when `onToggle` is absent (pre-2.48 hosts / bare render
 * contexts), so plugins can mount it unconditionally.
 *
 * @since SDK 2.48.0
 */

import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface GroupCollapseChevronProps {
  /** Whether the group's member rows are hidden. */
  collapsed?: boolean;
  /** Toggle handler (GroupRenderContext.onToggleCollapse). Absent ⇒ renders nothing. */
  onToggle?: () => void;
  /** Noun for the tooltip, e.g. "ensemble" → "Collapse ensemble". Default "group". */
  what?: string;
}

export function GroupCollapseChevron({
  collapsed = false,
  onToggle,
  what = 'group',
}: GroupCollapseChevronProps): React.ReactElement | null {
  if (!onToggle) return null;
  return (
    <button
      type="button"
      data-testid="sdk-group-collapse"
      onClick={onToggle}
      aria-expanded={!collapsed}
      title={collapsed ? `Expand ${what}` : `Collapse ${what}`}
      className="shrink-0 px-0.5 py-0.5 rounded-sm text-sas-muted hover:text-sas-accent transition-colors"
    >
      <ChevronDown
        className={`w-3 h-3 transition-transform ${collapsed ? '-rotate-90' : ''}`}
        strokeWidth={2.5}
      />
    </button>
  );
}
