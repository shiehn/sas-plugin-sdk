/**
 * FX Toggle Types
 *
 * Types and constants for per-track FX toggle buttons.
 * Each track can enable/disable 6 FX categories independently.
 * The engine is the source of truth — no database persistence needed.
 */

/** Available FX categories in signal chain order */
export type FxCategory = 'eq' | 'compressor' | 'chorus' | 'phaser' | 'delay' | 'reverb';

/** All FX categories in signal chain order */
export const FX_CATEGORIES: readonly FxCategory[] = [
  'eq',
  'compressor',
  'chorus',
  'phaser',
  'delay',
  'reverb',
] as const;

/** Position in the signal chain (lower = earlier) */
export const FX_CHAIN_ORDER: Record<FxCategory, number> = {
  eq: 0,
  compressor: 1,
  chorus: 2,
  phaser: 3,
  delay: 4,
  reverb: 5,
};

/** Map from FxCategory to Tracktion Engine built-in plugin xmlTypeName */
export const FX_ENGINE_PLUGIN_NAMES: Record<FxCategory, string> = {
  eq: '4bandEq',
  compressor: 'compressor',
  chorus: 'chorus',
  phaser: 'phaser',
  delay: 'delay',
  reverb: 'reverb',
};

/** Display labels for UI buttons */
export const FX_DISPLAY_LABELS: Record<FxCategory, string> = {
  eq: 'EQ',
  compressor: 'Comp',
  chorus: 'Chorus',
  phaser: 'Phaser',
  delay: 'Delay',
  reverb: 'Reverb',
};

/** Per-track FX state: which categories are active */
export interface TrackFxState {
  eq: boolean;
  compressor: boolean;
  chorus: boolean;
  phaser: boolean;
  delay: boolean;
  reverb: boolean;
}

/** Default state: all FX disabled */
export const EMPTY_FX_STATE: TrackFxState = {
  eq: false,
  compressor: false,
  chorus: false,
  phaser: false,
  delay: false,
  reverb: false,
};

// ============================================================================
// Preset Types
// ============================================================================

/** A single FX preset definition */
export interface FxPreset {
  /** Display name (e.g. "Room", "Hall") */
  name: string;
  /** Short label for button (e.g. "RM", "HL") */
  shortLabel: string;
  /** Map from automatable parameter name -> value (set via setPluginParameter) */
  params: Record<string, number>;
  /** CachedValue params set via XML state (getPluginState/setPluginState) */
  xmlStateParams?: Record<string, number>;
  /** BPM-relative delay time multiplier (1.0 = quarter note). When set, Delay Time is computed at apply time. */
  noteMultiplier?: number;
  /** Fixed delay time in ms (non-BPM-synced). Mutually exclusive with noteMultiplier. */
  fixedLengthMs?: number;
}

/** How dry/wet is applied to the plugin */
export type MixInterpolation = 'direct' | 'gain-scale' | 'ratio-scale';

/** Preset configuration for an FX category */
export interface FxPresetConfig {
  /** Exactly 5 presets */
  presets: [FxPreset, FxPreset, FxPreset, FxPreset, FxPreset];
  /** Name of the native mix/wet parameter, or null if no native dry/wet */
  mixParamName: string | null;
  /** XML attribute name for dry/wet control (for plugins with no automatable mix param, e.g. chorus/phaser) */
  mixXmlAttr?: string;
  /** How to apply dry/wet (defaults to 'direct') */
  mixInterpolation: MixInterpolation;
}

/** Per-category detail state for a single FX on a track */
export interface FxCategoryDetailState {
  enabled: boolean;
  presetIndex: number;  // 0-4
  dryWet: number;       // 0.0-1.0
}

/** Extended FX state per track with preset and dry/wet info */
export type TrackFxDetailState = Record<FxCategory, FxCategoryDetailState>;

/** Default dry/wet mix level (33% — musically useful for most effects) */
export const DEFAULT_FX_DRY_WET = 0.33;

/** Default detail state for a single category */
export const DEFAULT_FX_CATEGORY_DETAIL: FxCategoryDetailState = {
  enabled: false,
  presetIndex: 0,
  dryWet: DEFAULT_FX_DRY_WET,
};

/** Default detail state: all FX disabled, preset 0, full wet */
export const EMPTY_FX_DETAIL_STATE: TrackFxDetailState = {
  eq: { ...DEFAULT_FX_CATEGORY_DETAIL },
  compressor: { ...DEFAULT_FX_CATEGORY_DETAIL },
  chorus: { ...DEFAULT_FX_CATEGORY_DETAIL },
  phaser: { ...DEFAULT_FX_CATEGORY_DETAIL },
  delay: { ...DEFAULT_FX_CATEGORY_DETAIL },
  reverb: { ...DEFAULT_FX_CATEGORY_DETAIL },
};

/** Persisted FX data for a single category (stored as JSON in database) */
export interface FxPresetDataEntry {
  presetIndex: number;
  dryWet: number;
  enabled: boolean;
}

/** Persisted FX data format (stored as JSON in database) */
export type FxPresetData = Partial<Record<FxCategory, FxPresetDataEntry>>;
