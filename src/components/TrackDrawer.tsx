/**
 * TrackDrawer — the unified per-track drawer body.
 *
 * ONE drawer with a flat contextual tab strip. Which tabs appear is computed
 * from which callbacks the host panel provides:
 *   - FX      (onFxToggle)     — the 6-category FX toggle bar
 *   - Pick    (onSelect)       — instrument-plugin picker (+ native editor stage)
 *   - History (onRestoreSound) — sounds this track has had (restore / favorite)
 *   - Import  (onImportSound)  — copy a sound from a matching track in another scene
 *
 * The active tab is CONTROLLED by the host (activeTab / onTabChange) so the
 * track row's FX button and ▾ button can open the SAME drawer to a chosen tab.
 * When only one tab is enabled (e.g. loops = FX only) the strip is hidden and
 * that single view renders directly.
 *
 * (Was `InstrumentDrawer` — renamed once it grew an FX tab + Import tab. A
 * `TrackDrawer as InstrumentDrawer` alias is exported from the barrel for
 * backwards compatibility.)
 */

import React, { useState, useMemo } from 'react';
import type { InstrumentDescriptor, SoundHistoryEntry, PluginMidiNote } from '../types/plugin-sdk.types';
import type { FxCategory, TrackFxDetailState } from '../types/fx-toggle.types';
import { FxToggleBar } from './FxToggleBar';
import { PianoRollEditor } from './PianoRollEditor';

// ============================================================================
// Tabs
// ============================================================================

/** The contextual tabs a track drawer can show, in display order. */
export type DrawerTab = 'fx' | 'pick' | 'history' | 'import' | 'edit';

const TAB_LABELS: Record<DrawerTab, string> = {
  fx: 'FX',
  pick: 'Pick',
  history: 'History',
  import: 'Import',
  edit: 'Edit',
};

// ============================================================================
// Props
// ============================================================================

export interface TrackDrawerProps {
  /** Which tab is active (controlled by the host TrackRow). */
  activeTab: DrawerTab;
  /** Switch tabs (strip clicks). */
  onTabChange?: (tab: DrawerTab) => void;

  // --- FX tab (enabled when onFxToggle is provided) ---
  trackId: string;
  fxState: TrackFxDetailState;
  onFxToggle?: (category: FxCategory, enabled: boolean) => void;
  onFxPresetChange?: (category: FxCategory, presetIndex: number) => void;
  onFxDryWetChange?: (category: FxCategory, value: number) => void;
  /** Disable FX controls (e.g. while the track is generating). */
  fxDisabled?: boolean;

  // --- Pick tab (enabled when onSelect is provided) ---
  /** Available instrument plugins from engine scan. */
  instruments?: InstrumentDescriptor[];
  /** Currently loaded instrument plugin ID (null = default Surge XT). */
  currentPluginId?: string | null;
  /** Whether the instrument scan is still in progress. */
  isLoading?: boolean;
  /** Called when user selects an instrument (presence enables the Pick tab). */
  onSelect?: (pluginId: string) => void;
  /** Re-scan plugins. */
  onRefresh?: () => void;
  /** Pick-tab sub-view: show the native plugin editor instead of the grid. */
  editorStage?: boolean;
  /** Called when user clicks "Open Plugin Editor". */
  onShowEditor?: () => void;
  /** Called when user goes back from the editor to the instrument grid. */
  onBackToInstruments?: () => void;
  /** Name of the selected instrument (shown in the editor header). */
  selectedInstrumentName?: string | null;

  // --- History tab (enabled when onRestoreSound is provided) ---
  soundHistory?: readonly SoundHistoryEntry[];
  soundHistoryCursor?: number;
  /** Restore a sound by index; presence enables the History tab. */
  onRestoreSound?: (index: number) => void;
  /** Toggle the favorite (⭐) flag on a history entry; omit to hide the star. */
  onToggleFavorite?: (index: number) => void;

  // --- Import tab (enabled when onImportSound is provided) ---
  /** Open the sound-import picker; presence enables the Import tab. */
  onImportSound?: () => void;
  /** Button label, e.g. "Import Sample" (drums/instruments) or "Import Preset" (synths). */
  importSoundLabel?: string;

  // --- Edit tab (enabled when onNotesChange is provided) ---
  /** Current MIDI notes for the piano-roll editor. */
  editNotes?: readonly PluginMidiNote[];
  /** Persist edited notes; PRESENCE of this callback enables the Edit tab. */
  onNotesChange?: (notes: PluginMidiNote[]) => void;
  /** Scene length in bars (piano-roll grid width). Default 4. */
  editBars?: number;
  /** Scene BPM (piano-roll audition timing). Default 120. */
  editBpm?: number;
  /** Snap step in quarter notes for the piano roll (default 0.25). */
  editSnap?: number;
  /** Optional single-note preview when the user adds a note. */
  onAuditionNote?: (pitch: number, velocity: number, durationMs: number) => void;
}

// ============================================================================
// Component
// ============================================================================

export function TrackDrawer({
  activeTab,
  onTabChange,
  trackId,
  fxState,
  onFxToggle,
  onFxPresetChange,
  onFxDryWetChange,
  fxDisabled = false,
  instruments = [],
  currentPluginId = null,
  isLoading = false,
  onSelect,
  onRefresh,
  editorStage = false,
  onShowEditor,
  onBackToInstruments,
  selectedInstrumentName,
  soundHistory,
  soundHistoryCursor = -1,
  onRestoreSound,
  onToggleFavorite,
  onImportSound,
  importSoundLabel,
  editNotes,
  onNotesChange,
  editBars,
  editBpm,
  editSnap,
  onAuditionNote,
}: TrackDrawerProps): React.ReactElement {
  // --- Hooks (MUST stay above every early return) ---
  const [search, setSearch] = useState('');

  const fxEnabled = !!onFxToggle;
  const pickEnabled = !!onSelect;
  const historyEnabled = !!onRestoreSound;
  const importEnabled = !!onImportSound;
  const editEnabled = !!onNotesChange;

  const enabledTabs = useMemo((): DrawerTab[] => {
    const tabs: DrawerTab[] = [];
    if (fxEnabled) tabs.push('fx');
    if (pickEnabled) tabs.push('pick');
    if (historyEnabled) tabs.push('history');
    if (importEnabled) tabs.push('import');
    if (editEnabled) tabs.push('edit');
    return tabs;
  }, [fxEnabled, pickEnabled, historyEnabled, importEnabled, editEnabled]);

  /** Sentinel pluginId for the default Surge XT entry */
  const SURGE_XT_DEFAULT_ID = 'Surge XT';

  // Filter instruments by search query, with selected instrument always first.
  // Computed unconditionally so the hook order is stable across tab switches.
  const filtered = useMemo((): InstrumentDescriptor[] => {
    let all = instruments.filter((i: InstrumentDescriptor) => i.name !== 'Surge XT');
    if (search.trim()) {
      const q = search.toLowerCase();
      all = all.filter(
        (i: InstrumentDescriptor) =>
          i.name.toLowerCase().includes(q) || i.manufacturer.toLowerCase().includes(q),
      );
    }
    if (currentPluginId) {
      const selectedIdx = all.findIndex((i: InstrumentDescriptor) => i.pluginId === currentPluginId);
      if (selectedIdx > 0) {
        const [selected] = all.splice(selectedIdx, 1);
        all.unshift(selected);
      }
    }
    return all;
  }, [instruments, search, currentPluginId]);

  // --- Derived (non-hook) values ---
  const history = soundHistory ?? [];
  const effectiveTab: DrawerTab = enabledTabs.includes(activeTab)
    ? activeTab
    : enabledTabs[0] ?? 'fx';

  const tabClass = (active: boolean): string =>
    `px-2 py-0.5 text-xs rounded-sm transition-colors ${
      active ? 'bg-sas-accent/20 text-sas-accent font-medium' : 'text-sas-muted hover:text-sas-accent'
    }`;

  // The tab strip replaces the old "Sound" title. Hidden when only one tab is
  // enabled (e.g. loops = FX only) — that single view renders directly.
  const strip =
    enabledTabs.length > 1 ? (
      <div
        className="flex items-center gap-1 border-b border-sas-border pb-1"
        data-testid="sdk-drawer-tabs"
      >
        {enabledTabs.map((tab: DrawerTab) => (
          <button
            key={tab}
            type="button"
            data-testid={`sdk-drawer-tab-${tab}`}
            onClick={() => onTabChange?.(tab)}
            className={tabClass(effectiveTab === tab)}
          >
            {tab === 'history' && history.length > 0
              ? `History (${history.length})`
              : TAB_LABELS[tab]}
          </button>
        ))}
      </div>
    ) : null;

  // Subtle current-sound hint (the "Sound" title was removed in favour of tabs).
  const currentSound =
    soundHistoryCursor >= 0 && soundHistoryCursor < history.length
      ? history[soundHistoryCursor].label
      : null;

  const header =
    strip || currentSound ? (
      <div className="flex flex-col gap-1" data-testid="sdk-drawer-header">
        {strip}
        {currentSound && (
          <span
            className="text-[10px] text-sas-muted/60 truncate px-0.5"
            title={currentSound}
          >
            {currentSound}
          </span>
        )}
      </div>
    ) : null;

  // ---- Edit tab (piano-roll MIDI editor) ----
  if (effectiveTab === 'edit') {
    return (
      <div className="flex flex-col gap-2" data-testid="sdk-drawer-edit">
        {header}
        <PianoRollEditor
          notes={editNotes ?? []}
          onChange={onNotesChange ?? ((): void => {})}
          bars={editBars ?? 4}
          bpm={editBpm ?? 120}
          snap={editSnap}
          onAuditionNote={onAuditionNote}
        />
      </div>
    );
  }

  // ---- FX tab ----
  if (effectiveTab === 'fx') {
    return (
      <div className="flex flex-col gap-2" data-testid="sdk-drawer-fx">
        {header}
        <FxToggleBar
          trackId={trackId}
          fxState={fxState}
          onToggle={(_t: string, category: FxCategory, enabled: boolean) =>
            onFxToggle?.(category, enabled)
          }
          onPresetChange={(_t: string, category: FxCategory, presetIndex: number) =>
            onFxPresetChange?.(category, presetIndex)
          }
          onDryWetChange={(_t: string, category: FxCategory, value: number) =>
            onFxDryWetChange?.(category, value)
          }
          disabled={fxDisabled}
        />
      </div>
    );
  }

  // ---- Import tab ----
  if (effectiveTab === 'import') {
    const soundNoun = /preset/i.test(importSoundLabel ?? '')
      ? 'preset'
      : /sample/i.test(importSoundLabel ?? '')
        ? 'sample'
        : 'sound';
    return (
      <div className="flex flex-col gap-2" data-testid="sdk-drawer-import">
        {header}
        <p className="text-[11px] text-sas-muted/70 leading-snug">
          Copy the sound from a matching track in another scene — your MIDI stays, only the{' '}
          {soundNoun} changes.
        </p>
        <button
          type="button"
          data-testid="sdk-drawer-import-sound"
          onClick={onImportSound}
          className="w-full px-2 py-1.5 text-[11px] rounded-sm border border-sas-border text-sas-muted hover:border-sas-accent hover:text-sas-accent transition-colors"
          title="Copy a sound from a track in another scene (ignores contract)"
        >
          ⇪ {importSoundLabel ?? 'Import Sound'}
        </button>
      </div>
    );
  }

  // ---- History tab ----
  if (effectiveTab === 'history') {
    const order = history.map((_, i) => i).reverse(); // newest first
    return (
      <div className="flex flex-col gap-2">
        {header}
        {history.length === 0 ? (
          <div
            className="text-xs text-sas-muted/60 text-center py-3"
            data-testid="sdk-history-empty"
          >
            No sounds yet — shuffle to build history.
          </div>
        ) : (
          <ul
            className="flex flex-col gap-1 max-h-[160px] overflow-y-auto"
            data-testid="sdk-history-list"
          >
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
                        entry.favorite
                          ? 'text-yellow-400'
                          : 'text-sas-muted/40 hover:text-yellow-400'
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

  // ---- Pick tab: native editor stage ----
  if (effectiveTab === 'pick' && editorStage) {
    return (
      <div className="flex flex-col gap-2">
        {header}
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
        <button
          onClick={() => onShowEditor?.()}
          className="w-full py-2 text-xs font-medium rounded-sm border border-sas-accent bg-sas-accent/20 text-sas-accent hover:bg-sas-accent/40 transition-colors"
        >
          Open Plugin Editor
        </button>
      </div>
    );
  }

  // ---- Pick tab: instrument grid (default) ----
  const isDefaultSelected = currentPluginId === null;
  const isSelected = (pluginId: string): boolean => pluginId === currentPluginId;

  return (
    <div className="flex flex-col gap-2">
      {header}
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
        <div className="text-xs text-sas-muted/60 text-center py-3">Scanning plugins...</div>
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
              {isDefaultSelected && '✓ '}Surge XT
            </span>
            <span className="text-[9px] text-sas-muted/50 truncate w-full">Default</span>
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
                  {selected && '✓ '}
                  {inst.name}
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

/** Backwards-compatible alias — the drawer was named `InstrumentDrawer` before it grew FX/Import tabs. */
export { TrackDrawer as InstrumentDrawer };

export default TrackDrawer;
