/**
 * TrackExternalFxSection — the TrackDrawer FX-tab block for one track's
 * third-party (VST3/AU) FX inserts, below the built-in FX toggle bar.
 *
 * SELF-CONTAINED by design: give it the host and a track id and it manages
 * its own fetch/mutation state via useTrackExternalFx. That keeps per-panel
 * wiring to a single prop (six panels consume this) instead of ten
 * callbacks. Renders nothing on hosts without the surface (pre-2.39), so
 * panels can pass the prop unconditionally.
 *
 * Visual idiom mirrors PanelMasterStrip's FX chips + picker grid: chip =
 * bypass dot + name (opens the native editor) + remove ✕; the picker is the
 * TrackDrawer Pick-tab grid over FX descriptors with a search box.
 */

import React, { useMemo, useState } from 'react';
import type { InstrumentDescriptor, PluginHost, TrackExternalFxEntry } from '../types/plugin-sdk.types';
import { useTrackExternalFx } from '../hooks/useTrackExternalFx';

export interface TrackExternalFxSectionProps {
  /** The panel's host — used directly; the section manages its own state. */
  host: PluginHost;
  /** ENGINE track id (the same id the panel passes to getTrackFxState). */
  trackId: string;
  /** Disable all controls (e.g. while the track is generating). */
  disabled?: boolean;
}

export function TrackExternalFxSection({
  host,
  trackId,
  disabled = false,
}: TrackExternalFxSectionProps): React.ReactElement | null {
  const {
    supported,
    fx,
    availableFx,
    fxLoading,
    pickerOpen,
    setPickerOpen,
    refreshFx,
    onAddFx,
    onRemoveFx,
    onToggleFxEnabled,
    onShowFxEditor,
  } = useTrackExternalFx(host, trackId);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableFx;
    return availableFx.filter(
      (candidate: InstrumentDescriptor) =>
        candidate.name.toLowerCase().includes(q) ||
        candidate.manufacturer.toLowerCase().includes(q)
    );
  }, [availableFx, search]);

  // Pre-2.39 host — the drawer keeps its built-in-only FX tab.
  if (!supported) return null;

  const entries = fx ?? [];

  return (
    <div
      data-testid="track-external-fx-section"
      className="flex flex-col gap-1.5 pt-2 mt-1 border-t border-sas-border/60"
    >
      <div className="flex items-center gap-2">
        <span
          className="text-[9px] font-bold tracking-widest text-sas-muted/70 select-none"
          title="Third-party FX inserts (VST3/AU) on this track, before its fader. Settings persist with the project."
        >
          3RD-PARTY FX
        </span>

        {/* FX chips */}
        <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
          {entries.map((entry: TrackExternalFxEntry) => (
            <span
              key={`${entry.index}:${entry.pluginId}`}
              data-testid={`track-fx-chip-${entry.index}`}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-[10px] whitespace-nowrap ${
                entry.enabled
                  ? 'border-sas-accent/60 text-sas-accent bg-sas-accent/10'
                  : 'border-sas-border text-sas-muted/50 bg-sas-panel'
              }`}
              title={`${entry.name}${entry.enabled ? '' : ' (bypassed)'}`}
            >
              <button
                data-testid={`track-fx-toggle-${entry.index}`}
                onClick={() => onToggleFxEnabled(entry.index, !entry.enabled)}
                disabled={disabled}
                className="hover:opacity-70 disabled:opacity-50"
                title={entry.enabled ? `Bypass ${entry.name}` : `Enable ${entry.name}`}
              >
                {entry.enabled ? '●' : '○'}
              </button>
              <button
                data-testid={`track-fx-edit-${entry.index}`}
                onClick={() => onShowFxEditor(entry.index)}
                disabled={disabled}
                className="max-w-[110px] truncate hover:underline disabled:opacity-50"
                title={`Open ${entry.name} editor`}
              >
                {entry.name}
              </button>
              <button
                data-testid={`track-fx-remove-${entry.index}`}
                onClick={() => onRemoveFx(entry.index)}
                disabled={disabled}
                className="text-sas-muted/60 hover:text-sas-danger disabled:opacity-50"
                title={`Remove ${entry.name} from this track`}
              >
                ✕
              </button>
            </span>
          ))}
          {entries.length === 0 && (
            <span className="text-[10px] text-sas-muted/40 select-none">none</span>
          )}
        </div>

        <button
          data-testid="track-fx-add-button"
          onClick={() => setPickerOpen(!pickerOpen)}
          disabled={disabled}
          className={`px-1.5 py-0.5 rounded-sm border text-xs whitespace-nowrap transition-colors ${
            pickerOpen
              ? 'border-sas-accent text-sas-accent bg-sas-accent/10'
              : 'border-sas-border text-sas-muted hover:border-sas-accent hover:text-sas-accent'
          } disabled:opacity-50`}
          title={pickerOpen ? 'Close the FX picker' : 'Add a VST3/AU FX plugin to this track'}
        >
          {pickerOpen ? 'FX ▴' : 'FX +'}
        </button>
      </div>

      {/* FX picker (PanelMasterStrip idiom, over FX descriptors) */}
      {pickerOpen && (
        <div data-testid="track-fx-picker" className="flex flex-col gap-2 pt-1">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              placeholder="Search FX..."
              className="sas-input flex-1 px-2 py-1 text-xs"
            />
            <button
              onClick={() => refreshFx()}
              disabled={fxLoading}
              className="px-2 py-1 text-xs rounded-sm border border-sas-border text-sas-muted hover:text-sas-accent hover:border-sas-accent transition-colors disabled:opacity-50"
              title="Re-scan plugins"
            >
              {fxLoading ? '...' : 'Refresh'}
            </button>
          </div>

          {fxLoading && availableFx.length === 0 ? (
            <div className="text-xs text-sas-muted/60 text-center py-3">Scanning plugins...</div>
          ) : (
            <div className="grid grid-cols-3 gap-1 max-h-[140px] overflow-y-auto">
              {filtered.map((candidate: InstrumentDescriptor) => (
                <button
                  key={candidate.pluginId}
                  data-testid={`track-fx-pick-${candidate.pluginId}`}
                  onClick={() => {
                    onAddFx(candidate.pluginId);
                    setPickerOpen(false);
                  }}
                  disabled={disabled}
                  className="flex flex-col items-start px-2 py-1.5 rounded-sm border text-left transition-colors border-sas-border bg-sas-panel-alt text-sas-muted hover:border-sas-accent hover:text-sas-accent disabled:opacity-50"
                  title={`${candidate.name} by ${candidate.manufacturer} (${candidate.type.toUpperCase()})`}
                >
                  <span className="text-xs font-medium truncate w-full">{candidate.name}</span>
                  <span className="text-[9px] text-sas-muted/50 truncate w-full">
                    {candidate.manufacturer || candidate.type.toUpperCase()}
                  </span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="col-span-3 text-xs text-sas-muted/60 text-center py-2">
                  {search.trim() ? 'No matches' : 'No FX plugins found'}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
