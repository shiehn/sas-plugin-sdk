/**
 * InstrumentDrawer — Two-stage nested menu for instrument selection + editor access.
 *
 * Stage 1 (instruments): Searchable grid of available VST3/AU instrument plugins.
 * Stage 2 (editor): Shows "Open Editor" button for the selected plugin's native GUI.
 */

import React, { useState, useMemo } from 'react';
import type { InstrumentDescriptor, SoundHistoryEntry } from '../types/plugin-sdk.types';

// ============================================================================
// Props
// ============================================================================

export interface InstrumentDrawerProps {
  /** Available instrument plugins from engine scan (omit for a History-only drawer, e.g. drums) */
  instruments?: InstrumentDescriptor[];
  /** Currently loaded instrument plugin ID (null = default Surge XT) */
  currentPluginId?: string | null;
  /** Whether the scan is still in progress */
  isLoading?: boolean;
  /** Called when user selects an instrument (omit to disable the "Pick" tab) */
  onSelect?: (pluginId: string) => void;
  /** Called when user clicks refresh to re-scan plugins */
  onRefresh?: () => void;
  // --- Editor access (Stage 2) ---
  /** Which stage the drawer is in */
  stage?: 'instruments' | 'editor';
  /** Called when user clicks "Open Editor" */
  onShowEditor?: () => void;
  /** Called when user wants to go back from editor view to instrument list */
  onBackToInstruments?: () => void;
  /** Name of the selected instrument (for display in editor header) */
  selectedInstrumentName?: string | null;
  // --- Sound History (the "History" tab) ---
  /** Ordered list of sounds this track has had this session (enables the History tab). */
  soundHistory?: readonly SoundHistoryEntry[];
  /** Index into soundHistory of the currently-applied sound. */
  soundHistoryCursor?: number;
  /** Restore a sound by index; presence of this enables the History tab. */
  onRestoreSound?: (index: number) => void;
  /** Toggle the favorite (⭐) flag on a history entry; omit to hide the star. */
  onToggleFavorite?: (index: number) => void;
  // --- Import a sound from another scene (the "⇪ Import Sample/Preset" button) ---
  /** Open the sound-import picker; omit to hide the button. */
  onImportSound?: () => void;
  /** Button label, e.g. "Import Sample" (drums/instruments) or "Import Preset" (synths). */
  importSoundLabel?: string;
}

// ============================================================================
// Component
// ============================================================================

export function InstrumentDrawer({
  instruments = [],
  currentPluginId = null,
  isLoading = false,
  onSelect,
  onRefresh,
  stage = 'instruments',
  onShowEditor,
  onBackToInstruments,
  selectedInstrumentName,
  soundHistory,
  soundHistoryCursor = -1,
  onRestoreSound,
  onToggleFavorite,
  onImportSound,
  importSoundLabel,
}: InstrumentDrawerProps): React.ReactElement {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'pick' | 'history'>('pick');

  // "Pick" (instrument selection) is wired only when onSelect is provided —
  // drums omit it (pinned to the sampler). "History" is wired when sound-history
  // is provided. Show the tab strip only when BOTH exist; otherwise the drawer
  // is single-purpose and renders that one view directly.
  const pickEnabled = !!onSelect;
  const historyEnabled = !!onRestoreSound;
  const history = soundHistory ?? [];
  const effectiveTab: 'pick' | 'history' = !pickEnabled
    ? 'history'
    : !historyEnabled
      ? 'pick'
      : activeTab;

  const tabClass = (active: boolean): string =>
    `px-2 py-0.5 text-xs rounded-sm transition-colors ${
      active
        ? 'bg-sas-accent/20 text-sas-accent font-medium'
        : 'text-sas-muted hover:text-sas-accent'
    }`;

  const tabs = pickEnabled && historyEnabled ? (
    <div className="flex items-center gap-1 border-b border-sas-border pb-1" data-testid="sdk-drawer-tabs">
      <button type="button" onClick={() => setActiveTab('pick')} className={tabClass(activeTab === 'pick')}>
        Pick
      </button>
      <button type="button" onClick={() => setActiveTab('history')} className={tabClass(activeTab === 'history')}>
        History{history.length > 0 ? ` (${history.length})` : ''}
      </button>
    </div>
  ) : null;

  // Context header — the panel hosts more than preset/sample selection, so a
  // small title + context line orients the user (active view + current sound).
  const currentSound =
    soundHistoryCursor >= 0 && soundHistoryCursor < history.length
      ? history[soundHistoryCursor].label
      : null;
  const contextLabel =
    historyEnabled && effectiveTab === 'history'
      ? 'History'
      : stage === 'editor'
        ? 'Edit instrument'
        : 'Pick instrument';
  const topBar = (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2" data-testid="sdk-drawer-header">
        <span className="text-xs font-semibold text-sas-text">Sound</span>
        <span className="text-[10px] text-sas-muted/70 truncate" title={currentSound ?? undefined}>
          {contextLabel}{currentSound ? ` · ${currentSound}` : ''}
        </span>
      </div>
      {tabs}
      {onImportSound && (
        <button
          type="button"
          data-testid="sdk-drawer-import-sound"
          onClick={onImportSound}
          className="w-full px-2 py-1 text-[11px] rounded-sm border border-sas-border text-sas-muted hover:border-sas-accent hover:text-sas-accent transition-colors"
          title="Copy a sound from a track in another scene (ignores contract)"
        >
          ⇪ {importSoundLabel ?? 'Import Sound'}
        </button>
      )}
    </div>
  );

  /** Sentinel pluginId for the default Surge XT entry */
  const SURGE_XT_DEFAULT_ID = 'Surge XT';

  // Filter instruments by search query, with selected instrument always first
  const filtered = useMemo((): InstrumentDescriptor[] => {
    let all = instruments.filter(
      (i: InstrumentDescriptor) => i.name !== 'Surge XT'
    );
    if (search.trim()) {
      const q = search.toLowerCase();
      all = all.filter(
        (i: InstrumentDescriptor) =>
          i.name.toLowerCase().includes(q) ||
          i.manufacturer.toLowerCase().includes(q)
      );
    }
    // Move the currently selected instrument to the top
    if (currentPluginId) {
      const selectedIdx = all.findIndex((i: InstrumentDescriptor) => i.pluginId === currentPluginId);
      if (selectedIdx > 0) {
        const [selected] = all.splice(selectedIdx, 1);
        all.unshift(selected);
      }
    }
    return all;
  }, [instruments, search, currentPluginId]);

  // Is the default Surge XT selected?
  const isDefaultSelected = currentPluginId === null;

  // Determine which pluginId is "selected" among scanned instruments
  const isSelected = (pluginId: string): boolean => {
    return pluginId === currentPluginId;
  };

  // ---- History tab (when active, or the only view for drums) ----
  if (historyEnabled && effectiveTab === 'history') {
    const order = history.map((_, i) => i).reverse(); // newest first
    return (
      <div className="flex flex-col gap-2">
        {topBar}
        {history.length === 0 ? (
          <div className="text-xs text-sas-muted/60 text-center py-3" data-testid="sdk-history-empty">
            No sounds yet — shuffle to build history.
          </div>
        ) : (
          <ul className="flex flex-col gap-1 max-h-[160px] overflow-y-auto" data-testid="sdk-history-list">
            {order.map((i) => {
              const entry = history[i];
              const isCurrent = i === soundHistoryCursor;
              return (
                <li key={i} className="flex items-center gap-1">
                  <button
                    type="button"
                    data-testid="sdk-history-entry"
                    disabled={isCurrent}
                    onClick={() => onRestoreSound?.(i)}
                    className={`flex-1 min-w-0 flex items-center justify-between px-2 py-1.5 rounded-sm border text-left text-xs transition-colors ${
                      isCurrent
                        ? 'border-sas-accent bg-sas-accent/20 text-sas-accent cursor-default'
                        : 'border-sas-border bg-sas-panel-alt text-sas-muted hover:border-sas-accent hover:text-sas-accent'
                    }`}
                    title={isCurrent ? 'Current sound' : `Restore: ${entry.label}`}
                  >
                    <span className="truncate">{entry.label}</span>
                    <span className="text-[10px] text-sas-muted/60 flex-shrink-0 ml-2">
                      {isCurrent ? '● current' : 'restore'}
                    </span>
                  </button>
                  {onToggleFavorite && (
                    <button
                      type="button"
                      data-testid="sdk-history-favorite"
                      onClick={() => onToggleFavorite(i)}
                      className={`flex-shrink-0 px-1 py-0.5 text-sm leading-none transition-colors ${
                        entry.favorite ? 'text-yellow-400' : 'text-sas-muted/40 hover:text-yellow-400'
                      }`}
                      title={entry.favorite ? 'Unfavorite' : 'Favorite (keeps it from being evicted)'}
                    >
                      {entry.favorite ? '★' : '☆'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  // ---- Stage 2: Editor Access ----
  if (stage === 'editor') {
    return (
      <div className="flex flex-col gap-2">
        {topBar}
        {/* Back button + instrument name header */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onBackToInstruments?.()}
            className="px-2 py-1 text-xs rounded-sm border border-sas-border text-sas-muted hover:text-sas-accent hover:border-sas-accent transition-colors"
          >
            &larr; Back
          </button>
          <span className="text-xs text-sas-muted font-medium truncate flex-1">
            {selectedInstrumentName ?? 'Plugin'}
          </span>
        </div>

        {/* Open Editor button */}
        <button
          onClick={() => onShowEditor?.()}
          className="w-full py-2 text-xs font-medium rounded-sm border border-sas-accent bg-sas-accent/20 text-sas-accent hover:bg-sas-accent/40 transition-colors"
        >
          Open Plugin Editor
        </button>
      </div>
    );
  }

  // ---- Stage 1: Instrument List (default) ----
  return (
    <div className="flex flex-col gap-2">
      {topBar}
      {/* Search + Refresh row */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          placeholder="Search instruments..."
          className="sas-input flex-1 px-2 py-1 text-xs"
        />
        <button
          onClick={() => onRefresh?.()}
          disabled={isLoading}
          className="px-2 py-1 text-xs rounded-sm border border-sas-border text-sas-muted hover:text-sas-accent hover:border-sas-accent transition-colors disabled:opacity-50"
          title="Re-scan plugins"
        >
          {isLoading ? '...' : 'Refresh'}
        </button>
      </div>

      {/* Instrument grid */}
      {isLoading && instruments.length === 0 ? (
        <div className="text-xs text-sas-muted/60 text-center py-3">
          Scanning plugins...
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1 max-h-[140px] overflow-y-auto">
          {/* Permanent "Surge XT (Default)" entry — always available */}
          <button
            key="__surge-xt-default__"
            onClick={() => onSelect?.(SURGE_XT_DEFAULT_ID)}
            className={`flex flex-col items-start px-2 py-1.5 rounded-sm border text-left transition-colors ${
              isDefaultSelected
                ? 'border-sas-accent bg-sas-accent/20 text-sas-accent'
                : 'border-sas-border bg-sas-panel-alt text-sas-muted hover:border-sas-accent hover:text-sas-accent'
            }`}
            title="Surge XT — Default instrument"
          >
            <span className="text-xs font-medium truncate w-full">
              {isDefaultSelected && '\u2713 '}Surge XT
            </span>
            <span className="text-[9px] text-sas-muted/50 truncate w-full">
              Default
            </span>
          </button>
          {/* Scanned instruments */}
          {filtered.map((inst: InstrumentDescriptor) => {
            const selected = isSelected(inst.pluginId);
            return (
              <button
                key={inst.pluginId}
                onClick={() => onSelect?.(inst.pluginId)}
                className={`flex flex-col items-start px-2 py-1.5 rounded-sm border text-left transition-colors ${
                  selected
                    ? 'border-sas-accent bg-sas-accent/20 text-sas-accent'
                    : inst.missing
                      ? 'border-amber-500/50 bg-amber-500/10 text-amber-400 hover:border-amber-500'
                      : 'border-sas-border bg-sas-panel-alt text-sas-muted hover:border-sas-accent hover:text-sas-accent'
                }`}
                title={`${inst.name} by ${inst.manufacturer} (${inst.type.toUpperCase()})${inst.missing ? ' — MISSING' : ''}`}
              >
                <span className="text-xs font-medium truncate w-full">
                  {selected && '\u2713 '}{inst.name}
                </span>
                <span className="text-[9px] text-sas-muted/50 truncate w-full">
                  {inst.manufacturer || inst.type.toUpperCase()}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-2 text-xs text-sas-muted/60 text-center py-2">
              {search.trim() ? 'No matches' : 'No other plugins found'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default InstrumentDrawer;
