/**
 * PanelMasterStrip — the panel's mix-bus master section (docs/panel-bus.md §10).
 *
 * One compact strip: BUS label + master fader + M/S + the bus FX chain as
 * chips (bypass toggle, remove, optional native-editor open) + an "FX +"
 * picker that reuses the TrackDrawer Synth-tab grid idiom over FX descriptors.
 *
 * Fully CONTROLLED and presentational: the panel owns `bus` (from
 * `host.getPanelBusState`), the picker-open flag, and wires every callback to
 * the corresponding `host.*PanelBus*` method. A disengaged bus renders the
 * same strip at neutral values — the first interaction engages it host-side,
 * so there is no separate "create bus" affordance to learn.
 */

import React, { useMemo, useRef, useState } from 'react';
import type {
  InstrumentDescriptor,
  PanelBusFxEntry,
  PanelBusLevels,
  PanelBusMotionState,
  PanelBusSidechainState,
  PanelBusState,
} from '../types/plugin-sdk.types';
import { LevelMeter } from './LevelMeter';
import { VolumeSlider } from './VolumeSlider';
import { dbToSlider, sliderToDb } from '../utils/volume-conversion';

const SIDECHAIN_PRESETS: ReadonlyArray<{ id: PanelBusSidechainState['presetId']; label: string }> = [
  { id: 'subtle', label: 'Subtle' },
  { id: 'classic', label: 'Classic' },
  { id: 'hard', label: 'Hard' },
];

/** Duck onset sources: real kicks, or synthetic ghost grids (pump without kicks). */
const SIDECHAIN_SOURCES: ReadonlyArray<{ id: PanelBusSidechainState['source']; label: string }> = [
  { id: 'kicks', label: 'Kicks' },
  { id: 'four-floor', label: '4-Flr' },
  { id: 'eighths', label: '8ths' },
];

/** What the motion envelope drives. */
const MOTION_TARGETS: ReadonlyArray<{ id: PanelBusMotionState['target']; label: string }> = [
  { id: 'filter', label: 'Filt' },
  { id: 'amp', label: 'Gate' },
  { id: 'pan', label: 'Pan' },
];

/** Strip-pickable wobble rates (LFO period in quarter-notes). */
const MOTION_RATES: ReadonlyArray<{ qn: number; label: string }> = [
  { qn: 2, label: '1/2' },
  { qn: 1, label: '1/4' },
  { qn: 0.5, label: '1/8' },
  { qn: 1 / 3, label: '1/8T' },
  { qn: 0.25, label: '1/16' },
  { qn: 1 / 6, label: '1/16T' },
];

const MOTION_SHAPES: ReadonlyArray<{ id: PanelBusMotionState['shape']; label: string }> = [
  { id: 'sine', label: 'Sine' },
  { id: 'triangle', label: 'Tri' },
  { id: 'saw', label: 'Saw' },
  { id: 'square', label: 'Gate' },
  { id: 'random', label: 'Rnd' },
];

export interface PanelMasterStripProps {
  /** Bus state from `host.getPanelBusState(sceneId)`. */
  bus: PanelBusState;
  /**
   * Stereo output levels from `host.getPanelBusLevels` (polled by
   * usePanelBus). Null floors the meter (disengaged / engine quiet).
   */
  levels?: PanelBusLevels | null;
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
  /**
   * Optional: move an FX chip to another slot (drag-to-reorder). Chips are
   * draggable only when provided (the shell gates on host support). Both
   * args are `PanelBusFxEntry.index` values — splice semantics, the FX
   * lands AT `toFxIndex`. @since 2.53.0
   */
  onMoveFx?: (fromFxIndex: number, toFxIndex: number) => void;

  /**
   * Sidechain (kick→bass ducking) cluster — renders ONLY when all three
   * props are provided (panels opt in via `features.busSidechain`; the shell
   * additionally gates on host support). @since 2.52.0
   */
  sidechain?: PanelBusSidechainState | null;
  onSidechainAmountChange?: (amount: number) => void;
  onSidechainPresetChange?: (presetId: PanelBusSidechainState['presetId']) => void;
  /** Optional (2.54.0 hosts): duck onset source select. */
  onSidechainSourceChange?: (source: PanelBusSidechainState['source']) => void;

  /**
   * Motion (tempo-locked filter wobble) cluster — renders ONLY when all four
   * props are provided (panels opt in via `features.busMotion`; the shell
   * additionally gates on host support). @since 2.54.0
   */
  motion?: PanelBusMotionState | null;
  onMotionAmountChange?: (amount: number) => void;
  onMotionRateChange?: (rateQn: number) => void;
  onMotionShapeChange?: (shape: PanelBusMotionState['shape']) => void;
  /** Optional (2.54.0 hosts): envelope target select (Filter | Gate). */
  onMotionTargetChange?: (target: PanelBusMotionState['target']) => void;
}

export function PanelMasterStrip({
  bus,
  levels = null,
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
  onMoveFx,
  sidechain = null,
  onSidechainAmountChange,
  onSidechainPresetChange,
  onSidechainSourceChange,
  motion = null,
  onMotionAmountChange,
  onMotionRateChange,
  onMotionShapeChange,
  onMotionTargetChange,
}: PanelMasterStripProps): React.ReactElement {
  const [search, setSearch] = useState('');
  const showSidechain = sidechain != null && !!onSidechainAmountChange && !!onSidechainPresetChange;
  const showMotion =
    motion != null && !!onMotionAmountChange && !!onMotionRateChange && !!onMotionShapeChange;
  const motionHasPattern = showMotion && motion.patternQn.length > 0;
  // Match the stored period to a strip option (float-tolerant); an
  // agent-authored custom rate or pattern renders as its own option.
  const motionRateValue = motionHasPattern
    ? 'pattern'
    : (MOTION_RATES.find((r) => Math.abs(r.qn - (motion?.rateQn ?? 0.5)) < 1e-3)?.label ?? 'custom');

  // --- Drag-to-reorder (useTrackReorder's HTML5 DnD idiom, chip-sized —
  // the same interaction as the track drawer's 3rd-party FX chips) ---
  const [draggingFx, setDraggingFx] = useState<number | null>(null);
  const [dragOverFx, setDragOverFx] = useState<number | null>(null);
  // Source chip of the in-flight drag; a ref avoids stale-closure reads in
  // the drop handler (useTrackReorder's fromRef shape).
  const dragFromRef = useRef<number | null>(null);
  const canReorderFx = !!onMoveFx && !disabled && bus.fx.length > 1;
  const sidechainNoKicks =
    showSidechain && sidechain.amount > 0 && sidechain.kickOnsetCount === 0
    && (sidechain.source ?? 'kicks') === 'kicks';

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
      className={`flex flex-col gap-1 px-2 py-1.5 rounded-sm border border-sas-border border-l-2 border-l-sas-accent/50 bg-sas-accent/5 transition-opacity ${
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

        <div className="flex-1 min-w-[8rem] flex flex-col gap-0.5">
          <VolumeSlider
            value={dbToSlider(bus.volume)}
            onChange={(sliderValue: number) => onVolumeChange(sliderToDb(sliderValue))}
            disabled={disabled}
          />
          {/* Stereo OUTPUT meter: the bus folder's post-fader Level Meter —
              the summed contribution of everything routed through the bus. */}
          <div className="flex flex-col gap-px" data-testid="bus-meter">
            <LevelMeter
              peakDb={levels?.leftDb ?? -120}
              active={levels != null}
              clipped={levels?.clipped}
              compact
              data-testid="bus-meter-left"
            />
            <LevelMeter
              peakDb={levels?.rightDb ?? -120}
              active={levels != null}
              compact
              data-testid="bus-meter-right"
            />
          </div>
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

        {/* Sidechain (kick→bass ducking): amount + preset. The envelope
            follows the scene's kick MIDI — no kicks, no pump. */}
        {showSidechain && (
          <div
            data-testid="bus-sidechain"
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm border whitespace-nowrap ${
              sidechain.amount > 0
                ? 'border-sas-accent/60 bg-sas-accent/10'
                : 'border-sas-border bg-sas-panel'
            }`}
            title={
              sidechainNoKicks
                ? 'No kicks in this scene — the duck is armed but has nothing to pump against'
                : 'Sidechain duck: this bus dips on every kick in the scene (0 = off)'
            }
          >
            <span
              className={`text-[9px] font-bold tracking-widest select-none ${
                sidechain.amount > 0 ? 'text-sas-accent' : 'text-sas-muted/70'
              }`}
            >
              DUCK
            </span>
            <input
              data-testid="bus-sidechain-amount"
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(sidechain.amount * 100)}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onSidechainAmountChange(Number(e.target.value) / 100)
              }
              disabled={disabled}
              className="w-16 accent-sas-accent disabled:opacity-50"
              aria-label="Sidechain duck amount"
            />
            <span className="text-[9px] text-sas-muted/70 w-6 text-right select-none" data-testid="bus-sidechain-amount-label">
              {sidechain.amount > 0 ? `${Math.round(sidechain.amount * 100)}%` : 'Off'}
            </span>
            <select
              data-testid="bus-sidechain-preset"
              value={sidechain.presetId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                onSidechainPresetChange(e.target.value as PanelBusSidechainState['presetId'])
              }
              disabled={disabled}
              className="sas-input text-[10px] px-1 py-0.5"
              aria-label="Sidechain duck preset"
            >
              {SIDECHAIN_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            {onSidechainSourceChange && (
              <select
                data-testid="bus-sidechain-source"
                value={sidechain.source ?? 'kicks'}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  onSidechainSourceChange(e.target.value as PanelBusSidechainState['source'])
                }
                disabled={disabled}
                className="sas-input text-[10px] px-1 py-0.5"
                aria-label="Sidechain onset source"
                title="What triggers the duck: the scene's kicks, or a synthetic ghost grid (pump without kicks)"
              >
                {SIDECHAIN_SOURCES.map((src) => (
                  <option key={src.id} value={src.id}>
                    {src.label}
                  </option>
                ))}
              </select>
            )}
            {sidechainNoKicks && (
              <span
                data-testid="bus-sidechain-no-kicks"
                className="text-[10px] text-amber-500 select-none"
              >
                no kicks
              </span>
            )}
          </div>
        )}

        {/* Motion (tempo-locked filter wobble): depth + rate + shape. The
            envelope is rendered per-sample against the scene tempo — live
            and bounced output are identical. */}
        {showMotion && (
          <div
            data-testid="bus-motion"
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm border whitespace-nowrap ${
              motion.amount > 0
                ? 'border-sas-accent/60 bg-sas-accent/10'
                : 'border-sas-border bg-sas-panel'
            }`}
            title="Filter motion: a tempo-locked wobble on this bus's summed output (0 = off)"
          >
            <span
              className={`text-[9px] font-bold tracking-widest select-none ${
                motion.amount > 0 ? 'text-sas-accent' : 'text-sas-muted/70'
              }`}
            >
              WOB
            </span>
            <input
              data-testid="bus-motion-amount"
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(motion.amount * 100)}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onMotionAmountChange(Number(e.target.value) / 100)
              }
              disabled={disabled}
              className="w-16 accent-sas-accent disabled:opacity-50"
              aria-label="Filter motion depth"
            />
            <span className="text-[9px] text-sas-muted/70 w-6 text-right select-none" data-testid="bus-motion-amount-label">
              {motion.amount > 0 ? `${Math.round(motion.amount * 100)}%` : 'Off'}
            </span>
            {onMotionTargetChange && (
              <select
                data-testid="bus-motion-target"
                value={motion.target ?? 'filter'}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  onMotionTargetChange(e.target.value as PanelBusMotionState['target'])
                }
                disabled={disabled}
                className="sas-input text-[10px] px-1 py-0.5"
                aria-label="Motion target"
                title="What the envelope drives: the filter cutoff, the level (trance gate), or the pan (auto-pan)"
              >
                {MOTION_TARGETS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
            <select
              data-testid="bus-motion-rate"
              value={motionRateValue}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                const picked = MOTION_RATES.find((r) => r.label === e.target.value);
                if (picked) onMotionRateChange(picked.qn);
              }}
              disabled={disabled}
              className="sas-input text-[10px] px-1 py-0.5"
              aria-label="Filter motion rate"
              title={motionHasPattern ? 'An agent-set per-bar pattern is active — picking a rate replaces it' : 'Wobble rate (note value)'}
            >
              {MOTION_RATES.map((rate) => (
                <option key={rate.label} value={rate.label}>
                  {rate.label}
                </option>
              ))}
              {motionHasPattern && (
                <option value="pattern" disabled>
                  Pattern
                </option>
              )}
              {!motionHasPattern && motionRateValue === 'custom' && (
                <option value="custom" disabled>
                  Custom
                </option>
              )}
            </select>
            <select
              data-testid="bus-motion-shape"
              value={motion.shape}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                onMotionShapeChange(e.target.value as PanelBusMotionState['shape'])
              }
              disabled={disabled}
              className="sas-input text-[10px] px-1 py-0.5"
              aria-label="Filter motion shape"
            >
              {MOTION_SHAPES.map((shape) => (
                <option key={shape.id} value={shape.id}>
                  {shape.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* FX chips */}
        <div className="flex items-center gap-1 max-w-[45%] min-w-0 overflow-x-auto">
          {bus.fx.map((fx: PanelBusFxEntry) => (
            <span
              key={`${fx.index}:${fx.pluginId}`}
              data-testid={`bus-fx-chip-${fx.index}`}
              draggable={canReorderFx}
              onDragStart={(e: React.DragEvent<HTMLSpanElement>) => {
                if (!canReorderFx) return;
                dragFromRef.current = fx.index;
                setDraggingFx(fx.index);
                if (e.dataTransfer) {
                  e.dataTransfer.effectAllowed = 'move';
                  // Required by Firefox to start a drag; the value is unused.
                  try {
                    e.dataTransfer.setData('text/plain', String(fx.index));
                  } catch {
                    /* some environments disallow setData — drag still works */
                  }
                }
              }}
              onDragEnd={() => {
                dragFromRef.current = null;
                setDraggingFx(null);
                setDragOverFx(null);
              }}
              onDragEnter={(e: React.DragEvent<HTMLSpanElement>) => {
                if (dragFromRef.current === null) return;
                e.preventDefault();
                setDragOverFx(fx.index);
              }}
              onDragOver={(e: React.DragEvent<HTMLSpanElement>) => {
                if (dragFromRef.current === null) return;
                e.preventDefault(); // allow drop
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                setDragOverFx((cur: number | null) => (cur === fx.index ? cur : fx.index));
              }}
              onDragLeave={() => {
                setDragOverFx((cur: number | null) => (cur === fx.index ? null : cur));
              }}
              onDrop={(e: React.DragEvent<HTMLSpanElement>) => {
                e.preventDefault();
                const from = dragFromRef.current;
                dragFromRef.current = null;
                setDraggingFx(null);
                setDragOverFx(null);
                if (from === null || from === fx.index || !onMoveFx) return;
                onMoveFx(from, fx.index);
              }}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-[10px] whitespace-nowrap ${
                fx.enabled
                  ? 'border-sas-accent/60 text-sas-accent bg-sas-accent/10'
                  : 'border-sas-border text-sas-muted/50 bg-sas-panel'
              }${draggingFx === fx.index ? ' opacity-50' : ''}${
                dragOverFx === fx.index && draggingFx !== fx.index ? ' ring-1 ring-sas-accent' : ''
              }${canReorderFx ? ' cursor-grab' : ''}`}
              title={`${fx.name}${fx.enabled ? '' : ' (bypassed)'}${canReorderFx ? ' — drag to reorder' : ''}`}
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
          title={fxPickerOpen ? 'Close the FX picker' : 'Add an FX plugin to the panel bus'}
        >
          {fxPickerOpen ? 'FX \u25B4' : 'FX +'}
        </button>
      </div>

      {/* FX picker (TrackDrawer Synth-tab grid idiom, over FX descriptors) */}
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
                title="Re-scan plugins — picks up newly installed FX and retries any that failed a previous scan"
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
