/**
 * useGeneratorPanelCore — the shared state/effects/handlers engine behind
 * generator panels (synth today; bass next; drum/instrument candidates).
 *
 * Verbatim extraction of the synth panel monolith's family-agnostic ~85%
 * (SynthGeneratorPanel.tsx), parameterized by a GeneratorPanelAdapter. Every
 * timing (500ms prompt debounce, 500ms agent-mutation coalesce, 300ms notes
 * save, 350ms add-focus), every scene-data key (`track:<dbId>:…`), every
 * toast string, and every host-call sequence is frozen by the Phase-0
 * behavior pin (sas-app/src/__tests__/synth-panel-behavior.test.tsx).
 *
 * The returned `core` object is consumed by GeneratorPanelShell (render) and
 * closed over by family adapters (generation strategies, group renderers).
 *
 * @since SDK 2.35.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type {
  PluginUIProps,
  PluginTrackHandle,
  PluginTrackRuntimeState,
  PluginMidiNote,
  BulkAddPlaceholderTrack,
  InstrumentDescriptor,
} from '../types/plugin-sdk.types';
import type { FxCategory } from '../types/fx-toggle.types';
import { useSceneState } from '../hooks/useSceneState';
import { useAnySolo } from '../hooks/useAnySolo';
import { useSoundHistory, type TrackSoundHistory } from '../hooks/useSoundHistory';
import { useTrackReorder, type UseTrackReorderResult } from '../hooks/useTrackReorder';
import { useTrackLevels, type TrackLevelsHandle } from '../hooks/useTrackLevels';
import { parseCrossfadePairs, type CrossfadePairMeta } from '../crossfade-meta';
import { parseFades, splitFadeEntries, type FadeEntry } from '../fade-meta';
import type { DrawerTab } from '../components/TrackDrawer';
import { type GeneratorTrackState, newTrackState } from './track-state';
import { pluginFxToToggleFx, trackDataKey } from './panel-helpers';
import {
  parseTrackGroups,
  resolveTrackGroups,
  type TrackGroupMeta,
  type ResolvedGroupsResult,
  type ResolvedTrackGroup,
} from './group-meta';
import type {
  GeneratorPanelAdapter,
  GenerationServices,
  CoreTrackHandlers,
} from './adapter.types';
import {
  useTransitionOps,
  type TransitionOps,
  type ResolvedCrossfadePair,
  type ResolvedFade,
  type ResolvedGroupFade,
} from './useTransitionOps';

const EMPTY_PLACEHOLDERS: BulkAddPlaceholderTrack[] = [];

export interface UseGeneratorPanelCoreOptions {
  /** The panel's PluginUIProps, passed through whole. */
  ui: PluginUIProps;
  /** Family adapter — MUST be referentially stable (useMemo on [host]). */
  adapter: GeneratorPanelAdapter;
}

/** Everything GeneratorPanelShell + family extensions consume. */
export interface GeneratorPanelCore {
  ui: PluginUIProps;
  adapter: GeneratorPanelAdapter;

  // Track state
  tracks: GeneratorTrackState[];
  setTracks: React.Dispatch<React.SetStateAction<GeneratorTrackState[]>>;
  isLoadingTracks: boolean;
  loadTracks(incremental?: boolean): Promise<void>;
  engineToDbId(trackId: string): string;

  // Meters / solo / reorder / history
  supportsMeters: boolean;
  trackLevels: TrackLevelsHandle;
  anySolo: boolean;
  reorder: UseTrackReorderResult;
  soundHistory: ReturnType<typeof useSoundHistory>;

  // Bulk compose
  isComposing: boolean;
  placeholders: BulkAddPlaceholderTrack[];

  // Header-derived state
  isAddingTrack: boolean;
  isExportingMidi: boolean;
  designerView: boolean;
  canCrossfade: boolean;
  needsContract: boolean;
  xfFromId: string | null;
  xfToId: string | null;

  // Import modals
  importOpen: boolean;
  setImportOpen(open: boolean): void;
  soundImportTarget: GeneratorTrackState | null;
  setSoundImportTarget(t: GeneratorTrackState | null): void;
  handleSoundImportPick(sel: {
    sourceTrackDbId: string;
    trackName: string;
    sceneName: string;
  }): Promise<void>;
  handlePortTrack(sel: {
    sourceTrackDbId: string;
    trackName: string;
    role?: string;
  }): Promise<void>;

  // Transition machinery
  transition: TransitionOps;
  crossfadePairsMeta: CrossfadePairMeta[];
  fadesMeta: FadeEntry[];
  resolvedCrossfadePairs: ResolvedCrossfadePair[];
  crossfadeMemberDbIds: Set<string>;
  resolvedFades: ResolvedFade[];
  fadeMemberDbIds: Set<string>;
  /** Classic single-track fades (resolvedFades minus group members). @since SDK 2.41.0 */
  resolvedSingleFades: ResolvedFade[];
  /** Verbatim group fades, memberIndex-ordered. @since SDK 2.41.0 */
  resolvedGroupFades: ResolvedGroupFade[];

  // Generic group extensions
  resolvedGenericGroups: Record<string, ResolvedGroupsResult<unknown, GeneratorTrackState>>;
  genericGroupMemberDbIds: Set<string>;

  // Instrument picker
  availableInstruments: InstrumentDescriptor[];
  instrumentsLoading: boolean;

  // Per-track handlers (bundled for group render contexts + shell rows)
  handlers: CoreTrackHandlers;
  handleGenerate(trackId: string): Promise<void>;
  handleShuffle(trackId: string): Promise<void>;
  handleAddTrack(): Promise<void>;
  handleDeleteTrack(trackId: string): Promise<void>;
  handleExportMidi(): Promise<void>;
  handlePromptChange(trackId: string, prompt: string): void;
  handleMuteToggle(trackId: string): void;
  handleSoloToggle(trackId: string): void;
  handleVolumeChange(trackId: string, volume: number): void;
  handlePanChange(trackId: string, pan: number): void;
  handleTabChange(trackId: string, tab: DrawerTab): void;
  handleToggleDrawer(trackId: string): void;
  toggleFxDrawer(trackId: string): void;
  handleNotesChange(trackId: string, notes: PluginMidiNote[]): void;
  handleProgressChange(trackId: string, pct: number): void;
  handleCopy(trackId: string): Promise<void>;
  handleFxToggle(trackId: string, category: FxCategory, enabled: boolean): void;
  handleFxPresetChange(trackId: string, category: FxCategory, presetIndex: number): void;
  handleFxDryWetChange(trackId: string, category: FxCategory, value: number): void;
  handleInstrumentSelect(trackId: string, pluginId: string): Promise<void>;
  handleShowEditor(trackId: string): Promise<void>;
  handleBackToInstruments(trackId: string): void;
  handleRefreshInstruments(): void;
  onAuditionNote(trackId: string, pitch: number, velocity: number, ms: number): void;

  // Services factory for strategies / group ops
  makeServices(): GenerationServices;
  setGroupMute(trackIds: string[], muted: boolean): void;
  setGroupSolo(trackIds: string[], solo: boolean): void;
  deleteGroup(
    members: Array<{ engineId: string; dbId: string }>,
    cleanupKeySuffixes: string[],
  ): Promise<void>;
}

export function useGeneratorPanelCore({
  ui,
  adapter,
}: UseGeneratorPanelCoreOptions): GeneratorPanelCore {
  const {
    host,
    activeSceneId,
    isAuthenticated,
    isConnected,
    onHeaderContent,
    onLoading,
    sceneContext,
    onOpenContract,
    onExpandSelf,
    isExpanded,
  } = ui;
  const { identity, features } = adapter;
  const logTag = identity.logTag;

  // Dev guard for the historical render-loop failure mode: an unstable
  // adapter identity re-creates loadTracks every render.
  const adapterRef = useRef(adapter);
  useEffect(() => {
    if (adapterRef.current !== adapter) {
      adapterRef.current = adapter;
      // eslint-disable-next-line no-console
      console.warn(
        `[${logTag}] GeneratorPanelAdapter identity changed between renders — ` +
          'wrap it in useMemo(() => createAdapter(host), [host]) to avoid load loops.',
      );
    }
  }, [adapter, logTag]);

  // Cosmetic per-track peak meters. Poll ONLY while this panel is expanded.
  // Older hosts (no getTrackLevels) degrade to no meter via `supportsMeters`.
  const supportsMeters = typeof host.getTrackLevels === 'function';
  const trackLevels = useTrackLevels(host, isExpanded);

  const [tracks, setTracks] = useState<GeneratorTrackState[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [soundImportTarget, setSoundImportTarget] = useState<GeneratorTrackState | null>(null);
  const [designerView, setDesignerView] = useState(false);
  const [transitionSourceTotal, setTransitionSourceTotal] = useState(0);
  const [crossfadePairsMeta, setCrossfadePairsMeta] = useState<CrossfadePairMeta[]>([]);
  const [fadesMeta, setFadesMeta] = useState<FadeEntry[]>([]);
  const [genericGroupMetas, setGenericGroupMetas] = useState<
    Record<string, TrackGroupMeta<unknown>[]>
  >({});
  // Scene-keyed compose state: preserved when switching scenes via SDK hook.
  const [isComposing, , setIsComposingForScene] = useSceneState(activeSceneId, false);
  const [placeholders, , setPlaceholdersForScene] = useSceneState<BulkAddPlaceholderTrack[]>(
    activeSceneId,
    EMPTY_PLACEHOLDERS,
  );
  const saveTimeoutRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Tracks whose piano-roll notes have already been loaded (or seeded from a
  // fresh generation). Guards the Edit tab against re-fetching on every open
  // and against clobbering unsaved edits.
  const editLoadStartedRef = useRef<Set<string>>(new Set());
  const [availableInstruments, setAvailableInstruments] = useState<InstrumentDescriptor[]>([]);
  const [instrumentsLoading, setInstrumentsLoading] = useState(false);
  /** Maps engine track ID → stable DB UUID for plugin_data key construction */
  const engineToDbIdRef = useRef<Map<string, string>>(new Map());

  // Stale-scene guard: clear on real scene transitions so the gap between
  // scene switch and load completion shows empty, not the prior scene's tracks.
  const tracksLoadedForSceneRef = useRef<string | null>(null);

  // --- Sound history ------------------------------------------------------
  // Persist per-track history to project scene-data so it survives reopen.
  const persistSoundHistory = useCallback(
    (trackId: string, state: TrackSoundHistory): void => {
      if (!activeSceneId) return;
      const dbId = engineToDbIdRef.current.get(trackId) ?? trackId;
      host.setSceneData(activeSceneId, trackDataKey(dbId, 'soundHistory'), state).catch(() => {});
    },
    [host, activeSceneId],
  );
  const soundHistory = useSoundHistory(adapter.sound.applySound, {
    max: adapter.sound.historyMax,
    onChange: persistSoundHistory,
  });
  // Cross-panel: dim non-soloed rows when ANY track (any panel) is soloed.
  const anySolo = useAnySolo(host);

  // Drag-to-reorder rows: optimistic local reorder + persist via
  // host.reorderTracks by the stable dbId so order survives project reopen.
  const reorder = useTrackReorder<GeneratorTrackState>({
    host,
    items: tracks,
    setItems: setTracks,
    getId: (t) => t.handle.dbId,
  });

  // --- Load tracks when scene changes -------------------------------------
  const loadTracks = useCallback(
    async (incremental = false): Promise<void> => {
      // Snapshot the scene this load is for. Each await is a chance for
      // activeSceneId to change or a newer load to take over; when that
      // happens this load must NOT write state.
      const sceneAtStart = activeSceneId;
      if (!sceneAtStart) {
        setTracks([]);
        setCrossfadePairsMeta([]);
        setFadesMeta([]);
        setGenericGroupMetas({});
        tracksLoadedForSceneRef.current = null;
        // No scene → nothing to load → not loading (prevents a stuck spinner
        // when a load is superseded by a brief null effectiveSceneId).
        setIsLoadingTracks(false);
        return;
      }

      // Scene changed since the last load → clear immediately so the user
      // sees the new (empty) state, not the prior scene's tracks.
      if (!incremental && tracksLoadedForSceneRef.current !== sceneAtStart) {
        setTracks([]);
      }
      tracksLoadedForSceneRef.current = sceneAtStart;
      // Reset sound-history on a full (re)load so history resets per scene/reopen.
      if (!incremental) soundHistory.reset();

      const isStale = (): boolean => tracksLoadedForSceneRef.current !== sceneAtStart;

      // Only show "Loading tracks..." when there are no tracks yet.
      if (!incremental) setIsLoadingTracks(true);
      try {
        await host.adoptSceneTracks();
        if (isStale()) return;
        const handles = await host.getPluginTracks();
        if (isStale()) return;
        const sceneData = (await host.getAllSceneData(sceneAtStart)) as Record<string, unknown>;
        if (isStale()) return;

        // Build engine→dbId lookup for callbacks that receive engine IDs
        const idMap = new Map<string, string>();
        for (const h of handles) {
          idMap.set(h.id, h.dbId);
        }
        engineToDbIdRef.current = idMap;

        const trackStates: GeneratorTrackState[] = [];
        for (const handle of handles) {
          // Get runtime state
          let runtimeState: PluginTrackRuntimeState = {
            id: handle.id,
            muted: false,
            solo: false,
            volume: 0.75,
            pan: 0,
          };
          let hasMidi = false;
          try {
            const info = await host.getTrackInfo(handle.id);
            runtimeState = {
              id: handle.id,
              muted: info.muted,
              solo: info.soloed,
              volume: info.volume,
              pan: info.pan,
            };
            hasMidi = info.hasMidi;
          } catch {
            // Use defaults
          }

          // Get FX state
          let fxDetailState = newTrackState(handle).fxDetailState;
          try {
            const fxState = await host.getTrackFxState(handle.id);
            fxDetailState = pluginFxToToggleFx(fxState);
          } catch {
            // Use defaults
          }

          // Use stable DB UUID for plugin_data keys (engine IDs change on reload)
          const promptKey = trackDataKey(handle.dbId, 'prompt');
          let prompt = typeof sceneData[promptKey] === 'string' ? (sceneData[promptKey] as string) : '';

          // Fallback: read prompt from tracks table (bulk-add saves there)
          if (!prompt && handle.prompt) {
            prompt = handle.prompt;
            // Backfill into plugin_data so future loads find it directly.
            host.setSceneData(sceneAtStart, promptKey, prompt).catch(() => {});
          }

          // Detect hasMidi from role presence as a fallback
          if (!hasMidi && handle.role) {
            hasMidi = true;
          }

          // Detect missing instrument plugins (only for custom instruments)
          let instrumentMissing = false;
          if (handle.instrumentPluginId) {
            try {
              const instrDescriptor = await host.getTrackInstrument(handle.id);
              if (instrDescriptor?.missing) {
                instrumentMissing = true;
              }
            } catch {
              // Non-fatal — assume available
            }
          }

          trackStates.push(
            newTrackState(handle, {
              prompt,
              role: handle.role ?? '',
              runtimeState,
              fxDetailState,
              hasMidi,
              instrumentMissing,
            }),
          );
        }
        if (isStale()) return;
        // Carry forward the in-memory piano-roll edit buffer for tracks that
        // still exist, matched by stable DB UUID — a reload fired after a
        // generation must not wipe seeded notes while editLoadStartedRef still
        // marks the track loaded.
        setTracks((prev) => {
          const prevByDbId = new Map(prev.map((p) => [p.handle.dbId, p]));
          return trackStates.map((ts) => {
            const carry = prevByDbId.get(ts.handle.dbId);
            return carry
              ? { ...ts, editNotes: carry.editNotes, editBars: carry.editBars, editBpm: carry.editBpm }
              : ts;
          });
        });
        // Restore persisted history so it survives reopen.
        for (const ts of trackStates) {
          const persisted = sceneData[trackDataKey(ts.handle.dbId, 'soundHistory')];
          if (persisted && typeof persisted === 'object') {
            soundHistory.restore(ts.handle.id, persisted as TrackSoundHistory);
          }
        }
        // Group crossfade members / fades (normal tracks linked via scene-data).
        if (!isStale()) {
          setCrossfadePairsMeta(parseCrossfadePairs(sceneData));
          setFadesMeta(parseFades(sceneData));
          // Generic group extensions (additive; families without extensions skip).
          if (adapter.groupExtensions && adapter.groupExtensions.length > 0) {
            const map: Record<string, TrackGroupMeta<unknown>[]> = {};
            for (const ext of adapter.groupExtensions) {
              map[ext.metaKey] = parseTrackGroups(sceneData, ext);
            }
            setGenericGroupMetas(map);
          }
        }
      } catch (error: unknown) {
        console.error(`[${logTag}] Failed to load tracks:`, error);
      } finally {
        // Only clear the loading indicator if no newer loadTracks took over.
        if (tracksLoadedForSceneRef.current === sceneAtStart) {
          setIsLoadingTracks(false);
        }
      }
    },
    [host, activeSceneId, soundHistory, adapter, logTag],
  );

  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  // Keep engine→dbId ref in sync with current tracks (for newly created
  // tracks that weren't present when loadTracks last ran)
  useEffect(() => {
    const map = new Map<string, string>();
    for (const t of tracks) {
      map.set(t.handle.id, t.handle.dbId);
    }
    engineToDbIdRef.current = map;
  }, [tracks]);

  // --- Reload tracks incrementally as individual bulk tracks complete ----
  const loadedCompletedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (placeholders.length === 0) {
      loadedCompletedIdsRef.current.clear();
      return;
    }
    const newCompleted = placeholders.filter(
      (ph: BulkAddPlaceholderTrack) =>
        ph.status === 'completed' && !loadedCompletedIdsRef.current.has(ph.id),
    );
    if (newCompleted.length > 0) {
      for (const ph of newCompleted) {
        loadedCompletedIdsRef.current.add(ph.id);
      }
      console.log(
        `[${logTag}] ${newCompleted.length} track(s) completed, reloading. IDs:`,
        newCompleted.map((ph: BulkAddPlaceholderTrack) => ph.id),
      );
      loadTracks(true);
    }
  }, [placeholders, loadTracks, logTag]);

  // --- Re-adopt tracks after engine finishes full loading ---------------
  const adoptAndLoad = useCallback((): void => {
    loadTracks(true);
  }, [loadTracks]);

  useEffect(() => {
    const unsub = host.onEngineReady(() => {
      adoptAndLoad();
    });
    return unsub;
  }, [host, adoptAndLoad]);

  // --- Re-adopt tracks after agent/CLI tool mutations --------------------
  // Debounced 500ms so a burst of tool calls coalesces into one reload.
  useEffect(() => {
    if (typeof host.onAfterAgentMutation !== 'function') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = host.onAfterAgentMutation(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        loadTracks(true);
      }, 500);
    });
    return () => {
      unsub?.();
      if (timer) clearTimeout(timer);
    };
  }, [host, loadTracks]);

  // --- Subscribe to real-time track state changes -----------------------
  useEffect(() => {
    const unsub = host.onTrackStateChange((trackId: string, state: PluginTrackRuntimeState) => {
      setTracks((prev) => prev.map((t) => (t.handle.id === trackId ? { ...t, runtimeState: state } : t)));
    });
    return unsub;
  }, [host]);

  // --- Subscribe to compose progress events -----------------------------
  useEffect(() => {
    if (!features.bulkComposePlaceholders) return;
    console.log(`[${logTag}] Subscribing to composeProgress`);
    const unsub = host.onComposeProgress((event) => {
      const targetScene = event.sceneId;
      if (!targetScene) return;
      console.log(
        `[${logTag}] composeProgress event:`,
        event.phase,
        'sceneId:',
        targetScene,
        'placeholders:',
        event.placeholders?.length ?? 'none',
      );
      switch (event.phase) {
        case 'planning':
          setIsComposingForScene(targetScene, true);
          setPlaceholdersForScene(targetScene, []);
          break;
        case 'generating':
          setIsComposingForScene(targetScene, false);
          if (event.placeholders) {
            setPlaceholdersForScene(targetScene, event.placeholders);
          }
          break;
        case 'complete':
        case 'error':
          setIsComposingForScene(targetScene, false);
          setPlaceholdersForScene(targetScene, EMPTY_PLACEHOLDERS);
          break;
      }
    });
    return unsub;
  }, [host, setIsComposingForScene, setPlaceholdersForScene, features.bulkComposePlaceholders, logTag]);

  // --- Cleanup save timeouts on unmount ---------------------------------
  useEffect(() => {
    const refs = saveTimeoutRefs;
    return () => {
      for (const timeout of Object.values(refs.current)) {
        clearTimeout(timeout);
      }
    };
  }, []);

  // --- Add track --------------------------------------------------------
  // Re-entry guard: the ref is synchronous so rapid double-clicks can't both
  // pass the gate; the state mirrors it for the button's visual disable.
  const isAddingTrackRef = useRef(false);
  const [isAddingTrack, setIsAddingTrack] = useState(false);
  const handleAddTrack = useCallback(async (): Promise<void> => {
    if (isAddingTrackRef.current) return;
    if (!activeSceneId) {
      host.showToast('warning', 'Select SCENE');
      return;
    }
    if (!isConnected) {
      host.showToast('warning', 'Systems not connected');
      return;
    }
    if (!isAuthenticated) {
      host.showToast('warning', 'Sign In Required', 'Please sign in to add tracks');
      return;
    }
    if (tracks.length >= identity.maxTracks) return;

    isAddingTrackRef.current = true;
    setIsAddingTrack(true);
    try {
      const handle = await host.createTrack({
        name: `${identity.trackNamePrefix}-${Date.now()}`,
        ...adapter.createTrackOptions(),
      });
      setTracks((prev) => [...prev, newTrackState(handle)]);
      onExpandSelf?.();
      // Auto-focus the prompt input of the newly created track after the
      // accordion animation.
      setTimeout(() => {
        const inputs = document.querySelectorAll<HTMLInputElement>(
          `[data-testid="${identity.familyKey}-section"] [data-testid="sdk-prompt-input"]`,
        );
        if (inputs.length > 0) {
          inputs[inputs.length - 1].focus();
        }
      }, 350);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      host.showToast('error', 'Failed to create track', msg);
    } finally {
      isAddingTrackRef.current = false;
      setIsAddingTrack(false);
    }
  }, [host, adapter, identity, activeSceneId, isConnected, isAuthenticated, tracks.length, onExpandSelf]);

  // --- Port track (cross-panel import) -----------------------------------
  // Pull a MIDI part out of a track owned by ANOTHER panel in THIS scene and
  // play it on a fresh family instrument. The sound never carries across
  // families; we copy only MIDI + role, then the adapter applies a native sound.
  const handlePortTrack = useCallback(
    async (sel: { sourceTrackDbId: string; trackName: string; role?: string }): Promise<void> => {
      if (!activeSceneId) {
        host.showToast('warning', 'Select SCENE');
        return;
      }
      if (!isConnected) {
        host.showToast('warning', 'Systems not connected');
        return;
      }
      if (tracks.length >= identity.maxTracks) {
        host.showToast('warning', 'Track limit reached');
        return;
      }
      if (!host.readImportableTrackMidi) return;
      let handle: PluginTrackHandle | null = null;
      try {
        handle = await host.createTrack({
          name: `${identity.trackNamePrefix}-${Date.now()}`,
          ...adapter.createTrackOptions(),
        });
        if (sel.role) {
          try {
            await host.setTrackRole(handle.id, sel.role);
          } catch {
            /* non-fatal: MIDI still ports */
          }
        }
        const midi = await host.readImportableTrackMidi(sel.sourceTrackDbId);
        const notes = midi.clips[0]?.notes ?? [];
        if (notes.length > 0) {
          const mc = await host.getMusicalContext();
          await host.writeMidiClip(handle.id, {
            startTime: 0,
            endTime: (mc.bars * 4 * 60) / mc.bpm,
            tempo: mc.bpm,
            notes,
          });
        }
        // Native, role-appropriate family sound (adapter owns non-fatality).
        await adapter.applyPortedTrackSound(handle, sel.role);
        host.showToast(
          'success',
          `Imported to ${identity.familyKey}`,
          notes.length ? `${sel.trackName} → ${identity.familyKey}` : `${sel.trackName} (no MIDI yet)`,
        );
        await loadTracks(true);
      } catch (err: unknown) {
        // Roll back the half-made track we created (we own it).
        if (handle) {
          try {
            await host.deleteTrack(handle.id);
          } catch {
            /* best effort */
          }
        }
        host.showToast('error', 'Import failed', err instanceof Error ? err.message : String(err));
      }
    },
    [host, adapter, identity, activeSceneId, isConnected, tracks.length, loadTracks],
  );

  // --- Sound import (drawer "Import <noun>") ------------------------------
  const handleSoundImportPick = useCallback(
    async (sel: { sourceTrackDbId: string; trackName: string; sceneName: string }): Promise<void> => {
      const target = soundImportTarget;
      if (!target || !host.getTrackSound) {
        setSoundImportTarget(null);
        return;
      }
      const noun = adapter.sound.importNoun;
      const nounTitle = noun.charAt(0).toUpperCase() + noun.slice(1);
      try {
        const snap = await host.getTrackSound(sel.sourceTrackDbId);
        if (!snap || snap.kind !== adapter.sound.acceptedSnapshotKind) {
          host.showToast(
            'error',
            `No ${noun} to import`,
            `${sel.trackName} has no ${identity.familyKey} ${noun}.`,
          );
          return;
        }
        const descriptor = adapter.sound.descriptorFromSnapshot(snap);
        await adapter.sound.applySound(target.handle.id, descriptor);
        soundHistory.record(target.handle.id, descriptor, snap.label);
        host.showToast('success', `${nounTitle} imported`, `${snap.label} → ${target.handle.name}`);
      } catch (err: unknown) {
        host.showToast('error', 'Import failed', err instanceof Error ? err.message : String(err));
      } finally {
        setSoundImportTarget(null);
      }
    },
    [soundImportTarget, host, adapter, identity.familyKey, soundHistory],
  );

  // --- Export tracks as MIDI bundle -------------------------------------
  const [isExportingMidi, setIsExportingMidi] = useState(false);
  const handleExportMidi = useCallback(async (): Promise<void> => {
    if (isExportingMidi) return;
    setIsExportingMidi(true);
    try {
      const result = await host.exportTracksAsMidiBundle({
        defaultName: identity.exportDefaultName ?? 'midi-tracks',
      });
      if (result.success) {
        const filename = result.filePath.split('/').pop() || result.filePath;
        const skippedNote =
          result.skippedCount > 0
            ? ` (${result.skippedCount} empty track${result.skippedCount === 1 ? '' : 's'} skipped)`
            : '';
        host.showToast(
          'success',
          'MIDI exported',
          `${result.trackCount} track${result.trackCount === 1 ? '' : 's'} → ${filename}${skippedNote}`,
        );
      } else if (!('canceled' in result && result.canceled)) {
        const errMsg = 'error' in result ? result.error : 'Unknown error';
        host.showToast('error', 'Export failed', errMsg);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      host.showToast('error', 'Export failed', msg);
    } finally {
      setIsExportingMidi(false);
    }
  }, [host, identity.exportDefaultName, isExportingMidi]);

  // --- Header content (Add / Import / designer toggle) --------------------
  const isBulkActive = !!(isComposing || placeholders.length > 0);
  const needsContract = !sceneContext?.hasContract;
  const xfFromId = sceneContext?.transitionFromSceneId ?? null;
  const xfToId = sceneContext?.transitionToSceneId ?? null;
  const canCrossfade =
    features.transitionDesigner &&
    sceneContext?.sceneType === 'transition' &&
    !!xfFromId &&
    !!xfToId &&
    !!host.listSceneFamilyTracks;
  // Leaving a transition scene drops back to the Tracks view.
  useEffect(() => {
    if (!canCrossfade) setDesignerView(false);
  }, [canCrossfade]);
  // Fetch the source-track total once per transition scene (stable denominator).
  useEffect(() => {
    if (!canCrossfade || !xfFromId || !xfToId || !host.listSceneFamilyTracks) {
      setTransitionSourceTotal(0);
      return;
    }
    let cancelled = false;
    void Promise.all([host.listSceneFamilyTracks(xfFromId), host.listSceneFamilyTracks(xfToId)])
      .then(([a, b]) => {
        if (!cancelled) setTransitionSourceTotal(a.length + b.length);
      })
      .catch(() => {
        if (!cancelled) setTransitionSourceTotal(0);
      });
    return () => {
      cancelled = true;
    };
  }, [canCrossfade, xfFromId, xfToId, host]);
  // Tracks already turned into transitions: 2 sources per pair, 1 per fade.
  const transitionDone = crossfadePairsMeta.length * 2 + fadesMeta.length;
  useEffect(() => {
    if (!onHeaderContent) return;
    const addDisabled =
      needsContract || !isConnected || !activeSceneId || tracks.length >= identity.maxTracks || isAddingTrack;

    onHeaderContent(
      <div className="flex gap-1 items-center">
        {features.importTracks && (!canCrossfade || !designerView) && host.listImportableTracks && (
          <button
            data-testid={`import-from-scene-${identity.familyKey}-button`}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onExpandSelf?.();
              setImportOpen(true);
            }}
            disabled={!activeSceneId || needsContract}
            className={`px-2 py-0.5 text-[10px] font-medium rounded-sm border transition-colors ${
              !activeSceneId || needsContract
                ? 'bg-sas-panel border-sas-border text-sas-muted/50 cursor-not-allowed'
                : 'bg-sas-panel-alt border-sas-border text-sas-muted hover:border-sas-accent hover:text-sas-accent'
            }`}
          >
            {identity.importTrackLabel ?? 'Import Track'}
          </button>
        )}
        {(!canCrossfade || !designerView) && (
          <button
            data-testid={`add-${identity.familyKey}-track-button`}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              if (needsContract) {
                onOpenContract?.();
                return;
              }
              handleAddTrack();
            }}
            className={`px-2 py-0.5 text-[10px] font-medium rounded-sm border transition-colors ${
              addDisabled
                ? 'bg-sas-panel border-sas-border text-sas-muted/50 cursor-not-allowed'
                : 'bg-sas-accent/10 border-sas-accent/30 text-sas-accent hover:bg-sas-accent/20'
            }`}
          >
            {identity.addTrackLabel ?? 'Add Track'}
          </button>
        )}
        {canCrossfade && (
          <button
            data-testid={`${identity.familyKey}-view-toggle`}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              if (!designerView) {
                if (needsContract) {
                  onOpenContract?.();
                  return;
                }
                onExpandSelf?.();
              }
              setDesignerView((v) => !v);
            }}
            disabled={!designerView && needsContract}
            title={designerView ? 'Back to the track list' : 'Open the transition designer'}
            className="relative overflow-hidden px-2 py-0.5 text-[10px] font-medium rounded-sm border border-sas-accent/40 text-sas-accent transition-colors hover:border-sas-accent disabled:opacity-50"
          >
            {transitionSourceTotal > 0 && (
              <span
                className="absolute inset-y-0 left-0 bg-sas-accent/25"
                style={{ width: `${Math.min(100, (transitionDone / transitionSourceTotal) * 100)}%` }}
                aria-hidden
              />
            )}
            <span className="relative">
              ⇄ {designerView ? 'Transition' : 'Tracks'}
              {transitionSourceTotal > 0 ? ` ${transitionDone}/${transitionSourceTotal}` : ''}
            </span>
          </button>
        )}
      </div>,
    );
    return () => {
      onHeaderContent(null);
    };
  }, [
    onHeaderContent,
    needsContract,
    isConnected,
    activeSceneId,
    tracks.length,
    isAddingTrack,
    handleAddTrack,
    onOpenContract,
    host,
    canCrossfade,
    designerView,
    transitionDone,
    transitionSourceTotal,
    onExpandSelf,
    identity,
    features.importTracks,
  ]);

  // --- Push loading state to accordion header ---------------------------
  useEffect(() => {
    if (!onLoading) return;
    const anyGenerating = tracks.some((t: GeneratorTrackState) => t.isGenerating);
    onLoading(isLoadingTracks || anyGenerating || isBulkActive);
    return () => {
      onLoading(false);
    };
  }, [onLoading, isLoadingTracks, tracks, isBulkActive]);

  // --- Delete track -----------------------------------------------------
  const handleDeleteTrack = useCallback(
    async (trackId: string): Promise<void> => {
      try {
        await host.deleteTrack(trackId);
        // Clean up prompt from scene data (stable DB UUID key)
        const dbId = engineToDbIdRef.current.get(trackId) ?? trackId;
        if (activeSceneId) {
          await host.deleteSceneData(activeSceneId, trackDataKey(dbId, 'prompt'));
        }
        setTracks((prev) => prev.filter((t) => t.handle.id !== trackId));
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        host.showToast('error', 'Failed to delete track', msg);
      }
    },
    [host, activeSceneId],
  );

  // --- Update prompt (debounced save) -----------------------------------
  const handlePromptChange = useCallback(
    (trackId: string, prompt: string): void => {
      setTracks((prev) => prev.map((t) => (t.handle.id === trackId ? { ...t, prompt } : t)));

      // Debounced save to scene data (stable DB UUID key)
      const dbId = engineToDbIdRef.current.get(trackId) ?? trackId;
      if (saveTimeoutRefs.current[trackId]) {
        clearTimeout(saveTimeoutRefs.current[trackId]);
      }
      saveTimeoutRefs.current[trackId] = setTimeout(() => {
        if (activeSceneId) {
          host.setSceneData(activeSceneId, trackDataKey(dbId, 'prompt'), prompt).catch(() => {});
        }
      }, 500);
    },
    [host, activeSceneId],
  );

  // --- Generic group resolution ------------------------------------------
  const resolvedGenericGroups = useMemo(() => {
    const out: Record<string, ResolvedGroupsResult<unknown, GeneratorTrackState>> = {};
    for (const ext of adapter.groupExtensions ?? []) {
      out[ext.metaKey] = resolveTrackGroups(
        genericGroupMetas[ext.metaKey] ?? [],
        tracks,
        (t) => t.handle.dbId,
        {
          isComplete: ext.isComplete as
            | ((g: ResolvedTrackGroup<unknown, GeneratorTrackState>, p: TrackGroupMeta<unknown>) => boolean)
            | undefined,
        },
      );
    }
    return out;
  }, [adapter, genericGroupMetas, tracks]);
  const genericGroupMemberDbIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of Object.values(resolvedGenericGroups)) {
      for (const dbId of r.memberDbIds) s.add(dbId);
    }
    return s;
  }, [resolvedGenericGroups]);

  // --- Services factory ---------------------------------------------------
  const engineToDbId = useCallback(
    (trackId: string): string => engineToDbIdRef.current.get(trackId) ?? trackId,
    [],
  );
  const updateTrack = useCallback(
    (
      trackId: string,
      patch: Partial<GeneratorTrackState> | ((t: GeneratorTrackState) => GeneratorTrackState),
    ): void => {
      setTracks((prev) =>
        prev.map((t) =>
          t.handle.id === trackId ? (typeof patch === 'function' ? patch(t) : { ...t, ...patch }) : t,
        ),
      );
    },
    [],
  );
  const markEditLoaded = useCallback((trackId: string): void => {
    editLoadStartedRef.current.add(trackId);
  }, []);
  const tracksRef = useRef(tracks);
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);
  const resolvedGenericGroupsRef = useRef(resolvedGenericGroups);
  useEffect(() => {
    resolvedGenericGroupsRef.current = resolvedGenericGroups;
  }, [resolvedGenericGroups]);
  const makeServices = useCallback((): GenerationServices => {
    return {
      host,
      activeSceneId,
      tracks: tracksRef.current,
      updateTrack,
      setTracks,
      reloadTracks: loadTracks,
      soundHistory,
      engineToDbId,
      trackDataKey,
      markEditLoaded,
      createFamilyTrack: (nameSuffix = '') =>
        host.createTrack({
          name: `${identity.trackNamePrefix}-${Date.now()}${nameSuffix}`,
          ...adapter.createTrackOptions(),
        }),
      resolvedGroups: <M,>(metaKey: string) =>
        (resolvedGenericGroupsRef.current[metaKey]?.resolved ?? []) as ResolvedTrackGroup<
          M,
          GeneratorTrackState
        >[],
    };
  }, [host, activeSceneId, updateTrack, loadTracks, soundHistory, engineToDbId, markEditLoaded, identity, adapter]);

  // --- Generate (core wrapper; adapter strategy owns the body) ------------
  const handleGenerate = useCallback(
    async (trackId: string): Promise<void> => {
      const track = tracks.find((t) => t.handle.id === trackId);
      if (!track || !track.prompt.trim()) return;
      if (!isAuthenticated) {
        host.showToast('warning', 'Sign In Required', 'Please sign in to generate MIDI');
        return;
      }

      setTracks((prev) =>
        prev.map((t) =>
          t.handle.id === trackId ? { ...t, isGenerating: true, error: null, generationProgress: 0 } : t,
        ),
      );

      try {
        await adapter.generation.generate(track, makeServices());
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Generation failed';
        setTracks((prev) =>
          prev.map((t) =>
            t.handle.id === trackId ? { ...t, isGenerating: false, error: msg, generationProgress: 0 } : t,
          ),
        );
        host.showToast('error', 'Generation failed', msg);
      }
    },
    [host, adapter, tracks, isAuthenticated, makeServices],
  );

  // --- Mute/Solo/Volume/Pan -----------------------------------------------
  const handleMuteToggle = useCallback(
    (trackId: string): void => {
      const track = tracks.find((t) => t.handle.id === trackId);
      if (!track) return;
      const newMuted = !track.runtimeState.muted;
      // Optimistic update
      setTracks((prev) =>
        prev.map((t) =>
          t.handle.id === trackId ? { ...t, runtimeState: { ...t.runtimeState, muted: newMuted } } : t,
        ),
      );
      host.setTrackMute(trackId, newMuted).catch(() => {
        setTracks((prev) =>
          prev.map((t) =>
            t.handle.id === trackId ? { ...t, runtimeState: { ...t.runtimeState, muted: !newMuted } } : t,
          ),
        );
      });
    },
    [host, tracks],
  );

  const handleSoloToggle = useCallback(
    (trackId: string): void => {
      const track = tracks.find((t) => t.handle.id === trackId);
      if (!track) return;
      const newSolo = !track.runtimeState.solo;
      setTracks((prev) =>
        prev.map((t) =>
          t.handle.id === trackId ? { ...t, runtimeState: { ...t.runtimeState, solo: newSolo } } : t,
        ),
      );
      host.setTrackSolo(trackId, newSolo).catch(() => {
        setTracks((prev) =>
          prev.map((t) =>
            t.handle.id === trackId ? { ...t, runtimeState: { ...t.runtimeState, solo: !newSolo } } : t,
          ),
        );
      });
    },
    [host, tracks],
  );

  const handleVolumeChange = useCallback(
    (trackId: string, volume: number): void => {
      setTracks((prev) =>
        prev.map((t) => (t.handle.id === trackId ? { ...t, runtimeState: { ...t.runtimeState, volume } } : t)),
      );
      host.setTrackVolume(trackId, volume).catch(() => {});
    },
    [host],
  );

  const handlePanChange = useCallback(
    (trackId: string, pan: number): void => {
      setTracks((prev) =>
        prev.map((t) => (t.handle.id === trackId ? { ...t, runtimeState: { ...t.runtimeState, pan } } : t)),
      );
      host.setTrackPan(trackId, pan).catch(() => {});
    },
    [host],
  );

  // --- Shuffle sound (keep MIDI, new sound) -------------------------------
  // Cycle pattern: exclude everything already tried; on exhaustion (adapter
  // classifies the error) wipe the deck and retry once with no exclusions.
  const handleShuffle = useCallback(
    async (trackId: string): Promise<void> => {
      const track = tracks.find((t) => t.handle.id === trackId);
      if (!track) return;
      // Lazy-seed: capture the pre-shuffle sound on the first shuffle so undo
      // can return to it.
      if (soundHistory.list(trackId).entries.length === 0) {
        try {
          const cap = await adapter.sound.captureSoundDescriptor(trackId);
          if (cap) soundHistory.record(trackId, cap.descriptor, adapter.sound.previousSoundLabel);
        } catch {
          // Non-fatal — history just won't include this sound.
        }
      }
      try {
        let result: { appliedName: string };
        let nextHistory: Set<string>;
        try {
          result = await adapter.shuffle.shuffle(track, Array.from(track.shuffleHistory));
          nextHistory = new Set(track.shuffleHistory);
        } catch (firstErr: unknown) {
          // Distinguish "exhausted" (expected, retry with fresh deck) from
          // other failures (surface to user).
          if (adapter.shuffle.isExhaustedError(firstErr)) {
            nextHistory = new Set<string>();
            result = await adapter.shuffle.shuffle(track, []);
          } else {
            throw firstErr;
          }
        }
        nextHistory.add(result.appliedName);
        setTracks((prev) =>
          prev.map((t) => (t.handle.id === trackId ? { ...t, shuffleHistory: nextHistory } : t)),
        );
        // Record the new sound so the History tab can return to it.
        try {
          const cap = await adapter.sound.captureSoundDescriptor(trackId);
          if (cap) soundHistory.record(trackId, cap.descriptor, result.appliedName);
        } catch {
          // Non-fatal.
        }
        console.log(`[${logTag}] Sound shuffled: ${result.appliedName} (history ${nextHistory.size})`);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Shuffle failed';
        host.showToast('error', 'Shuffle failed', msg);
      }
    },
    [host, adapter, tracks, soundHistory, logTag],
  );

  // --- Duplicate track (copy MIDI, new sound) -----------------------------
  const handleCopy = useCallback(
    async (trackId: string): Promise<void> => {
      try {
        const newHandle = await host.duplicateTrack(trackId);
        // Reload tracks to pick up the new one with full state
        await loadTracks();
        host.showToast('success', 'Track duplicated', newHandle.name);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Copy failed';
        host.showToast('error', 'Copy failed', msg);
      }
    },
    [host, loadTracks],
  );

  // --- FX Operations (optimistic UI) --------------------------------------
  const handleFxToggle = useCallback(
    (trackId: string, category: FxCategory, enabled: boolean): void => {
      setTracks((prev) =>
        prev.map((t) =>
          t.handle.id === trackId
            ? { ...t, fxDetailState: { ...t.fxDetailState, [category]: { ...t.fxDetailState[category], enabled } } }
            : t,
        ),
      );
      host.toggleTrackFx(trackId, category, enabled).catch(() => {
        setTracks((prev) =>
          prev.map((t) =>
            t.handle.id === trackId
              ? {
                  ...t,
                  fxDetailState: {
                    ...t.fxDetailState,
                    [category]: { ...t.fxDetailState[category], enabled: !enabled },
                  },
                }
              : t,
          ),
        );
      });
    },
    [host],
  );

  const handleFxPresetChange = useCallback(
    (trackId: string, category: FxCategory, presetIndex: number): void => {
      setTracks((prev) =>
        prev.map((t) =>
          t.handle.id === trackId
            ? { ...t, fxDetailState: { ...t.fxDetailState, [category]: { ...t.fxDetailState[category], presetIndex } } }
            : t,
        ),
      );
      host
        .setTrackFxPreset(trackId, category, presetIndex)
        .then((result) => {
          if (result.dryWet !== undefined) {
            setTracks((prev) =>
              prev.map((t) =>
                t.handle.id === trackId
                  ? {
                      ...t,
                      fxDetailState: {
                        ...t.fxDetailState,
                        [category]: { ...t.fxDetailState[category], dryWet: result.dryWet as number },
                      },
                    }
                  : t,
              ),
            );
          }
        })
        .catch(() => {});
    },
    [host],
  );

  const handleFxDryWetChange = useCallback(
    (trackId: string, category: FxCategory, value: number): void => {
      setTracks((prev) =>
        prev.map((t) =>
          t.handle.id === trackId
            ? { ...t, fxDetailState: { ...t.fxDetailState, [category]: { ...t.fxDetailState[category], dryWet: value } } }
            : t,
        ),
      );
      host.setTrackFxDryWet(trackId, category, value).catch(() => {});
    },
    [host],
  );

  const toggleFxDrawer = useCallback(
    (trackId: string): void => {
      setTracks((prev) =>
        prev.map((t) => {
          if (t.handle.id !== trackId) return t;
          const onFx = t.drawerOpen && t.drawerTab === 'fx';
          return { ...t, drawerOpen: !onFx, drawerTab: 'fx', editorStage: false };
        }),
      );
      // Refresh FX state from the engine whenever we OPEN the FX tab.
      const track = tracks.find((t) => t.handle.id === trackId);
      const wasOnFx = !!track && track.drawerOpen && track.drawerTab === 'fx';
      if (track && !wasOnFx) {
        host
          .getTrackFxState(trackId)
          .then((fxState) => {
            setTracks((prev) =>
              prev.map((t) => (t.handle.id === trackId ? { ...t, fxDetailState: pluginFxToToggleFx(fxState) } : t)),
            );
          })
          .catch(() => {});
      }
    },
    [host, tracks],
  );

  // --- Piano-roll edit: load + save ---------------------------------------
  const loadEditNotes = useCallback(
    async (trackId: string): Promise<void> => {
      try {
        const mc = await host.getMusicalContext();
        let notes: PluginMidiNote[] = [];
        if (typeof host.readMidiNotes === 'function') {
          const result = await host.readMidiNotes(trackId);
          notes = result.clips[0]?.notes ?? [];
        }
        setTracks((prev) =>
          prev.map((t) => (t.handle.id === trackId ? { ...t, editNotes: notes, editBars: mc.bars, editBpm: mc.bpm } : t)),
        );
      } catch (err: unknown) {
        console.warn(`[${logTag}] Failed to load MIDI for editing:`, err);
      }
    },
    [host, logTag],
  );

  // SAVE: optimistic local update, then debounced (300 ms) persist. Empty
  // note arrays go through clearMidi. Stable ([host]) to avoid re-subscribing
  // the editor / triggering load loops.
  const handleNotesChange = useCallback(
    (trackId: string, notes: PluginMidiNote[]): void => {
      setTracks((prev) => prev.map((t) => (t.handle.id === trackId ? { ...t, editNotes: notes } : t)));
      const key = `edit:${trackId}`;
      if (saveTimeoutRefs.current[key]) {
        clearTimeout(saveTimeoutRefs.current[key]);
      }
      saveTimeoutRefs.current[key] = setTimeout(() => {
        void (async (): Promise<void> => {
          try {
            if (notes.length === 0) {
              await host.clearMidi(trackId);
            } else {
              const mc = await host.getMusicalContext();
              await host.writeMidiClip(trackId, {
                startTime: 0,
                endTime: (mc.bars * 4 * 60) / mc.bpm,
                tempo: mc.bpm,
                notes,
              });
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            host.showToast('error', 'Failed to save edit', msg);
          }
        })();
      }, 300);
    },
    [host],
  );

  // Tab-strip clicks: switch the active tab, keeping the drawer open.
  const handleTabChange = useCallback(
    (trackId: string, tab: DrawerTab): void => {
      setTracks((prev) => prev.map((t) => (t.handle.id === trackId ? { ...t, drawerOpen: true, drawerTab: tab } : t)));
      if (tab === 'fx') {
        host
          .getTrackFxState(trackId)
          .then((fxState) => {
            setTracks((prev) =>
              prev.map((t) => (t.handle.id === trackId ? { ...t, fxDetailState: pluginFxToToggleFx(fxState) } : t)),
            );
          })
          .catch(() => {});
      } else if (tab === 'pick' && availableInstruments.length === 0 && !instrumentsLoading) {
        // Lazy-load available instruments the first time the Pick tab opens.
        setInstrumentsLoading(true);
        host
          .getAvailableInstruments()
          .then((instruments: InstrumentDescriptor[]) => {
            setAvailableInstruments(instruments);
          })
          .catch(() => {})
          .finally(() => {
            setInstrumentsLoading(false);
          });
      } else if (tab === 'edit' && !editLoadStartedRef.current.has(trackId)) {
        // Lazy-load the track's MIDI the first time the Edit tab opens.
        editLoadStartedRef.current.add(trackId);
        void loadEditNotes(trackId);
      }
    },
    [host, availableInstruments.length, instrumentsLoading, loadEditNotes],
  );

  // --- Progress persistence callback --------------------------------------
  const handleProgressChange = useCallback((trackId: string, pct: number): void => {
    setTracks((prev) => prev.map((t) => (t.handle.id === trackId ? { ...t, generationProgress: pct } : t)));
  }, []);

  // --- Instrument selection callbacks --------------------------------------
  const handleToggleDrawer = useCallback((trackId: string): void => {
    setTracks((prev) =>
      prev.map((t: GeneratorTrackState) => {
        if (t.handle.id !== trackId) return t;
        const onSound = t.drawerOpen && t.drawerTab !== 'fx';
        return { ...t, drawerOpen: !onSound, drawerTab: 'history', editorStage: false };
      }),
    );
  }, []);

  const handleInstrumentSelect = useCallback(
    async (trackId: string, pluginId: string): Promise<void> => {
      const isDefaultInstrument = pluginId === (identity.defaultInstrumentPluginId ?? 'Surge XT');

      if (isDefaultInstrument) {
        // Revert to default — close drawer
        setTracks((prev) =>
          prev.map((t: GeneratorTrackState) => (t.handle.id === trackId ? { ...t, drawerOpen: false, editorStage: false } : t)),
        );
        try {
          await host.setTrackInstrument(trackId, pluginId);
          const descriptor = await host.getTrackInstrument(trackId);
          setTracks((prev) =>
            prev.map((t: GeneratorTrackState) =>
              t.handle.id === trackId
                ? {
                    ...t,
                    instrumentPluginId: descriptor?.pluginId ?? null,
                    instrumentName: descriptor?.name ?? null,
                    instrumentMissing: descriptor?.missing ?? false,
                  }
                : t,
            ),
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to load instrument';
          host.showToast('error', 'Instrument load failed', msg);
        }
        return;
      }

      // Custom instrument — load it, then transition to the editor stage
      setTracks((prev) =>
        prev.map((t: GeneratorTrackState) => (t.handle.id === trackId ? { ...t, drawerTab: 'pick', editorStage: true } : t)),
      );

      try {
        await host.setTrackInstrument(trackId, pluginId);
        const descriptor = await host.getTrackInstrument(trackId);
        setTracks((prev) =>
          prev.map((t: GeneratorTrackState) =>
            t.handle.id === trackId
              ? {
                  ...t,
                  instrumentPluginId: descriptor?.pluginId ?? null,
                  instrumentName: descriptor?.name ?? null,
                  instrumentMissing: descriptor?.missing ?? false,
                }
              : t,
          ),
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load instrument';
        console.error(`[${logTag}] Failed to set instrument:`, err);
        host.showToast('error', 'Instrument load failed', msg);
        // Revert to the instrument grid on failure
        setTracks((prev) =>
          prev.map((t: GeneratorTrackState) => (t.handle.id === trackId ? { ...t, editorStage: false } : t)),
        );
      }
    },
    [host, identity.defaultInstrumentPluginId, logTag],
  );

  const handleShowEditor = useCallback(
    async (trackId: string): Promise<void> => {
      try {
        await host.showInstrumentEditor(trackId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to open editor';
        host.showToast('error', 'Editor failed', msg);
      }
    },
    [host],
  );

  const handleBackToInstruments = useCallback((trackId: string): void => {
    setTracks((prev) =>
      prev.map((t: GeneratorTrackState) => (t.handle.id === trackId ? { ...t, editorStage: false } : t)),
    );
  }, []);

  const handleRefreshInstruments = useCallback((): void => {
    setInstrumentsLoading(true);
    host
      .getAvailableInstruments()
      .then((instruments: InstrumentDescriptor[]) => {
        setAvailableInstruments(instruments);
      })
      .catch(() => {})
      .finally(() => {
        setInstrumentsLoading(false);
      });
  }, [host]);

  const onAuditionNote = useCallback(
    (trackId: string, pitch: number, velocity: number, ms: number): void => {
      void host.auditionNote(trackId, pitch, velocity, ms);
    },
    [host],
  );

  // --- Resolve crossfade pairs / fades against live track state -----------
  const { resolvedCrossfadePairs, crossfadeMemberDbIds } = useMemo(() => {
    const byDbId = new Map(tracks.map((t) => [t.handle.dbId, t]));
    const pairs: ResolvedCrossfadePair[] = [];
    const members = new Set<string>();
    for (const p of crossfadePairsMeta) {
      const origin = byDbId.get(p.originDbId);
      const target = byDbId.get(p.targetDbId);
      if (origin && target) {
        pairs.push({ ...p, origin, target });
        members.add(p.originDbId);
        members.add(p.targetDbId);
      }
    }
    return { resolvedCrossfadePairs: pairs, crossfadeMemberDbIds: members };
  }, [tracks, crossfadePairsMeta]);

  const { resolvedFades, fadeMemberDbIds } = useMemo(() => {
    const byDbId = new Map(tracks.map((t) => [t.handle.dbId, t]));
    const list: ResolvedFade[] = [];
    const members = new Set<string>();
    for (const f of fadesMeta) {
      const track = byDbId.get(f.dbId);
      if (track) {
        list.push({ ...f, track });
        members.add(f.dbId);
      }
    }
    return { resolvedFades: list, fadeMemberDbIds: members };
  }, [tracks, fadesMeta]);

  // Split for rendering only: classic single fades vs verbatim GROUP fades.
  // Drift-resync + curve re-apply keep iterating the FLAT resolvedFades list.
  const { singles: resolvedSingleFades, groups: resolvedGroupFades } = useMemo(
    () => splitFadeEntries(resolvedFades),
    [resolvedFades],
  );

  // --- Transition ops (create/controls/effects) ---------------------------
  const transition = useTransitionOps({
    host,
    adapter,
    activeSceneId,
    isConnected,
    isAuthenticated,
    sceneContext,
    tracks,
    setTracks,
    loadTracks,
    setCrossfadePairsMeta,
    setFadesMeta,
    resolvedCrossfadePairs,
    resolvedFades,
  });

  // --- Group ops (generic extensions) --------------------------------------
  const setGroupMute = useCallback(
    (trackIds: string[], muted: boolean): void => {
      for (const id of trackIds) {
        setTracks((prev) =>
          prev.map((t) => (t.handle.id === id ? { ...t, runtimeState: { ...t.runtimeState, muted } } : t)),
        );
        host.setTrackMute(id, muted).catch(() => {});
      }
    },
    [host],
  );
  const setGroupSolo = useCallback(
    (trackIds: string[], solo: boolean): void => {
      for (const id of trackIds) {
        setTracks((prev) =>
          prev.map((t) => (t.handle.id === id ? { ...t, runtimeState: { ...t.runtimeState, solo } } : t)),
        );
        host.setTrackSolo(id, solo).catch(() => {});
      }
    },
    [host],
  );
  const deleteGroup = useCallback(
    async (
      members: Array<{ engineId: string; dbId: string }>,
      cleanupKeySuffixes: string[],
    ): Promise<void> => {
      for (const member of members) {
        try {
          await host.deleteTrack(member.engineId);
        } catch {
          /* best effort */
        }
        if (activeSceneId) {
          for (const suffix of cleanupKeySuffixes) {
            await host.deleteSceneData(activeSceneId, trackDataKey(member.dbId, suffix)).catch(() => {});
          }
        }
      }
      const gone = new Set(members.map((m) => m.engineId));
      setTracks((prev) => prev.filter((t) => !gone.has(t.handle.id)));
      await loadTracks(true);
    },
    [host, activeSceneId, loadTracks],
  );

  // --- Bundled per-track handlers (group render contexts + shell rows) -----
  const handlers = useMemo<CoreTrackHandlers>(
    () => ({
      promptChange: handlePromptChange,
      generate: (trackId: string) => {
        void handleGenerate(trackId);
      },
      shuffle: (trackId: string) => {
        void handleShuffle(trackId);
      },
      copy: (trackId: string) => {
        void handleCopy(trackId);
      },
      delete: (trackId: string) => {
        void handleDeleteTrack(trackId);
      },
      muteToggle: handleMuteToggle,
      soloToggle: handleSoloToggle,
      volumeChange: handleVolumeChange,
      panChange: handlePanChange,
      tabChange: handleTabChange,
      toggleDrawer: handleToggleDrawer,
      toggleFxDrawer,
      notesChange: handleNotesChange,
      progressChange: handleProgressChange,
    }),
    [
      handlePromptChange,
      handleGenerate,
      handleShuffle,
      handleCopy,
      handleDeleteTrack,
      handleMuteToggle,
      handleSoloToggle,
      handleVolumeChange,
      handlePanChange,
      handleTabChange,
      handleToggleDrawer,
      toggleFxDrawer,
      handleNotesChange,
      handleProgressChange,
    ],
  );

  return {
    ui,
    adapter,
    tracks,
    setTracks,
    isLoadingTracks,
    loadTracks,
    engineToDbId,
    supportsMeters,
    trackLevels,
    anySolo,
    reorder,
    soundHistory,
    isComposing,
    placeholders,
    isAddingTrack,
    isExportingMidi,
    designerView,
    canCrossfade,
    needsContract,
    xfFromId,
    xfToId,
    importOpen,
    setImportOpen,
    soundImportTarget,
    setSoundImportTarget,
    handleSoundImportPick,
    handlePortTrack,
    transition,
    crossfadePairsMeta,
    fadesMeta,
    resolvedCrossfadePairs,
    crossfadeMemberDbIds,
    resolvedFades,
    fadeMemberDbIds,
    resolvedSingleFades,
    resolvedGroupFades,
    resolvedGenericGroups,
    genericGroupMemberDbIds,
    availableInstruments,
    instrumentsLoading,
    handlers,
    handleGenerate,
    handleShuffle,
    handleAddTrack,
    handleDeleteTrack,
    handleExportMidi,
    handlePromptChange,
    handleMuteToggle,
    handleSoloToggle,
    handleVolumeChange,
    handlePanChange,
    handleTabChange,
    handleToggleDrawer,
    toggleFxDrawer,
    handleNotesChange,
    handleProgressChange,
    handleCopy,
    handleFxToggle,
    handleFxPresetChange,
    handleFxDryWetChange,
    handleInstrumentSelect,
    handleShowEditor,
    handleBackToInstruments,
    handleRefreshInstruments,
    onAuditionNote,
    makeServices,
    setGroupMute,
    setGroupSolo,
    deleteGroup,
  };
}
