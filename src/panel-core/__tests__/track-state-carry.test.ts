/**
 * carryTrackViewState — the loadTracks merge that keeps purely in-memory
 * state alive across a reload. Regression pin for the "agent mutation slams
 * every open drawer shut" bug: an ephemeral loop-range change from the chat
 * agent fired onAfterAgentMutation → loadTracks, which rebuilt every row with
 * drawerOpen:false while the user had the Edit-tab piano roll open.
 */
import { newTrackState, carryTrackViewState, type GeneratorTrackState } from '../track-state';
import type { PluginTrackHandle, PluginMidiNote } from '../../types/plugin-sdk.types';

function handle(dbId: string, id = `eng-${dbId}`): PluginTrackHandle {
  return { id, dbId, name: `synth-${dbId}` } as PluginTrackHandle;
}

const NOTES: PluginMidiNote[] = [
  { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 },
  { pitch: 64, startBeat: 60, durationBeats: 2, velocity: 90 },
] as PluginMidiNote[];

function loaded(dbId: string, overrides: Partial<GeneratorTrackState> = {}): GeneratorTrackState {
  return newTrackState(handle(dbId), overrides);
}

describe('carryTrackViewState', () => {
  it('keeps the drawer open on the Edit tab and the edit buffer intact across a reload', () => {
    const prev = [
      loaded('a', {
        drawerOpen: true,
        drawerTab: 'edit',
        editorStage: true,
        editNotes: NOTES,
        editBars: 16,
        editBpm: 128,
        editBeatsPerBar: 4,
      }),
    ];
    // What loadTracks rebuilds: fresh defaults + fresh data.
    const next = [loaded('a', { hasMidi: true, prompt: 'dark pad' })];

    const [merged] = carryTrackViewState(prev, next);
    expect(merged.drawerOpen).toBe(true);
    expect(merged.drawerTab).toBe('edit');
    expect(merged.editorStage).toBe(true);
    expect(merged.editNotes).toBe(NOTES);
    expect(merged.editBars).toBe(16);
    expect(merged.editBpm).toBe(128);
    // Fresh data still wins for everything that is not view/edit state.
    expect(merged.hasMidi).toBe(true);
    expect(merged.prompt).toBe('dark pad');
  });

  it('takes runtime state, progress and instrument from the fresh row, never the stale one', () => {
    const prev = [
      loaded('a', {
        drawerOpen: true,
        isGenerating: true,
        generationProgress: 0.5,
        runtimeState: { id: 'eng-a', muted: true, solo: false, volume: 0.2, pan: 0 },
        instrumentName: 'Old Synth',
      }),
    ];
    const next = [
      loaded('a', {
        runtimeState: { id: 'eng-a', muted: false, solo: true, volume: 0.9, pan: -0.5 },
        instrumentName: 'New Synth',
      }),
    ];
    const [merged] = carryTrackViewState(prev, next);
    expect(merged.drawerOpen).toBe(true);
    expect(merged.isGenerating).toBe(false);
    expect(merged.generationProgress).toBe(0);
    expect(merged.runtimeState).toEqual({ id: 'eng-a', muted: false, solo: true, volume: 0.9, pan: -0.5 });
    expect(merged.instrumentName).toBe('New Synth');
  });

  it('matches by stable dbId even when the engine id changed', () => {
    const prev = [loaded('a', { drawerOpen: true, drawerTab: 'history' })];
    const next = [newTrackState(handle('a', 'eng-a-reloaded'))];
    const [merged] = carryTrackViewState(prev, next);
    expect(merged.handle.id).toBe('eng-a-reloaded');
    expect(merged.drawerOpen).toBe(true);
    expect(merged.drawerTab).toBe('history');
  });

  it('returns new tracks (or a scene switch with empty prev) untouched, in next order, dropping vanished rows', () => {
    const prev = [loaded('gone', { drawerOpen: true }), loaded('b', { drawerOpen: true, drawerTab: 'edit' })];
    const next = [loaded('c'), loaded('b')];
    const merged = carryTrackViewState(prev, next);
    expect(merged.map((t) => t.handle.dbId)).toEqual(['c', 'b']);
    expect(merged[0].drawerOpen).toBe(false);
    expect(merged[1].drawerOpen).toBe(true);
    expect(merged[1].drawerTab).toBe('edit');

    const fromEmpty = carryTrackViewState([], next);
    expect(fromEmpty).toEqual(next);
  });

  it('does not mutate its inputs', () => {
    const prev = [loaded('a', { drawerOpen: true })];
    const next = [loaded('a')];
    const nextSnapshot = { ...next[0] };
    carryTrackViewState(prev, next);
    expect(next[0]).toEqual(nextSnapshot);
    expect(prev[0].drawerOpen).toBe(true);
  });
});
