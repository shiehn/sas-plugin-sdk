/**
 * InstrumentDrawer — Sliding drawer for selecting instrument plugins (VST3/AU).
 *
 * Appears below the track controls when the "P" button is toggled.
 * Shows a searchable grid of available instrument plugins.
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
}: InstrumentDrawerProps): React.ReactElement {
  const [search, setSearch] = useState('');

  /** Sentinel pluginId for the default Surge XT entry */
  const SURGE_XT_DEFAULT_ID = 'Surge XT';

  // Filter instruments by search query (name or manufacturer)
  const filtered = useMemo((): InstrumentDescriptor[] => {
    const all = instruments.filter(
      (i: InstrumentDescriptor) => i.name !== 'Surge XT'
    );
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter(
      (i: InstrumentDescriptor) =>
        i.name.toLowerCase().includes(q) ||
        i.manufacturer.toLowerCase().includes(q)
    );
  }, [instruments, search]);

  // Is the default Surge XT selected?
  const isDefaultSelected = currentPluginId === null;

  // Determine which pluginId is "selected" among scanned instruments
  const isSelected = (pluginId: string): boolean => {
    return pluginId === currentPluginId;
  };

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
              {isDefaultSelected && '✓ '}Surge XT
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
                  {selected && '✓ '}{inst.name}
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
