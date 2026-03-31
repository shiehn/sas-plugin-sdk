/**
 * FX Preset Definitions
 *
 * 5 presets per FX category (30 total).
 *
 * Parameter names must match the Tracktion Engine's AutomatableParameter names
 * for each built-in plugin exactly (case-sensitive).
 *
 * Chorus & Phaser have ZERO automatable parameters — all values are set via
 * XML state (CachedValues on the plugin ValueTree).
 *
 * Lives in shared/ so both main process (services) and renderer (UI) can import.
 */

import type { FxCategory, FxPresetConfig } from '../types/fx-toggle.types';

// ============================================================================
// EQ (4-Band Equaliser)
// ============================================================================

const EQ_PRESETS: FxPresetConfig = {
  presets: [
    {
      name: 'The Smiley',
      shortLabel: 'SM',
      params: {
        'Low-shelf freq': 80, 'Low-shelf gain': 4, 'Low-shelf Q': 0.5,
        'Mid freq 1': 500, 'Mid gain 1': -3, 'Mid Q 1': 0.7,
        'Mid freq 2': 2000, 'Mid gain 2': -2, 'Mid Q 2': 0.7,
        'High-shelf freq': 12000, 'High-shelf gain': 4, 'High-shelf Q': 0.5,
      },
    },
    {
      name: 'Telephone',
      shortLabel: 'TP',
      params: {
        'Low-shelf freq': 400, 'Low-shelf gain': -20, 'Low-shelf Q': 1.0,
        'Mid freq 1': 1000, 'Mid gain 1': 5, 'Mid Q 1': 2.0,
        'Mid freq 2': 3000, 'Mid gain 2': -5, 'Mid Q 2': 1.0,
        'High-shelf freq': 5000, 'High-shelf gain': -20, 'High-shelf Q': 1.0,
      },
    },
    {
      name: 'Warmth',
      shortLabel: 'WM',
      params: {
        'Low-shelf freq': 120, 'Low-shelf gain': 3, 'Low-shelf Q': 0.7,
        'Mid freq 1': 400, 'Mid gain 1': 2, 'Mid Q 1': 1.0,
        'Mid freq 2': 4000, 'Mid gain 2': 0, 'Mid Q 2': 0.5,
        'High-shelf freq': 10000, 'High-shelf gain': -4, 'High-shelf Q': 0.5,
      },
    },
    {
      name: 'Vocal Air',
      shortLabel: 'VA',
      params: {
        'Low-shelf freq': 100, 'Low-shelf gain': -6, 'Low-shelf Q': 0.7,
        'Mid freq 1': 300, 'Mid gain 1': -2, 'Mid Q 1': 1.0,
        'Mid freq 2': 1500, 'Mid gain 2': 0, 'Mid Q 2': 0.5,
        'High-shelf freq': 14000, 'High-shelf gain': 6, 'High-shelf Q': 0.4,
      },
    },
    {
      name: 'De-Box',
      shortLabel: 'DB',
      params: {
        'Low-shelf freq': 60, 'Low-shelf gain': 0, 'Low-shelf Q': 0.5,
        'Mid freq 1': 350, 'Mid gain 1': -5, 'Mid Q 1': 2.0,
        'Mid freq 2': 800, 'Mid gain 2': -3, 'Mid Q 2': 2.0,
        'High-shelf freq': 10000, 'High-shelf gain': 0, 'High-shelf Q': 0.5,
      },
    },
  ],
  mixParamName: null,
  mixInterpolation: 'gain-scale',
};

// ============================================================================
// Compressor
// ============================================================================

const COMPRESSOR_PRESETS: FxPresetConfig = {
  presets: [
    {
      name: 'Vocal Leveler',
      shortLabel: 'VL',
      params: { 'Threshold': 0.251, 'Ratio': 0.5, 'Attack': 20.0, 'Release': 200.0, 'Output': 2.0 },
    },
    {
      name: 'Drum Smash',
      shortLabel: 'DS',
      params: { 'Threshold': 0.100, 'Ratio': 0.1, 'Attack': 0.5, 'Release': 100.0, 'Output': 8.0 },
    },
    {
      name: 'Bus Glue',
      shortLabel: 'BG',
      params: { 'Threshold': 0.316, 'Ratio': 0.666, 'Attack': 80.0, 'Release': 150.0, 'Output': 1.0 },
    },
    {
      name: 'Bass Anchor',
      shortLabel: 'BA',
      params: { 'Threshold': 0.177, 'Ratio': 0.25, 'Attack': 10.0, 'Release': 250.0, 'Output': 4.0 },
    },
    {
      name: 'Safety Net',
      shortLabel: 'SN',
      params: { 'Threshold': 0.891, 'Ratio': 0.0, 'Attack': 0.3, 'Release': 50.0, 'Output': 0.0 },
    },
  ],
  mixParamName: null,
  mixInterpolation: 'ratio-scale',
};

// ============================================================================
// Chorus
// ============================================================================

const CHORUS_PRESETS: FxPresetConfig = {
  presets: [
    {
      name: 'Dimension',
      shortLabel: 'DM',
      params: {},
      xmlStateParams: { depthMs: 1.5, speedHz: 0.5, width: 1.0, mixProportion: 0.5 },
    },
    {
      name: '80s Crystal',
      shortLabel: '80',
      params: {},
      xmlStateParams: { depthMs: 4.0, speedHz: 2.5, width: 0.8, mixProportion: 0.4 },
    },
    {
      name: 'Sea Sick',
      shortLabel: 'SS',
      params: {},
      xmlStateParams: { depthMs: 7.0, speedHz: 0.8, width: 0.3, mixProportion: 1.0 },
    },
    {
      name: 'Pseudo-Leslie',
      shortLabel: 'PL',
      params: {},
      xmlStateParams: { depthMs: 2.0, speedHz: 6.0, width: 0.9, mixProportion: 0.7 },
    },
    {
      name: 'Thickener',
      shortLabel: 'TK',
      params: {},
      xmlStateParams: { depthMs: 1.0, speedHz: 0.2, width: 1.0, mixProportion: 0.3 },
    },
  ],
  mixParamName: null,
  mixXmlAttr: 'mixProportion',
  mixInterpolation: 'direct',
};

// ============================================================================
// Phaser
// ============================================================================

const PHASER_PRESETS: FxPresetConfig = {
  presets: [
    {
      name: 'Slow Burn',
      shortLabel: 'SB',
      params: {},
      xmlStateParams: { depth: 6.0, rate: 0.1, feedback: 0.3 },
    },
    {
      name: 'Funky Quack',
      shortLabel: 'FQ',
      params: {},
      xmlStateParams: { depth: 3.0, rate: 2.0, feedback: 0.8 },
    },
    {
      name: 'Jet Plane',
      shortLabel: 'JP',
      params: {},
      xmlStateParams: { depth: 8.0, rate: 0.2, feedback: 0.9 },
    },
    {
      name: 'Underwater',
      shortLabel: 'UW',
      params: {},
      xmlStateParams: { depth: 1.5, rate: 4.0, feedback: 0.1 },
    },
    {
      name: 'Static Notch',
      shortLabel: 'ST',
      params: {},
      xmlStateParams: { depth: 2.0, rate: 0.05, feedback: 0.6 },
    },
  ],
  mixParamName: null,
  mixXmlAttr: 'depth',
  mixInterpolation: 'direct',
};

// ============================================================================
// Delay
// ============================================================================

const DELAY_PRESETS: FxPresetConfig = {
  presets: [
    {
      name: 'Vocal Slap',
      shortLabel: 'VS',
      fixedLengthMs: 110,
      params: { 'Feedback': -20.0, 'Mix proportion': 0.25 },
    },
    {
      name: 'Grand Canyon',
      shortLabel: 'GC',
      noteMultiplier: 1.0,
      params: { 'Feedback': -4.0, 'Mix proportion': 0.45 },
    },
    {
      name: 'Wide Doubler',
      shortLabel: 'WD',
      fixedLengthMs: 25,
      params: { 'Feedback': -30.0, 'Mix proportion': 0.5 },
    },
    {
      name: 'Dub Echo',
      shortLabel: 'DE',
      noteMultiplier: 0.6,
      params: { 'Feedback': -1.5, 'Mix proportion': 0.4 },
    },
    {
      name: 'Rhythmic Wash',
      shortLabel: 'RW',
      noteMultiplier: 0.75,
      params: { 'Feedback': -8.0, 'Mix proportion': 0.2 },
    },
  ],
  mixParamName: 'Mix proportion',
  mixInterpolation: 'direct',
};

// ============================================================================
// Reverb
// ============================================================================

const REVERB_PRESETS: FxPresetConfig = {
  presets: [
    {
      name: 'Drum Room',
      shortLabel: 'DR',
      params: { 'Room Size': 0.2, 'Damping': 0.2, 'Wet Level': 0.15, 'Dry Level': 0.5, 'Width': 0.8 },
    },
    {
      name: 'Vocal Hall',
      shortLabel: 'VH',
      params: { 'Room Size': 0.8, 'Damping': 0.6, 'Wet Level': 0.25, 'Dry Level': 0.5, 'Width': 1.0 },
    },
    {
      name: 'Cathedral',
      shortLabel: 'CT',
      params: { 'Room Size': 1.0, 'Damping': 0.1, 'Wet Level': 0.333, 'Dry Level': 0.2, 'Width': 1.0 },
    },
    {
      name: 'Tile Bathroom',
      shortLabel: 'TB',
      params: { 'Room Size': 0.15, 'Damping': 0.0, 'Wet Level': 0.2, 'Dry Level': 0.5, 'Width': 0.5 },
    },
    {
      name: 'Vintage Plate',
      shortLabel: 'VP',
      params: { 'Room Size': 0.4, 'Damping': 1.0, 'Wet Level': 0.2, 'Dry Level': 0.5, 'Width': 1.0 },
    },
  ],
  mixParamName: 'Wet Level',
  mixInterpolation: 'direct',
};

// ============================================================================
// Export
// ============================================================================

/** All preset configs keyed by FX category */
export const FX_PRESET_CONFIGS: Record<FxCategory, FxPresetConfig> = {
  eq: EQ_PRESETS,
  compressor: COMPRESSOR_PRESETS,
  chorus: CHORUS_PRESETS,
  phaser: PHASER_PRESETS,
  delay: DELAY_PRESETS,
  reverb: REVERB_PRESETS,
};
