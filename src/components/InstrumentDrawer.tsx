/**
 * InstrumentDrawer — Two-stage nested menu for instrument selection + editor access.
 *
 * Stage 1 (instruments): Searchable grid of available VST3/AU instrument plugins.
 * Stage 2 (editor): Shows "Open Editor" button for the selected plugin's native GUI.
 */

import React, { useState, useMemo } from 'react';
import type { InstrumentDescriptor } from '../types/plugin-sdk.types';

// ============================================================================
// Props
// ============================================================================

export interface InstrumentDrawerProps {
  /** Available instrument plugins from engine scan */
  instruments: InstrumentDescriptor[];
  /** Currently loaded instrument plugin ID (null = default Surge XT) */
  currentPluginId: string | null;
  /** Whether the scan is still in progress */
  isLoading: boolean;
  /** Called when user selects an instrument */
  onSelect: (pluginId: string) => void;
  /** Called when user clicks refresh to re-scan plugins */
  onRefresh: () => void;
  // --- Editor access (Stage 2) ---
  /** Which stage the drawer is in */
  stage?: 'instruments' | 'editor';
  /** Called when user clicks "Open Editor" */
  onShowEditor?: () => void;
  /** Called when user wants to go back from editor view to instrument list */
  onBackToInstruments?: () => void;
  /** Name of the selected instrument (for display in editor header) */
  selectedInstrumentName?: string | null;
}

// ============================================================================
// Component
// ============================================================================

export function InstrumentDrawer({
  instruments,
  currentPluginId,
  isLoading,
  onSelect,
  onRefresh,
  stage = 'instruments',
  onShowEditor,
  onBackToInstruments,
  selectedInstrumentName,
}: InstrumentDrawerProps): React.ReactElement {
  const [search, setSearch] = useState('');

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

  // ---- Stage 2: Editor Access ----
  if (stage === 'editor') {
    return (
      <div className="flex flex-col gap-2">
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
          onClick={onRefresh}
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
            onClick={() => onSelect(SURGE_XT_DEFAULT_ID)}
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
                onClick={() => onSelect(inst.pluginId)}
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
