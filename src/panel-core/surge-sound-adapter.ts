/**
 * Surge XT sound adapter — the PanelSoundAdapter shared by every family whose
 * tracks host Surge XT (or a user-picked third-party VST3) as the instrument:
 * synth and bass today.
 *
 * A "sound" is the INSTRUMENT plugin's state: default Surge XT round-trips
 * through the Tracktion ValueTree (get/setPluginState); third-party
 * instruments (u-he Diva, Serum, …) need their RAW VST3 state
 * (get/setRawPluginState), which the ValueTree wrapper does not faithfully
 * preserve. The instrument is the first non-utility plugin on the track.
 * Matching only 'Surge' silently broke history for custom-instrument tracks
 * pre-split — hence the dual path.
 *
 * @since SDK 2.35.0
 */

import type { PluginHost, TrackSoundSnapshot } from '../types/plugin-sdk.types';
import type { PanelSoundAdapter } from './adapter.types';

/**
 * Resolve the track's instrument (first non-utility plugin) plus how its
 * state serializes (raw VST3 vs Tracktion ValueTree).
 */
async function getInstrument(
  host: PluginHost,
  trackId: string,
): Promise<{ index: number; isRaw: boolean } | null> {
  try {
    const plugins = await host.getTrackPlugins(trackId);
    const instrument = plugins.find(
      (p) => !p.name.includes('Volume') && !p.name.includes('Pan') && !p.name.includes('Level'),
    );
    if (!instrument) return null;
    return { index: instrument.index, isRaw: !instrument.name.includes('Surge') };
  } catch {
    return null;
  }
}

export interface SurgeSoundAdapterOverrides {
  /** Sound-history cap (default 12 — Surge state blobs are large). */
  historyMax?: number;
  /** Drawer action label (default 'Import Preset'). */
  importSoundLabel?: string;
}

export function createSurgeSoundAdapter(
  host: PluginHost,
  overrides: SurgeSoundAdapterOverrides = {},
): PanelSoundAdapter {
  const applySound = async (trackId: string, descriptor: unknown): Promise<void> => {
    const { state, stateType } = descriptor as { state: string; stateType?: 'raw' | 'valuetree' };
    const inst = await getInstrument(host, trackId);
    if (!inst) return;
    // Restore through the setter matching how the sound was captured. Absent
    // stateType ⇒ ValueTree (history recorded before the raw/ValueTree split).
    if (stateType === 'raw') await host.setRawPluginState(trackId, inst.index, state);
    else await host.setPluginState(trackId, inst.index, state);
  };
  return {
    applySound,
    captureSoundDescriptor: async (trackId: string) => {
      const inst = await getInstrument(host, trackId);
      if (!inst) return null;
      // Capture in the instrument's native serialization so restore is faithful.
      const state = inst.isRaw
        ? await host.getRawPluginState(trackId, inst.index)
        : await host.getPluginState(trackId, inst.index);
      return { descriptor: { state, stateType: inst.isRaw ? 'raw' : 'valuetree' } };
    },
    copySnapshot: async (trackId: string, snap: TrackSoundSnapshot) => {
      if (snap.kind !== 'preset') return 'default';
      await applySound(trackId, { state: snap.state, stateType: snap.stateType });
      // Persist the copy as the track's durable preset identity — getTrackSound
      // reads it, and the transition drift re-sync compares identities (an
      // unpersisted copy reads as "no sound" and gets re-pushed every load).
      // Absent stateType ⇒ ValueTree (same fallback applySound uses).
      await host
        .persistTrackPresetState?.(trackId, {
          state: snap.state,
          stateType: snap.stateType ?? 'valuetree',
          name: snap.label,
        })
        .catch(() => {});
      return snap.label;
    },
    descriptorFromSnapshot: (snap: TrackSoundSnapshot) => {
      const preset = snap as Extract<TrackSoundSnapshot, { kind: 'preset' }>;
      return { state: preset.state, stateType: preset.stateType };
    },
    acceptedSnapshotKind: 'preset',
    historyMax: overrides.historyMax ?? 12,
    importSoundLabel: overrides.importSoundLabel ?? 'Import Preset',
    importNoun: 'preset',
    previousSoundLabel: 'Previous preset',
  };
}
