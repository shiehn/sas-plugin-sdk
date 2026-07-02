/**
 * Transition-scene machinery for panel-core panels — crossfade pair + fade
 * creation, group controls, sliders, drift re-sync, and fade curve re-apply.
 * Moved VERBATIM from the synth panel (SynthGeneratorPanel.tsx 715–987,
 * 1148–1235, 1787–1847) with the family-specific pieces routed through the
 * GeneratorPanelAdapter (sound copy/persist, system prompt, note parsing,
 * track naming). Semantics are frozen by the Phase-0 behavior pin.
 *
 * Deliberately NOT rewritten onto the generic group seam (group-meta.ts) —
 * that seam is additive for new families (bass voice groups); migrating
 * crossfades onto it is a contained follow-up.
 *
 * @since SDK 2.35.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PluginHost,
  PluginTrackHandle,
  PluginSceneContext,
  MidiClipData,
} from '../types/plugin-sdk.types';
import {
  EQUAL_POWER_GAIN,
  asCrossfadeMeta,
  soundIdentity,
  buildCrossfadeVolumeCurves,
  type CrossfadeMeta,
  type CrossfadePairMeta,
} from '../crossfade-meta';
import { buildCrossfadeInpaintPrompt } from '../crossfade-inpaint';
import {
  asFadeMeta,
  buildFadeVolumeCurve,
  type FadeDirection,
  type FadeGesture,
  type FadeMeta,
  type FadeEntry,
} from '../fade-meta';
import type { CrossfadeSelection } from '../components/CrossfadeModal';
import type { FadeSelection } from '../components/FadeModal';
import type { GeneratorTrackState } from './track-state';
import type { GeneratorPanelAdapter } from './adapter.types';

/** A crossfade pair resolved against live track state (both members present). */
export interface ResolvedCrossfadePair extends CrossfadePairMeta {
  origin: GeneratorTrackState;
  target: GeneratorTrackState;
}

/** A fade (transition orphan) resolved against live track state. */
export interface ResolvedFade extends FadeEntry {
  track: GeneratorTrackState;
}

export interface UseTransitionOpsInputs {
  host: PluginHost;
  adapter: GeneratorPanelAdapter;
  activeSceneId: string | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  sceneContext: PluginSceneContext | null | undefined;
  tracks: GeneratorTrackState[];
  setTracks: React.Dispatch<React.SetStateAction<GeneratorTrackState[]>>;
  loadTracks(incremental?: boolean): Promise<void>;
  setCrossfadePairsMeta: React.Dispatch<React.SetStateAction<CrossfadePairMeta[]>>;
  setFadesMeta: React.Dispatch<React.SetStateAction<FadeEntry[]>>;
  resolvedCrossfadePairs: ResolvedCrossfadePair[];
  resolvedFades: ResolvedFade[];
}

export interface TransitionOps {
  isCreatingCrossfade: boolean;
  isCreatingFade: boolean;
  handleCreateCrossfade(origin: CrossfadeSelection, target: CrossfadeSelection): Promise<void>;
  handleCreateFade(
    selection: FadeSelection,
    direction: FadeDirection,
    gesture: FadeGesture,
  ): Promise<void>;
  handleCrossfadeMute(pair: ResolvedCrossfadePair): void;
  handleCrossfadeSolo(pair: ResolvedCrossfadePair): void;
  handleCrossfadeDelete(pair: ResolvedCrossfadePair): Promise<void>;
  handleCrossfadeSlider(pair: ResolvedCrossfadePair, pos: number): void;
  handleFadeDelete(fade: ResolvedFade): Promise<void>;
  handleFadeSlider(fade: ResolvedFade, pos: number): void;
}

export function useTransitionOps({
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
}: UseTransitionOpsInputs): TransitionOps {
  const { identity } = adapter;

  // Engine track ids whose fade volume curve has been applied this session
  // (keyed by engine id so reopen → new ids re-applies; curve isn't engine-persisted).
  const appliedFadeAutomationRef = useRef<Set<string>>(new Set());

  // Apply the crossfade volume automation: origin fades out, target fades in
  // across the loop (equal-power, crossover at sliderPos). Falls back to a static
  // equal-power blend on hosts without setTrackVolumeAutomation.
  const applyCrossfadeAutomation = useCallback(
    async (
      originTrackId: string,
      targetTrackId: string,
      bars: number,
      bpm: number,
      sliderPos: number,
    ): Promise<void> => {
      if (host.setTrackVolumeAutomation) {
        const curves = buildCrossfadeVolumeCurves(bars, bpm, sliderPos);
        await host.setTrackVolumeAutomation(originTrackId, curves.origin).catch(() => {});
        await host.setTrackVolumeAutomation(targetTrackId, curves.target).catch(() => {});
      } else {
        await host.setTrackVolume(originTrackId, EQUAL_POWER_GAIN).catch(() => {});
        await host.setTrackVolume(targetTrackId, EQUAL_POWER_GAIN).catch(() => {});
      }
    },
    [host],
  );

  // Apply a fade's one-sided volume curve (volume gesture ramps; build stays flat
  // at unity so the notes carry the fade). No-op on hosts without automation.
  const applyFadeAutomation = useCallback(
    async (
      trackId: string,
      direction: FadeDirection,
      bars: number,
      bpm: number,
      sliderPos: number,
      gesture: FadeGesture,
    ): Promise<void> => {
      if (!host.setTrackVolumeAutomation) return;
      const points = buildFadeVolumeCurve(bars, bpm, direction, sliderPos, gesture);
      await host.setTrackVolumeAutomation(trackId, points).catch(() => {});
    },
    [host],
  );

  // --- Create a crossfade pair (transition scenes) ----------------------
  // Two tracks share ONE generated MIDI clip: the top wears the ORIGIN scene
  // track's preset, the bottom wears the TARGET's. One-action: generate →
  // create both → write same MIDI → copy sounds → equal-power volumes →
  // persist pairing. LIFO rollback on any failure. Throws so the designer
  // surfaces it.
  const [isCreatingCrossfade, setIsCreatingCrossfade] = useState(false);
  const handleCreateCrossfade = useCallback(
    async (origin: CrossfadeSelection, target: CrossfadeSelection): Promise<void> => {
      const scene = activeSceneId;
      const fromSceneId = sceneContext?.transitionFromSceneId ?? '';
      const toSceneId = sceneContext?.transitionToSceneId ?? '';
      if (!scene) throw new Error('No active scene.');
      if (!isConnected) throw new Error('Systems not connected.');
      if (!isAuthenticated) throw new Error('Please sign in to generate the bridge.');
      if (tracks.length + 2 > identity.maxTracks) {
        throw new Error('Not enough track slots for a crossfade.');
      }

      setIsCreatingCrossfade(true);
      const created: PluginTrackHandle[] = [];
      try {
        const role = target.role ?? origin.role ?? ''; // bridge heads toward the target

        // 1. Generate ONE bridge clip via MIDI INPAINTING: morph the ORIGIN part
        // into the TARGET part across the transition. The harmonic frame is
        // auto-prefixed by generateWithLLM; we add the two endpoint patterns +
        // the morph instruction. Read both patterns before creating the layers.
        const mc = await host.getMusicalContext();
        const [originMidi, targetMidi, originKey, targetKey] = await Promise.all([
          host.readImportableTrackMidi
            ? host.readImportableTrackMidi(origin.dbId)
            : Promise.resolve({ clips: [] }),
          host.readImportableTrackMidi
            ? host.readImportableTrackMidi(target.dbId)
            : Promise.resolve({ clips: [] }),
          host.getSceneKey ? host.getSceneKey(fromSceneId) : Promise.resolve(null),
          host.getSceneKey ? host.getSceneKey(toSceneId) : Promise.resolve(null),
        ]);
        const userPrompt = buildCrossfadeInpaintPrompt({
          role,
          bars: mc.bars,
          originName: origin.name,
          targetName: target.name,
          originKey: originKey ? `${originKey.key} ${originKey.mode}` : null,
          targetKey: targetKey ? `${targetKey.key} ${targetKey.mode}` : null,
          originNotes: originMidi.clips[0]?.notes ?? [],
          targetNotes: targetMidi.clips[0]?.notes ?? [],
        });
        const llm = await host.generateWithLLM({
          system: adapter.buildSystemPrompt(host.getValidRoles()),
          user: userPrompt,
          responseFormat: 'json',
        });
        const parsed = adapter.parseNotesResponse(llm.content);
        if (!parsed || parsed.notes.length === 0) {
          throw new Error('The bridge generator returned no notes.');
        }
        const notes = await host.postProcessMidi(parsed.notes, {
          quantize: true,
          removeOverlaps: true,
        });
        const clip: MidiClipData = {
          startTime: 0,
          endTime: (mc.bars * 4 * 60) / mc.bpm,
          tempo: mc.bpm,
          notes,
        };

        // 2. Create the two layer tracks (family default instrument; sound copied below).
        const top = await host.createTrack({
          name: `${identity.trackNamePrefix}-${Date.now()}-xf-o`,
          ...adapter.createTrackOptions(),
        });
        created.push(top);
        const bottom = await host.createTrack({
          name: `${identity.trackNamePrefix}-${Date.now()}-xf-t`,
          ...adapter.createTrackOptions(),
        });
        created.push(bottom);
        if (role) {
          await host.setTrackRole(top.id, role).catch(() => {});
          await host.setTrackRole(bottom.id, role).catch(() => {});
        }

        // 3. SAME MIDI on both layers.
        await host.writeMidiClip(top.id, clip);
        await host.writeMidiClip(bottom.id, clip);

        // 4. Copy each source sound onto its layer (exact sound — no shuffle).
        // The adapter's copySnapshot persists the copy as the layer's durable
        // identity — an unpersisted copy reads as "no sound" forever and gets
        // re-pushed to the engine by the drift re-sync on every panel load.
        const copySound = async (newTrackId: string, sourceDbId: string): Promise<string> => {
          if (!host.getTrackSound) return 'default';
          const snap = await host.getTrackSound(sourceDbId);
          if (!snap || snap.kind !== adapter.sound.acceptedSnapshotKind) return 'default';
          return adapter.sound.copySnapshot(newTrackId, snap);
        };
        const originLabel = await copySound(top.id, origin.dbId);
        const targetLabel = await copySound(bottom.id, target.dbId);

        // 5. Crossfade volume automation (centered slider). Leave unmuted —
        // the point is to hear it.
        await applyCrossfadeAutomation(top.id, bottom.id, mc.bars, mc.bpm, 0.5);

        // 6. Persist the pairing (one key per member, shared groupId).
        const groupId = top.dbId;
        const originMeta: CrossfadeMeta = {
          groupId,
          slot: 'origin',
          partnerDbId: bottom.dbId,
          sourceTrackDbId: origin.dbId,
          sourceSceneId: fromSceneId,
          sourceName: origin.name,
          soundLabel: originLabel,
          sliderPos: 0.5,
        };
        const targetMeta: CrossfadeMeta = {
          groupId,
          slot: 'target',
          partnerDbId: top.dbId,
          sourceTrackDbId: target.dbId,
          sourceSceneId: toSceneId,
          sourceName: target.name,
          soundLabel: targetLabel,
          sliderPos: 0.5,
        };
        await host.setSceneData(scene, `track:${top.dbId}:crossfade`, originMeta);
        await host.setSceneData(scene, `track:${bottom.dbId}:crossfade`, targetMeta);

        await loadTracks(true);
        host.showToast('success', 'Crossfade created', `${origin.name} → ${target.name}`);
      } catch (err: unknown) {
        // LIFO rollback — delete any track we created.
        for (const h of [...created].reverse()) {
          try {
            await host.deleteTrack(h.id);
          } catch {
            /* best effort */
          }
        }
        throw err instanceof Error ? err : new Error(String(err));
      } finally {
        setIsCreatingCrossfade(false);
      }
    },
    [
      host,
      adapter,
      identity,
      activeSceneId,
      isConnected,
      isAuthenticated,
      tracks.length,
      sceneContext,
      applyCrossfadeAutomation,
      loadTracks,
    ],
  );

  // --- Create a fade (transition orphan) --------------------------------
  // A fade is a crossfade with one empty endpoint: ONE generated track that
  // either fades in (target-only) or out (origin-only) across the transition.
  const [isCreatingFade, setIsCreatingFade] = useState(false);
  const handleCreateFade = useCallback(
    async (
      selection: FadeSelection,
      direction: FadeDirection,
      gesture: FadeGesture,
    ): Promise<void> => {
      const scene = activeSceneId;
      const fromSceneId = sceneContext?.transitionFromSceneId ?? '';
      const toSceneId = sceneContext?.transitionToSceneId ?? '';
      if (!scene) throw new Error('No active scene.');
      if (!isConnected) throw new Error('Systems not connected.');
      if (!isAuthenticated) throw new Error('Please sign in to generate the fade.');
      if (tracks.length + 1 > identity.maxTracks) {
        throw new Error('Not enough track slots for a fade.');
      }

      setIsCreatingFade(true);
      const created: PluginTrackHandle[] = [];
      try {
        const role = selection.role ?? '';
        // The source lives in the FROM scene for a fade-out, the TO scene for a fade-in.
        const sourceSceneId = direction === 'out' ? fromSceneId : toSceneId;

        // 1. Generate the part via inpainting with ONE empty endpoint.
        const mc = await host.getMusicalContext();
        const [srcMidi, srcKey] = await Promise.all([
          host.readImportableTrackMidi
            ? host.readImportableTrackMidi(selection.dbId)
            : Promise.resolve({ clips: [] }),
          host.getSceneKey ? host.getSceneKey(sourceSceneId) : Promise.resolve(null),
        ]);
        const srcNotes = srcMidi.clips[0]?.notes ?? [];
        const keyStr = srcKey ? `${srcKey.key} ${srcKey.mode}` : null;
        const userPrompt = buildCrossfadeInpaintPrompt({
          role,
          bars: mc.bars,
          originName: direction === 'out' ? selection.name : 'silence',
          targetName: direction === 'in' ? selection.name : 'silence',
          originKey: direction === 'out' ? keyStr : null,
          targetKey: direction === 'in' ? keyStr : null,
          originNotes: direction === 'out' ? srcNotes : [],
          targetNotes: direction === 'in' ? srcNotes : [],
        });
        const llm = await host.generateWithLLM({
          system: adapter.buildSystemPrompt(host.getValidRoles()),
          user: userPrompt,
          responseFormat: 'json',
        });
        const parsed = adapter.parseNotesResponse(llm.content);
        if (!parsed || parsed.notes.length === 0) {
          throw new Error('The fade generator returned no notes.');
        }
        const notes = await host.postProcessMidi(parsed.notes, {
          quantize: true,
          removeOverlaps: true,
        });
        const clip: MidiClipData = {
          startTime: 0,
          endTime: (mc.bars * 4 * 60) / mc.bpm,
          tempo: mc.bpm,
          notes,
        };

        // 2. Create ONE track (family default instrument; sound copied below).
        const track = await host.createTrack({
          name: `${identity.trackNamePrefix}-${Date.now()}-fade-${direction}`,
          ...adapter.createTrackOptions(),
        });
        created.push(track);
        if (role) await host.setTrackRole(track.id, role).catch(() => {});

        // 3. MIDI.
        await host.writeMidiClip(track.id, clip);

        // 4. Copy the source sound (exact sound — no shuffle). copySnapshot
        // persists it as the layer's durable identity for the drift re-sync.
        let soundLabel = 'default';
        if (host.getTrackSound) {
          const snap = await host.getTrackSound(selection.dbId);
          if (snap && snap.kind === adapter.sound.acceptedSnapshotKind) {
            soundLabel = await adapter.sound.copySnapshot(track.id, snap);
          }
        }

        // 5. One-sided volume curve (centered slider). Mark applied so the load
        // effect doesn't redundantly re-apply.
        await applyFadeAutomation(track.id, direction, mc.bars, mc.bpm, 0.5, gesture);
        appliedFadeAutomationRef.current.add(track.id);

        // 6. Persist the fade metadata (one key for the lone track).
        const meta: FadeMeta = {
          direction,
          gesture,
          sourceTrackDbId: selection.dbId,
          sourceSceneId,
          sourceName: selection.name,
          soundLabel,
          sliderPos: 0.5,
        };
        await host.setSceneData(scene, `track:${track.dbId}:fade`, meta);

        await loadTracks(true);
        host.showToast(
          'success',
          direction === 'in' ? 'Fade in created' : 'Fade out created',
          selection.name,
        );
      } catch (err: unknown) {
        for (const h of [...created].reverse()) {
          try {
            await host.deleteTrack(h.id);
          } catch {
            /* best effort */
          }
        }
        throw err instanceof Error ? err : new Error(String(err));
      } finally {
        setIsCreatingFade(false);
      }
    },
    [
      host,
      adapter,
      identity,
      activeSceneId,
      isConnected,
      isAuthenticated,
      tracks.length,
      sceneContext,
      applyFadeAutomation,
      loadTracks,
    ],
  );

  // --- Crossfade group controls -----------------------------------------
  // Mute/solo act on BOTH layers together (group); per-layer volume/pan reuse
  // the normal handlers (members are normal tracks). Delete removes the whole
  // pair + its scene-data keys.
  const handleCrossfadeMute = useCallback(
    (pair: ResolvedCrossfadePair): void => {
      const newMuted = !pair.origin.runtimeState.muted;
      for (const id of [pair.origin.handle.id, pair.target.handle.id]) {
        setTracks((prev) =>
          prev.map((t) =>
            t.handle.id === id
              ? { ...t, runtimeState: { ...t.runtimeState, muted: newMuted } }
              : t,
          ),
        );
        host.setTrackMute(id, newMuted).catch(() => {});
      }
    },
    [host, setTracks],
  );

  const handleCrossfadeSolo = useCallback(
    (pair: ResolvedCrossfadePair): void => {
      const newSolo = !pair.origin.runtimeState.solo;
      for (const id of [pair.origin.handle.id, pair.target.handle.id]) {
        setTracks((prev) =>
          prev.map((t) =>
            t.handle.id === id ? { ...t, runtimeState: { ...t.runtimeState, solo: newSolo } } : t,
          ),
        );
        host.setTrackSolo(id, newSolo).catch(() => {});
      }
    },
    [host, setTracks],
  );

  const handleCrossfadeDelete = useCallback(
    async (pair: ResolvedCrossfadePair): Promise<void> => {
      try {
        for (const member of [pair.origin, pair.target]) {
          await host.deleteTrack(member.handle.id);
          if (activeSceneId) {
            await host.deleteSceneData(activeSceneId, `track:${member.handle.dbId}:crossfade`);
          }
        }
        setCrossfadePairsMeta((prev) => prev.filter((p) => p.groupId !== pair.groupId));
        setTracks((prev) =>
          prev.filter(
            (t) =>
              t.handle.id !== pair.origin.handle.id && t.handle.id !== pair.target.handle.id,
          ),
        );
        host.showToast('success', 'Crossfade removed');
      } catch (err: unknown) {
        host.showToast(
          'error',
          'Failed to delete crossfade',
          err instanceof Error ? err.message : String(err),
        );
      }
    },
    [host, activeSceneId, setCrossfadePairsMeta, setTracks],
  );

  // Drag the crossfade fader: optimistic UI now, debounced engine apply + persist
  // of sliderPos (recomputes the equal-power curves at the new crossover point).
  const crossfadeSliderTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const handleCrossfadeSlider = useCallback(
    (pair: ResolvedCrossfadePair, pos: number): void => {
      setCrossfadePairsMeta((prev) =>
        prev.map((p) => (p.groupId === pair.groupId ? { ...p, sliderPos: pos } : p)),
      );
      if (crossfadeSliderTimers.current[pair.groupId]) {
        clearTimeout(crossfadeSliderTimers.current[pair.groupId]);
      }
      crossfadeSliderTimers.current[pair.groupId] = setTimeout(() => {
        void (async () => {
          const mc = await host.getMusicalContext();
          await applyCrossfadeAutomation(
            pair.origin.handle.id,
            pair.target.handle.id,
            mc.bars,
            mc.bpm,
            pos,
          );
          if (activeSceneId) {
            const sceneData = (await host.getAllSceneData(activeSceneId)) as Record<
              string,
              unknown
            >;
            for (const dbId of [pair.originDbId, pair.targetDbId]) {
              const meta = asCrossfadeMeta(sceneData[`track:${dbId}:crossfade`]);
              if (meta) {
                host
                  .setSceneData(activeSceneId, `track:${dbId}:crossfade`, { ...meta, sliderPos: pos })
                  .catch(() => {});
              }
            }
          }
        })();
      }, 200);
    },
    [host, activeSceneId, applyCrossfadeAutomation, setCrossfadePairsMeta],
  );

  // --- Fade controls ----------------------------------------------------
  const handleFadeDelete = useCallback(
    async (fade: ResolvedFade): Promise<void> => {
      try {
        await host.deleteTrack(fade.track.handle.id);
        if (activeSceneId) {
          await host.deleteSceneData(activeSceneId, `track:${fade.dbId}:fade`);
        }
        setFadesMeta((prev) => prev.filter((f) => f.dbId !== fade.dbId));
        setTracks((prev) => prev.filter((t) => t.handle.id !== fade.track.handle.id));
        host.showToast('success', 'Fade removed');
      } catch (err: unknown) {
        host.showToast(
          'error',
          'Failed to delete fade',
          err instanceof Error ? err.message : String(err),
        );
      }
    },
    [host, activeSceneId, setFadesMeta, setTracks],
  );

  // Drag the fade slider: optimistic UI now, debounced engine apply + persist of
  // sliderPos (recomputes the one-sided curve at the new fade position).
  const fadeSliderTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const handleFadeSlider = useCallback(
    (fade: ResolvedFade, pos: number): void => {
      setFadesMeta((prev) =>
        prev.map((f) => (f.dbId === fade.dbId ? { ...f, meta: { ...f.meta, sliderPos: pos } } : f)),
      );
      if (fadeSliderTimers.current[fade.dbId]) clearTimeout(fadeSliderTimers.current[fade.dbId]);
      fadeSliderTimers.current[fade.dbId] = setTimeout(() => {
        void (async () => {
          const mc = await host.getMusicalContext();
          await applyFadeAutomation(
            fade.track.handle.id,
            fade.meta.direction,
            mc.bars,
            mc.bpm,
            pos,
            fade.meta.gesture,
          );
          if (activeSceneId) {
            const sceneData = (await host.getAllSceneData(activeSceneId)) as Record<
              string,
              unknown
            >;
            const meta = asFadeMeta(sceneData[`track:${fade.dbId}:fade`]);
            if (meta) {
              host
                .setSceneData(activeSceneId, `track:${fade.dbId}:fade`, { ...meta, sliderPos: pos })
                .catch(() => {});
            }
          }
        })();
      }, 200);
    },
    [host, activeSceneId, applyFadeAutomation, setFadesMeta],
  );

  // Auto re-sync drifted source sounds. A crossfade/fade COPIES each source's
  // sound onto its layer at creation; if the user later changes the source
  // track's sound, the transition is stale. Re-read source + layer sounds and,
  // if the source's state-aware identity differs, re-copy it onto the layer
  // AND persist it so the check converges. Runs once per layer↔source
  // membership, not per render — the resolved memos get fresh array identities
  // on EVERY tracks change (volume tick, mute, …).
  const lastResyncKeyRef = useRef('');
  useEffect(() => {
    if (
      !host.getTrackSound ||
      (resolvedCrossfadePairs.length === 0 && resolvedFades.length === 0)
    ) {
      return;
    }
    const resyncKey = [
      ...resolvedCrossfadePairs.map(
        (p) =>
          `${p.origin.handle.dbId}<${p.originSourceDbId}|${p.target.handle.dbId}<${p.targetSourceDbId}`,
      ),
      ...resolvedFades.map((f) => `${f.track.handle.dbId}<${f.meta.sourceTrackDbId}`),
    ].join(',');
    if (resyncKey === lastResyncKeyRef.current) return;
    lastResyncKeyRef.current = resyncKey;
    let cancelled = false;
    const reapplyIfDrifted = async (
      layerTrackId: string,
      layerDbId: string,
      sourceDbId: string,
    ): Promise<void> => {
      if (!host.getTrackSound || cancelled) return;
      const [sourceSnap, layerSnap] = await Promise.all([
        host.getTrackSound(sourceDbId),
        host.getTrackSound(layerDbId),
      ]);
      if (cancelled || !sourceSnap || sourceSnap.kind !== adapter.sound.acceptedSnapshotKind) {
        return;
      }
      if (soundIdentity(sourceSnap) === soundIdentity(layerSnap)) return;
      try {
        await adapter.sound.copySnapshot(layerTrackId, sourceSnap);
      } catch {
        /* best effort — retried on next membership change/reopen */
      }
    };
    void (async () => {
      for (const pair of resolvedCrossfadePairs) {
        await reapplyIfDrifted(pair.origin.handle.id, pair.origin.handle.dbId, pair.originSourceDbId);
        await reapplyIfDrifted(pair.target.handle.id, pair.target.handle.dbId, pair.targetSourceDbId);
      }
      for (const fade of resolvedFades) {
        await reapplyIfDrifted(fade.track.handle.id, fade.track.handle.dbId, fade.meta.sourceTrackDbId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedCrossfadePairs, resolvedFades, host, adapter]);

  // Re-apply each fade's one-sided volume curve on load (it is NOT engine-
  // persisted; recompute from the persisted sliderPos + gesture). Keyed by engine
  // track id so it fires once per resolve — including after reopen (new ids).
  useEffect(() => {
    if (!host.setTrackVolumeAutomation || resolvedFades.length === 0) return;
    void (async () => {
      const mc = await host.getMusicalContext();
      for (const fade of resolvedFades) {
        const id = fade.track.handle.id;
        if (appliedFadeAutomationRef.current.has(id)) continue;
        appliedFadeAutomationRef.current.add(id);
        await applyFadeAutomation(
          id,
          fade.meta.direction,
          mc.bars,
          mc.bpm,
          fade.meta.sliderPos,
          fade.meta.gesture,
        );
      }
    })();
  }, [resolvedFades, host, applyFadeAutomation]);

  return {
    isCreatingCrossfade,
    isCreatingFade,
    handleCreateCrossfade,
    handleCreateFade,
    handleCrossfadeMute,
    handleCrossfadeSolo,
    handleCrossfadeDelete,
    handleCrossfadeSlider,
    handleFadeDelete,
    handleFadeSlider,
  };
}
