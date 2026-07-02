/**
 * PanelMasterStrip — the panel's mix-bus master section (docs/panel-bus.md §10).
 *
 * One compact strip: BUS label + master fader + M/S + the bus FX chain as
 * chips (bypass toggle, remove, optional native-editor open) + an "FX +"
 * picker that reuses the TrackDrawer Pick-tab grid idiom over FX descriptors.
 *
 * Fully CONTROLLED and presentational: the panel owns `bus` (from
 * `host.getPanelBusState`), the picker-open flag, and wires every callback to
 * the corresponding `host.*PanelBus*` method. A disengaged bus renders the
 * same strip at neutral values — the first interaction engages it host-side,
 * so there is no separate "create bus" affordance to learn.
 */

import React, { useMemo, useState } from 'react';
import type { InstrumentDescriptor, PanelBusFxEntry, PanelBusState } from '../types/plugin-sdk.types';
import { VolumeSlider } from './VolumeSlider';
import { dbToSlider, sliderToDb } from '../utils/volume-conversion';

export interface PanelMasterStripProps {
  /** Bus state from `host.getPanelBusState(sceneId)`. */
  bus: PanelBusState;
  /** FX descriptors from `host.getAvailableFx()` (lazy-load on picker open). */
  availableFx?: InstrumentDescriptor[];
  /** True while `availableFx` is loading. */
  fxLoading?: boolean;
  /**
   * Another panel/track solo is active and this bus is NOT soloed — render
   * dimmed, mirroring TrackRow's soloed-out treatment. Feed
   * `anySolo && !bus.soloed` from the panel's `useAnySolo(host)` hook.
   */
  soloedOut?: boolean;
  /** Disable all controls (e.g. while the panel is generating). */
  disabled?: boolean;
  /** Controlled FX-picker visibility. */
  fxPickerOpen: boolean;
  onToggleFxPicker: (open: boolean) => void;
  /** Re-scan / refresh the FX list. */
  onRefreshFx?: () => void;

  onVolumeChange: (volumeDb: number) => void;
  onMuteToggle: () => void;
  onSoloToggle: () => void;
  onAddFx: (pluginId: string) => void;
  onRemoveFx: (fxIndex: number) => void;
  onToggleFxEnabled: (fxIndex: number, enabled: boolean) => void;
  /** Optional: open the FX plugin's native editor window. */
  onShowFxEditor?: (fxIndex: number) => void;
}

export function PanelMasterStrip({
  bus,
  availableFx = [],
  fxLoading = false,
  soloedOut = false,
  disabled = false,
  fxPickerOpen,
  onToggleFxPicker,
  onRefreshFx,
  onVolumeChange,
  onMuteToggle,
  onSoloToggle,
  onAddFx,
  onRemoveFx,
  onToggleFxEnabled,
  onShowFxEditor,
}: PanelMasterStripProps): React.ReactElement {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableFx;
    return availableFx.filter(
      (fx: InstrumentDescriptor) =>
        fx.name.toLowerCase().includes(q) || fx.manufacturer.toLowerCase().includes(q)
    );
  }, [availableFx, search]);

  return (
    <div
      data-testid="panel-master-strip"
      className={`flex flex-col gap-1 px-2 py-1.5 rounded-sm border border-sas-border bg-sas-panel-alt/50 transition-opacity ${
        soloedOut ? 'opacity-40' : ''
      }`}
    >
      {/* Strip row: label | fader | M | S | chips | FX+ */}
      <div className="flex items-center gap-2">
        <span
          className="text-[9px] font-bold tracking-widest text-sas-muted/70 select-none"
          title="Panel mix bus — volume, mute/solo and FX applied to this panel's summed output"
        >
          BUS
        </span>

        <div className="w-24">
          <VolumeSlider
            value={dbToSlider(bus.volume)}
            onChange={(sliderValue: number) => onVolumeChange(sliderToDb(sliderValue))}
            disabled={disabled}
          />
        </div>

        <button
          data-testid="bus-mute-button"
          onClick={onMuteToggle}
          disabled={disabled}
          className={`px-1.5 py-0.5 text-xs font-bold rounded transition-colors ${
            bus.muted ? 'bg-red-600 text-white' : 'bg-sas-panel-alt text-sas-muted hover:bg-sas-border'
          } disabled:opacity-50`}
          title={bus.muted ? 'Unmute panel bus' : 'Mute panel bus (silences the whole panel)'}
        >
          M
        </button>
        <button
          data-testid="bus-solo-button"
          onClick={onSoloToggle}
          disabled={disabled}
          className={`px-1.5 py-0.5 text-xs font-bold rounded transition-colors ${
            bus.soloed ? 'bg-amber-500 text-black' : 'bg-sas-panel-alt text-sas-muted hover:bg-sas-border'
          } disabled:opacity-50`}
          title={bus.soloed ? 'Unsolo panel bus' : 'Solo this panel (silences other panels/tracks in scope)'}
        >
          S
        </button>

        {/* FX chips */}
        <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
          {bus.fx.map((fx: PanelBusFxEntry) => (
            <span
              key={`${fx.index}:${fx.pluginId}`}
              data-testid={`bus-fx-chip-${fx.index}`}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-[10px] whitespace-nowrap ${
                fx.enabled
                  ? 'border-sas-accent/60 text-sas-accent bg-sas-accent/10'
                  : 'border-sas-border text-sas-muted/50 bg-sas-panel'
              }`}
              title={`${fx.name}${fx.enabled ? '' : ' (bypassed)'}`}
            >
              <button
                data-testid={`bus-fx-toggle-${fx.index}`}
                onClick={() => onToggleFxEnabled(fx.index, !fx.enabled)}
                disabled={disabled}
                className="hover:opacity-70 disabled:opacity-50"
                title={fx.enabled ? `Bypass ${fx.name}` : `Enable ${fx.name}`}
              >
                {fx.enabled ? '●' : '○'}
              </button>
              {onShowFxEditor ? (
                <button
                  data-testid={`bus-fx-edit-${fx.index}`}
                  onClick={() => onShowFxEditor(fx.index)}
                  disabled={disabled}
                  className="max-w-[80px] truncate hover:underline disabled:opacity-50"
                  title={`Open ${fx.name} editor`}
                >
                  {fx.name}
                </button>
              ) : (
                <span className="max-w-[80px] truncate">{fx.name}</span>
              )}
              <button
                data-testid={`bus-fx-remove-${fx.index}`}
                onClick={() => onRemoveFx(fx.index)}
                disabled={disabled}
                className="text-sas-muted/60 hover:text-sas-danger disabled:opacity-50"
                title={`Remove ${fx.name} from the bus`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>

        <button
          data-testid="bus-fx-add-button"
          onClick={() => onToggleFxPicker(!fxPickerOpen)}
          disabled={disabled}
          className={`px-1.5 py-0.5 rounded-sm border text-xs whitespace-nowrap transition-colors ${
            fxPickerOpen
              ? 'border-sas-accent text-sas-accent bg-sas-accent/10'
              : 'border-sas-border text-sas-muted hover:border-sas-accent hover:text-sas-accent'
          } disabled:opacity-50`}
          title="Add an FX plugin to the panel bus"
        >
          FX +
        </button>
      </div>

      {/* FX picker (TrackDrawer Pick-tab grid idiom, over FX descriptors) */}
      {fxPickerOpen && (
        <div data-testid="bus-fx-picker" className="flex flex-col gap-2 pt-1">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              placeholder="Search FX..."
              className="sas-input flex-1 px-2 py-1 text-xs"
            />
            {onRefreshFx && (
              <button
                onClick={() => onRefreshFx()}
                disabled={fxLoading}
                className="px-2 py-1 text-xs rounded-sm border border-sas-border text-sas-muted hover:text-sas-accent hover:border-sas-accent transition-colors disabled:opacity-50"
                title="Re-scan plugins"
              >
                {fxLoading ? '...' : 'Refresh'}
              </button>
            )}
          </div>

          {fxLoading && availableFx.length === 0 ? (
            <div className="text-xs text-sas-muted/60 text-center py-3">Scanning plugins...</div>
          ) : (
            <div className="grid grid-cols-3 gap-1 max-h-[140px] overflow-y-auto">
              {filtered.map((fx: InstrumentDescriptor) => (
                <button
                  key={fx.pluginId}
                  data-testid={`bus-fx-pick-${fx.pluginId}`}
                  onClick={() => onAddFx(fx.pluginId)}
                  className="flex flex-col items-start px-2 py-1.5 rounded-sm border text-left transition-colors border-sas-border bg-sas-panel-alt text-sas-muted hover:border-sas-accent hover:text-sas-accent"
                  title={`${fx.name} by ${fx.manufacturer} (${fx.type.toUpperCase()})`}
                >
                  <span className="text-xs font-medium truncate w-full">{fx.name}</span>
                  <span className="text-[9px] text-sas-muted/50 truncate w-full">
                    {fx.manufacturer || fx.type.toUpperCase()}
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
