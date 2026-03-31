/**
 * FxToggleBar Component
 *
 * Per-track FX control panel with 6 rows (one per FX category).
 * Each row: [Category toggle] [Preset 1-5 buttons] [Dry/Wet slider]
 *
 * Signal chain order: EQ -> Compressor -> Chorus -> Phaser -> Delay -> Reverb
 */

import React from 'react';
import type { FxCategory, TrackFxDetailState, FxCategoryDetailState } from '../types/fx-toggle.types';
import { FX_CATEGORIES, FX_DISPLAY_LABELS } from '../types/fx-toggle.types';
import { FX_PRESET_CONFIGS } from '../constants/fx-presets';

/** Per-category active colors */
const FX_COLORS: Record<FxCategory, string> = {
  eq: 'bg-blue-500',
  compressor: 'bg-orange-500',
  chorus: 'bg-teal-500',
  phaser: 'bg-purple-500',
  delay: 'bg-green-500',
  reverb: 'bg-cyan-500',
};

export interface FxToggleBarProps {
  trackId: string;
  fxState: TrackFxDetailState;
  onToggle: (trackId: string, category: FxCategory, enabled: boolean) => void;
  onPresetChange: (trackId: string, category: FxCategory, presetIndex: number) => void;
  onDryWetChange: (trackId: string, category: FxCategory, value: number) => void;
  disabled?: boolean;
}

export const FxToggleBar: React.FC<FxToggleBarProps> = ({
  trackId,
  fxState,
  onToggle,
  onPresetChange,
  onDryWetChange,
  disabled = false,
}) => {
  return (
    <div className="flex flex-col gap-1" data-testid="fx-toggle-bar">
      {FX_CATEGORIES.map((category: FxCategory) => {
        const detail: FxCategoryDetailState = fxState[category];
        const isActive = detail.enabled;
        const label = FX_DISPLAY_LABELS[category];
        const activeColor = FX_COLORS[category];
        const config = FX_PRESET_CONFIGS[category];

        return (
          <div key={category} className="flex items-center gap-0.5">
            {/* Category toggle button */}
            <button
              data-testid={`fx-toggle-${category}`}
              disabled={disabled}
              onClick={() => onToggle(trackId, category, !isActive)}
              className={`w-14 py-0.5 text-[10px] font-semibold rounded-sm transition-colors leading-none flex-shrink-0 text-center ${
                disabled
                  ? 'bg-sas-panel text-sas-muted/30 cursor-not-allowed'
                  : isActive
                    ? `${activeColor} text-white`
                    : 'bg-sas-panel-alt text-sas-muted/60 hover:bg-sas-border hover:text-sas-muted'
              }`}
              title={`${isActive ? 'Disable' : 'Enable'} ${category.toUpperCase()}`}
            >
              {label}
            </button>

            {/* Preset buttons 1-5 */}
            {config.presets.map((preset, idx: number) => (
              <button
                key={idx}
                data-testid={`fx-preset-${category}-${idx}`}
                disabled={disabled || !isActive}
                onClick={() => onPresetChange(trackId, category, idx)}
                className={`w-5 h-5 text-[9px] font-medium rounded-sm transition-colors leading-none flex-shrink-0 ${
                  disabled || !isActive
                    ? 'bg-sas-panel text-sas-muted/20 cursor-not-allowed'
                    : detail.presetIndex === idx
                      ? `${activeColor} text-white`
                      : 'bg-sas-panel-alt text-sas-muted/50 hover:bg-sas-border hover:text-sas-muted'
                }`}
                title={preset.name}
              >
                {idx + 1}
              </button>
            ))}

            {/* Dry/Wet slider */}
            <input
              type="range"
              data-testid={`fx-drywet-${category}`}
              min="0"
              max="100"
              value={Math.round(detail.dryWet * 100)}
              disabled={disabled || !isActive}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onDryWetChange(trackId, category, Number(e.target.value) / 100)
              }
              className="flex-1 min-w-[30px] h-3 accent-sas-accent disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
              title={`Dry/Wet: ${Math.round(detail.dryWet * 100)}%`}
            />
            <span className="text-[8px] text-sas-muted/50 w-6 text-right flex-shrink-0">
              {Math.round(detail.dryWet * 100)}%
            </span>
          </div>
        );
      })}
    </div>
  );
};
