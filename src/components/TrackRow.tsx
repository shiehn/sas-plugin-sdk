/**
 * SDK TrackRow — Reusable track row component for generator plugins.
 *
 * Renders a complete track UI with prompt input, generation controls,
 * shuffle/copy, volume/pan, mute/solo, FX drawer, and visual states
 * (amber pulse for "needs generation", progress overlay, error indicator).
 *
 * Layout matches TrackInput (main branch) for visual parity.
 *
 * Depends only on PluginHost types + existing shared renderer components.
 */

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { InstrumentDrawer } from './InstrumentDrawer';
import type { InstrumentDescriptor } from '../types/plugin-sdk.types';
import { VolumeSlider } from './VolumeSlider';
import { PanSlider } from './PanSlider';
import { FxToggleBar } from './FxToggleBar';
import { SorceryProgressBar } from './SorceryProgressBar';
import type { TrackFxDetailState, FxCategory } from '../types/fx-toggle.types';

// ============================================================================
// Props
// ============================================================================

export interface SDKTrackRowProps {
  /** Track identity */
  track: { id: string; name: string; role?: string };
  /** Current prompt text (optional — omit when using contentSlot) */
  prompt?: string;
  /** Playback state */
  runtimeState: { muted: boolean; solo: boolean; volume: number; pan: number };
  /** FX category states */
  fxDetailState: TrackFxDetailState;
  /** FX panel visibility */
  fxDrawerOpen: boolean;
  /** Generation in progress */
  isGenerating?: boolean;
  /** Auth state */
  isAuthenticated?: boolean;
  /** Error from last generation */
  error?: string | null;
  /** Enables shuffle/copy buttons */
  hasMidi?: boolean;
  /** Progress % (for persistence across scene switches) */
  generationProgress?: number;
  /** For progress bar pacing */
  estimatedGenerationMs?: number;
  /** Prompt edit (optional — omit to hide prompt input) */
  onPromptChange?: (prompt: string) => void;
  /** "Create" button / Enter key (optional — omit to hide Create button) */
  onGenerate?: () => void;
  /** Shuffle preset (optional — omit to hide Shuffle button) */
  onShuffle?: () => void;
  /** Duplicate track (optional — omit to hide Copy button) */
  onCopy?: () => void;
  /** Delete track */
  onDelete: () => void;
  /** Custom content replacing the prompt input (e.g., sample info display) */
  contentSlot?: React.ReactNode;
  /** Toggle mute */
  onMuteToggle: () => void;
  /** Toggle solo */
  onSoloToggle: () => void;
  /** Volume slider */
  onVolumeChange: (vol: number) => void;
  /** Pan slider */
  onPanChange: (pan: number) => void;
  /** FX category toggle (optional — omit to hide FX button) */
  onFxToggle?: (cat: FxCategory, enabled: boolean) => void;
  /** FX preset select */
  onFxPresetChange?: (cat: FxCategory, idx: number) => void;
  /** FX dry/wet */
  onFxDryWetChange?: (cat: FxCategory, val: number) => void;
  /** Open/close FX (optional — omit to hide FX button) */
  onToggleFxDrawer?: () => void;
  /** Progress persistence callback */
  onProgressChange?: (pct: number) => void;
  /** Left border accent color */
  accentColor?: string;
  // --- Instrument Plugin Selection ---
  /** Current instrument display name (null/undefined = Surge XT default) */
  instrumentName?: string | null;
  /** Whether the current instrument plugin is missing from the system */
  instrumentMissing?: boolean;
  /** Whether the instrument drawer is open */
  instrumentDrawerOpen?: boolean;
  /** Toggle the instrument drawer */
  onToggleInstrumentDrawer?: () => void;
  /** Available instrument plugins for the drawer */
  availableInstruments?: InstrumentDescriptor[];
  /** Currently loaded instrument plugin ID */
  currentInstrumentPluginId?: string | null;
  /** Called when user selects an instrument from the drawer */
  onInstrumentSelect?: (pluginId: string) => void;
  /** Whether instrument scan is loading */
  instrumentsLoading?: boolean;
  /** Re-scan for instruments */
  onRefreshInstruments?: () => void;
  // --- Instrument Editor (Stage 2) ---
  /** Which stage the instrument drawer is in */
  instrumentDrawerStage?: 'instruments' | 'editor';
  /** Called when user clicks "Open Editor" */
  onShowEditor?: () => void;
  /** Called when user wants to go back from editor view */
  onBackToInstruments?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function TrackRow({
  track,
  prompt,
  runtimeState,
  fxDetailState,
  fxDrawerOpen,
  isGenerating = false,
  isAuthenticated = false,
  error,
  hasMidi = false,
  generationProgress = 0,
  estimatedGenerationMs = 15000,
  onPromptChange,
  onGenerate,
  onShuffle,
  onCopy,
  onDelete,
  contentSlot,
  onMuteToggle,
  onSoloToggle,
  onVolumeChange,
  onPanChange,
  onFxToggle,
  onFxPresetChange,
  onFxDryWetChange,
  onToggleFxDrawer,
  onProgressChange,
  accentColor = '#A78BFA',
  instrumentName,
  instrumentMissing,
  instrumentDrawerOpen,
  onToggleInstrumentDrawer,
  availableInstruments,
  currentInstrumentPluginId,
  onInstrumentSelect,
  instrumentsLoading,
  onRefreshInstruments,
  instrumentDrawerStage,
  onShowEditor,
  onBackToInstruments,
}: SDKTrackRowProps): React.ReactElement {
  const { muted: isMuted, solo: isSoloed, volume: currentVolume, pan: currentPan } = runtimeState;

  // "Needs generation" = has prompt, no MIDI yet, not currently generating
  const needsGeneration = !!(prompt?.trim() && !hasMidi && !isGenerating);

  const hasFxActive = Object.values(fxDetailState).some(
    (d: { enabled: boolean }) => d.enabled
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && onGenerate) {
      e.preventDefault();
      onGenerate();
    }
  };

  // Amber pulse class for "needs generation" state
  const borderColorStyle = needsGeneration
    ? undefined // handled by className animation
    : accentColor;

  const borderClass = needsGeneration
    ? 'border-amber-400 animate-pulse'
    : 'border-sas-border';

  return (
    <div data-testid="sdk-track-row-wrapper" className="w-full">
      <div
        data-testid="sdk-track-row"
        className={`relative flex items-stretch gap-1 p-2 rounded-sm border w-full overflow-hidden ${borderClass} bg-sas-panel-alt`}
        style={{
          borderLeftColor: needsGeneration ? '#f59e0b' : borderColorStyle,
          borderLeftWidth: '3px',
        }}
      >
        {/* Generating progress overlay - stops before buttons (right-44) */}
        {isGenerating && (
          <div className="absolute left-0 top-0 bottom-0 right-44 z-20">
            <SorceryProgressBar
              isLoading={true}
              statusText="CONJURING MIDI..."
              heightClass="h-full"
              initialProgress={generationProgress}
              onProgressChange={onProgressChange}
              estimatedDurationMs={estimatedGenerationMs}
            />
          </div>
        )}

        {/* Left: Content area (prompt input or custom content slot) with track name, volume, and pan underneath */}
        <div className="flex flex-col flex-1 min-w-0 relative z-10">
          {contentSlot ? contentSlot : onPromptChange ? (
            <input
              type="text"
              data-testid="sdk-prompt-input"
              value={prompt ?? ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onPromptChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your part..."
              disabled={isGenerating}
              className="sas-input w-full px-2 py-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            />
          ) : null}
          {/* Track name, volume slider, and pan slider in horizontal row */}
          <div className="flex items-center gap-2 mt-1">
            {track.name && (
              <span className="text-[10px] text-sas-muted/60 truncate pl-2 flex-shrink-0 max-w-[80px]" title={track.name}>
                {track.name}
              </span>
            )}
            <span className="text-[9px] text-sas-muted/50 flex-shrink-0">vol:</span>
            <VolumeSlider
              value={currentVolume}
              onChange={onVolumeChange}
              disabled={isGenerating}
              className="flex-1 min-w-[40px]"
            />
            <span className="text-[9px] text-sas-muted/50 flex-shrink-0">pan:</span>
            <PanSlider
              value={currentPan}
              onChange={onPanChange}
              disabled={isGenerating}
              className="w-10 flex-shrink-0"
            />
          </div>
        </div>

        {/* Error indicator - shows when generation failed */}
        {error && (
          <div
            data-testid="sdk-error-indicator"
            className="flex-shrink-0 relative z-10 self-stretch flex items-center px-1 group cursor-help"
            title={error}
          >
            <div className="relative">
              <AlertCircle
                className="w-5 h-5 text-red-500 animate-pulse"
                strokeWidth={2.5}
              />
              {/* Tooltip - appears on hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-red-900/95 text-red-100 text-xs rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 max-w-[200px] truncate">
                {error}
              </div>
            </div>
          </div>
        )}

        {/* Right: Button grid (2 rows) - z-30 to stay above generating overlay */}
        <div className="flex flex-col gap-0.5 flex-shrink-0 relative z-30 justify-center">
          {/* Top row: [Create] [Copy] M x — Create/Copy only shown when handlers provided */}
          <div className="flex gap-1 items-center">
            {onGenerate && (
              <button
                data-testid="sdk-generate-button"
                onClick={onGenerate}
                disabled={!isAuthenticated || isGenerating || !prompt?.trim()}
                className={`w-14 py-0.5 rounded-sm text-xs font-medium transition-colors border ${
                  !isAuthenticated || isGenerating
                    ? 'bg-sas-panel border-sas-border text-sas-muted/50 cursor-not-allowed'
                    : needsGeneration
                      ? 'bg-amber-500/30 border-amber-500 text-amber-400 hover:bg-amber-500 hover:text-sas-bg animate-pulse'
                      : prompt?.trim()
                        ? 'bg-sas-accent/20 border-sas-accent text-sas-accent hover:bg-sas-accent hover:text-sas-bg'
                        : 'bg-sas-panel border-sas-border text-sas-muted/50 cursor-not-allowed'
                }`}
                title={!isAuthenticated ? 'Please log in' : isGenerating ? 'Generating...' : 'Generate MIDI'}
              >
                Create
              </button>
            )}
            {onCopy && (
              <button
                data-testid="sdk-copy-button"
                onClick={onCopy}
                disabled={!hasMidi || isGenerating}
                className={`w-14 py-0.5 rounded-sm text-xs font-medium transition-colors border ${
                  !hasMidi || isGenerating
                    ? 'bg-sas-panel border-sas-border text-sas-muted/30 cursor-not-allowed'
                    : 'bg-sas-panel-alt border-sas-border text-sas-muted hover:border-sas-accent hover:text-sas-accent'
                }`}
                title={hasMidi ? 'Duplicate track with different preset' : 'Generate MIDI first'}
              >
                Copy
              </button>
            )}
            <button
              data-testid="sdk-mute-button"
              onClick={onMuteToggle}
              disabled={isGenerating}
              className={`px-1.5 py-0.5 text-xs font-bold rounded transition-colors ${
                isGenerating
                  ? 'bg-sas-panel text-sas-muted/50 cursor-not-allowed'
                  : isMuted
                    ? 'bg-red-600 text-white'
                    : 'bg-sas-panel-alt text-sas-muted hover:bg-sas-border'
              }`}
              title={isMuted ? 'Unmute track' : 'Mute track'}
            >
              M
            </button>
            <button
              data-testid="sdk-delete-button"
              onClick={onDelete}
              className="text-sas-danger/70 hover:text-sas-danger px-1 py-0.5 transition-colors text-sm"
              title="Delete track"
            >
              x
            </button>
          </div>
          {/* Bottom row: [Shuffle] [FX] Solo [P] — Shuffle/FX only shown when handlers provided */}
          <div className="flex gap-1 items-center">
            {onShuffle && (
              <button
                data-testid="sdk-shuffle-button"
                onClick={onShuffle}
                disabled={!hasMidi || isGenerating || !!currentInstrumentPluginId}
                className={`w-14 py-0.5 rounded-sm text-xs font-medium transition-colors border ${
                  !hasMidi || isGenerating || !!currentInstrumentPluginId
                    ? 'bg-sas-panel border-sas-border text-sas-muted/30 cursor-not-allowed'
                    : 'bg-sas-panel-alt border-sas-border text-sas-muted hover:border-sas-accent hover:text-sas-accent'
                }`}
                title={
                  currentInstrumentPluginId
                    ? 'Shuffle only works with default Surge XT'
                    : hasMidi
                      ? 'Re-roll sound (keep MIDI)'
                      : 'Generate MIDI first'
                }
              >
                Shuffle
              </button>
            )}
            {onToggleFxDrawer && (
              <button
                data-testid="sdk-fx-button"
                onClick={onToggleFxDrawer}
                disabled={isGenerating}
                className={`w-14 py-0.5 rounded-sm text-xs font-medium transition-colors border ${
                  isGenerating
                    ? 'bg-sas-panel border-sas-border text-sas-muted/50 cursor-not-allowed'
                    : fxDrawerOpen
                      ? 'bg-sas-accent border-sas-accent text-sas-bg'
                      : hasFxActive
                        ? 'bg-sas-accent/20 border-sas-accent text-sas-accent hover:bg-sas-accent hover:text-sas-bg'
                        : 'bg-sas-panel-alt border-sas-border text-sas-muted hover:border-sas-accent hover:text-sas-accent'
                }`}
                title={fxDrawerOpen ? 'Hide FX controls' : 'Show FX controls'}
              >
                FX
              </button>
            )}
            <button
              data-testid="sdk-solo-button"
              onClick={onSoloToggle}
              disabled={isGenerating}
              className={`px-1.5 py-0.5 text-xs font-bold rounded transition-colors ${
                isGenerating
                  ? 'bg-sas-panel text-sas-muted/50 cursor-not-allowed'
                  : isSoloed
                    ? 'bg-yellow-500 text-black'
                    : 'bg-sas-panel-alt text-sas-muted hover:bg-sas-border'
              }`}
              title={isSoloed ? 'Unsolo track' : 'Solo track'}
            >
              S
            </button>
            {onToggleInstrumentDrawer && (
              <button
                data-testid="sdk-plugin-button"
                onClick={onToggleInstrumentDrawer}
                disabled={isGenerating}
                className={`px-1.5 py-0.5 text-xs font-bold rounded transition-colors ${
                  isGenerating
                    ? 'bg-sas-panel text-sas-muted/50 cursor-not-allowed'
                    : instrumentDrawerOpen
                      ? 'bg-sas-accent border-sas-accent text-sas-bg'
                      : instrumentMissing
                        ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/40'
                        : 'bg-sas-panel-alt text-sas-muted hover:bg-sas-border'
                }`}
                title={`Plugin: ${instrumentName ?? 'Surge XT'}${instrumentMissing ? ' (missing)' : ''}`}
              >
                P
              </button>
            )}
          </div>
        </div>
      </div>

      {/* FX Drawer */}
      {fxDrawerOpen && !instrumentDrawerOpen && (
        <div data-testid="sdk-fx-drawer" className="border border-t-0 border-sas-border bg-sas-bg rounded-b-sm px-3 py-2 max-h-[180px] overflow-y-auto">
          <FxToggleBar
            trackId={track.id}
            fxState={fxDetailState}
            onToggle={(_trackId: string, category: FxCategory, enabled: boolean) => onFxToggle?.(category, enabled)}
            onPresetChange={(_trackId: string, category: FxCategory, presetIndex: number) => onFxPresetChange?.(category, presetIndex)}
            onDryWetChange={(_trackId: string, category: FxCategory, value: number) => onFxDryWetChange?.(category, value)}
            disabled={isGenerating}
          />
        </div>
      )}

      {/* Instrument Drawer */}
      {instrumentDrawerOpen && !fxDrawerOpen && availableInstruments && onInstrumentSelect && onRefreshInstruments && (
        <div data-testid="sdk-instrument-drawer" className="border border-t-0 border-sas-border bg-sas-bg rounded-b-sm px-3 py-2">
          <InstrumentDrawer
            instruments={availableInstruments}
            currentPluginId={currentInstrumentPluginId ?? null}
            isLoading={instrumentsLoading ?? false}
            onSelect={onInstrumentSelect}
            onRefresh={onRefreshInstruments}
            stage={instrumentDrawerStage}
            onShowEditor={onShowEditor}
            onBackToInstruments={onBackToInstruments}
            selectedInstrumentName={instrumentName}
          />
        </div>
      )}
    </div>
  );
}

export default TrackRow;
