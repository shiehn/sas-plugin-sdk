/**
 * GeneratorPanelShell — the shared render skeleton for panel-core panels.
 *
 * Verbatim extraction of the synth panel's render phases
 * (SynthGeneratorPanel.tsx:1849–2195): no-scene gate → no-contract gate →
 * COMPOSING → placeholder hybrid → normal (modals, mounted-but-hidden
 * TransitionDesigner, crossfade/fade rows, generic group rows, normal rows,
 * export button). The ~50-prop TrackRow plumbing that the monolith duplicated
 * across the hybrid + normal phases lives here ONCE (`buildRowProps`), pinned
 * by the Phase-0 props snapshot.
 *
 * @since SDK 2.35.0
 */

import React, { useCallback } from 'react';
import type { ReactNode } from 'react';
import type { BulkAddPlaceholderTrack } from '../types/plugin-sdk.types';
import type { FxCategory } from '../types/fx-toggle.types';
import { TrackRow, type SDKTrackRowProps } from '../components/TrackRow';
import { CrossfadeTrackRow } from '../components/CrossfadeTrackRow';
import { FadeTrackRow } from '../components/FadeTrackRow';
import { ImportTrackModal } from '../components/ImportTrackModal';
import { TransitionDesigner } from '../components/TransitionDesigner';
import { SorceryProgressBar } from '../components/SorceryProgressBar';
import { PanelMasterStrip } from '../components/PanelMasterStrip';
import { usePanelBus } from '../hooks/usePanelBus';
import type { CrossfadeSlot } from '../crossfade-meta';
import type { TrackRowDragProps } from '../hooks/useTrackReorder';
import type { GeneratorTrackState } from './track-state';
import type { GeneratorPanelCore } from './useGeneratorPanelCore';
import type { GeneratorPanelSlots, GroupRenderContext } from './adapter.types';

export interface GeneratorPanelShellProps {
  core: GeneratorPanelCore;
  slots?: GeneratorPanelSlots;
}

export function GeneratorPanelShell({ core, slots }: GeneratorPanelShellProps): React.ReactElement {
  const {
    ui,
    adapter,
    tracks,
    isLoadingTracks,
    supportsMeters,
    trackLevels,
    anySolo,
    reorder,
    soundHistory,
    isComposing,
    placeholders,
    designerView,
    canCrossfade,
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
    resolvedGenericGroups,
    genericGroupMemberDbIds,
    availableInstruments,
    instrumentsLoading,
    handlers,
    isExportingMidi,
    handleExportMidi,
    handleFxToggle,
    handleFxPresetChange,
    handleFxDryWetChange,
    handleInstrumentSelect,
    handleShowEditor,
    handleBackToInstruments,
    handleRefreshInstruments,
    onAuditionNote,
    loadTracks,
    makeServices,
    setGroupMute,
    setGroupSolo,
    deleteGroup,
  } = core;
  const { host, activeSceneId, isAuthenticated, sceneContext, onSelectScene, onOpenContract } = ui;
  // Panel mix bus (docs/panel-bus.md §11): shared strip for every core-based
  // panel. Feature-gated — renders nothing on hosts without the bus surface,
  // which also keeps the Phase-0 pin harness (mock host) byte-identical.
  const panelBus = usePanelBus(host, activeSceneId);
  const { identity, features } = adapter;

  // --- The ONE default TrackRow props builder ------------------------------
  // Byte-identical to the monolith's duplicated prop blocks; the Phase-0
  // snapshot (sas-app synth-panel-behavior.test.tsx) pins its output.
  const buildRowProps = useCallback(
    (track: GeneratorTrackState, drag?: TrackRowDragProps): SDKTrackRowProps => {
      const id = track.handle.id;
      const pickerProps = features.instrumentPicker
        ? {
            instrumentName: track.instrumentName,
            instrumentMissing: track.instrumentMissing,
            onToggleDrawer: () => handlers.toggleDrawer(id),
            availableInstruments,
            currentInstrumentPluginId: track.instrumentPluginId,
            onInstrumentSelect: (pluginId: string) => handleInstrumentSelect(id, pluginId),
            instrumentsLoading,
            onRefreshInstruments: handleRefreshInstruments,
            editorStage: track.editorStage,
            onShowEditor: () => handleShowEditor(id),
            onBackToInstruments: () => handleBackToInstruments(id),
          }
        : {};
      const importSoundProps = features.importTracks
        ? {
            onImportSound: () => setSoundImportTarget(track),
            importSoundLabel: adapter.sound.importSoundLabel,
          }
        : {};
      const props: SDKTrackRowProps = {
        ...(drag ? { drag } : {}),
        track: { id, name: track.handle.name, role: track.role },
        levels: supportsMeters ? trackLevels : undefined,
        prompt: track.prompt,
        runtimeState: {
          muted: track.runtimeState.muted,
          solo: track.runtimeState.solo,
          volume: track.runtimeState.volume,
          pan: track.runtimeState.pan,
        },
        soloedOut: anySolo && !track.runtimeState.solo,
        fxDetailState: track.fxDetailState,
        drawerOpen: track.drawerOpen,
        drawerTab: track.drawerTab,
        onTabChange: (tab) => handlers.tabChange(id, tab),
        isGenerating: track.isGenerating,
        isAuthenticated,
        error: track.error,
        hasMidi: track.hasMidi,
        generationProgress: track.generationProgress,
        estimatedGenerationMs: identity.estimatedGenerationMs,
        onPromptChange: (prompt: string) => handlers.promptChange(id, prompt),
        onGenerate: () => handlers.generate(id),
        onShuffle: () => handlers.shuffle(id),
        onCopy: () => handlers.copy(id),
        onDelete: () => handlers.delete(id),
        onMuteToggle: () => handlers.muteToggle(id),
        onSoloToggle: () => handlers.soloToggle(id),
        onVolumeChange: (vol: number) => handlers.volumeChange(id, vol),
        onPanChange: (pan: number) => handlers.panChange(id, pan),
        onFxToggle: (cat: FxCategory, enabled: boolean) => handleFxToggle(id, cat, enabled),
        externalFxHost: host,
        onFxPresetChange: (cat: FxCategory, idx: number) => handleFxPresetChange(id, cat, idx),
        onFxDryWetChange: (cat: FxCategory, val: number) => handleFxDryWetChange(id, cat, val),
        onToggleFxDrawer: () => handlers.toggleFxDrawer(id),
        onProgressChange: (pct: number) => handlers.progressChange(id, pct),
        accentColor: identity.accentColor,
        ...pickerProps,
        soundHistory: soundHistory.list(id).entries,
        soundHistoryCursor: soundHistory.list(id).cursor,
        onRestoreSound: (i: number) => {
          void soundHistory.restoreTo(id, i);
        },
        onToggleFavorite: (i: number) => soundHistory.toggleFavorite(id, i),
        ...importSoundProps,
        editNotes: track.editNotes,
        onNotesChange: (notes) => handlers.notesChange(id, notes),
        editBars: track.editBars,
        editBpm: track.editBpm,
        editSnap: 0.25,
        onAuditionNote: (pitch, vel, ms) => onAuditionNote(id, pitch, vel, ms),
      };
      return adapter.mapTrackRowProps ? adapter.mapTrackRowProps(track, props) : props;
    },
    [
      features.instrumentPicker,
      features.importTracks,
      adapter,
      supportsMeters,
      trackLevels,
      anySolo,
      isAuthenticated,
      identity,
      handlers,
      availableInstruments,
      instrumentsLoading,
      handleInstrumentSelect,
      handleRefreshInstruments,
      handleShowEditor,
      handleBackToInstruments,
      setSoundImportTarget,
      soundHistory,
      handleFxToggle,
      handleFxPresetChange,
      handleFxDryWetChange,
      onAuditionNote,
    ],
  );

  // --- Render -----------------------------------------------------------

  // No scene selected
  if (!activeSceneId) {
    return (
      <div
        data-testid={`no-scene-placeholder-${identity.familyKey}`}
        className="flex items-center justify-center py-8"
      >
        <button
          onClick={() => onSelectScene?.()}
          className="text-sas-muted text-xs hover:text-sas-accent transition-colors underline underline-offset-2"
        >
          Select a Scene
        </button>
      </div>
    );
  }

  // Scene selected but no contract generated yet.
  if (!sceneContext?.hasContract) {
    return (
      <div
        data-testid={`no-contract-placeholder-${identity.familyKey}`}
        className="flex items-center justify-center py-8"
      >
        <button
          onClick={() => onOpenContract?.()}
          className="text-sas-muted text-xs hover:text-sas-accent transition-colors underline underline-offset-2"
        >
          Generate a Contract
        </button>
      </div>
    );
  }

  // Phase 1: COMPOSING — single progress bar during LLM planning
  if (features.bulkComposePlaceholders && isComposing) {
    return (
      <div data-testid={`${identity.familyKey}-section`} className="p-2">
        <SorceryProgressBar isLoading={true} statusText="COMPOSING..." heightClass="h-10" />
      </div>
    );
  }

  // Phase 2: HYBRID — completed tracks show full TrackRow, in-progress show bars
  const activePlaceholders = features.bulkComposePlaceholders ? placeholders : [];
  if (activePlaceholders.length > 0) {
    // Build lookup from DB ID → loaded track state for completed tracks
    const tracksByDbId = new Map<string, GeneratorTrackState>();
    for (const t of tracks) {
      tracksByDbId.set(t.handle.dbId, t);
      if (t.handle.id !== t.handle.dbId) {
        tracksByDbId.set(t.handle.id, t);
      }
    }

    return (
      <div data-testid={`${identity.familyKey}-section`} className="p-2 space-y-2">
        {activePlaceholders.map((ph: BulkAddPlaceholderTrack) => {
          const loadedTrack = ph.status === 'completed' ? tracksByDbId.get(ph.id) : undefined;

          // Completed AND loaded → full TrackRow UI
          if (loadedTrack) {
            return <TrackRow key={ph.id} {...buildRowProps(loadedTrack)} />;
          }

          // In-progress, planned, failed, or completed-but-not-yet-loaded → bar
          return (
            <div
              key={ph.id}
              data-testid="bulk-placeholder-track"
              className="relative rounded-sm border w-full overflow-hidden border-sas-border bg-sas-panel-alt"
              style={{ borderLeftColor: identity.placeholderAccentColor, borderLeftWidth: '3px' }}
            >
              <SorceryProgressBar isLoading={true} statusText="CONJURING MIDI..." heightClass="h-10" />
            </div>
          );
        })}
      </div>
    );
  }

  // Group render context for generic extensions.
  const groupCtx: GroupRenderContext = {
    services: makeServices(),
    anySolo,
    supportsMeters,
    levels: supportsMeters ? trackLevels : undefined,
    handlers,
    renderDefaultTrackRow: (
      track: GeneratorTrackState,
      overrides?: Partial<SDKTrackRowProps>,
      drag?: TrackRowDragProps,
    ): ReactNode => (
      <TrackRow key={track.handle.id} {...{ ...buildRowProps(track, drag), ...(overrides ?? {}) }} />
    ),
    setGroupMute,
    setGroupSolo,
    deleteGroup,
  };

  // Phase 3: NORMAL — real tracks using SDK TrackRow
  return (
    <div data-testid={`${identity.familyKey}-section`} className="p-2 space-y-2">
      {features.importTracks && host.listImportableTracks && (
        <ImportTrackModal
          host={host}
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            void loadTracks(true);
          }}
          onPortTrack={host.readImportableTrackMidi ? handlePortTrack : undefined}
          testIdPrefix={`${identity.familyKey}-import`}
        />
      )}
      {features.importTracks && host.listImportableTracks && host.getTrackSound && (
        <ImportTrackModal
          host={host}
          mode="sound"
          open={!!soundImportTarget}
          title={adapter.sound.importSoundLabel}
          onClose={() => setSoundImportTarget(null)}
          onImported={() => {}}
          onPick={handleSoundImportPick}
          testIdPrefix={`${identity.familyKey}-sound-import`}
        />
      )}
      {slots?.modals}
      {canCrossfade && xfFromId && xfToId && (
        <div className={designerView ? 'contents' : 'hidden'}>
          <TransitionDesigner
            host={host}
            fromSceneId={xfFromId}
            toSceneId={xfToId}
            transitionSceneId={activeSceneId ?? ''}
            excludeSourceDbIds={[
              ...crossfadePairsMeta.flatMap((p) => [p.originSourceDbId, p.targetSourceDbId]),
              ...fadesMeta.map((f) => f.meta.sourceTrackDbId),
            ]}
            onCreateCrossfade={transition.handleCreateCrossfade}
            onCreateFade={transition.handleCreateFade}
            familyLabel={identity.familyLabel}
            testIdPrefix={`${identity.familyKey}-transition-designer`}
          />
        </div>
      )}
      {!(designerView && canCrossfade) &&
        (isLoadingTracks ? (
          <div className="text-sas-muted text-xs text-center py-4">Loading tracks...</div>
        ) : (
          <>
            {panelBus.supported && panelBus.bus && (
              <PanelMasterStrip
                bus={panelBus.bus}
                levels={panelBus.levels}
                availableFx={panelBus.availableFx}
                fxLoading={panelBus.fxLoading}
                soloedOut={anySolo && !panelBus.bus.soloed}
                fxPickerOpen={panelBus.fxPickerOpen}
                onToggleFxPicker={panelBus.setFxPickerOpen}
                onRefreshFx={panelBus.refreshFx}
                onVolumeChange={panelBus.onVolumeChange}
                onMuteToggle={panelBus.onMuteToggle}
                onSoloToggle={panelBus.onSoloToggle}
                onAddFx={panelBus.onAddFx}
                onRemoveFx={panelBus.onRemoveFx}
                onToggleFxEnabled={panelBus.onToggleFxEnabled}
                onShowFxEditor={panelBus.onShowFxEditor}
              />
            )}
            {slots?.beforeRows}
            {resolvedCrossfadePairs.map((pair) => (
              <CrossfadeTrackRow
                key={pair.groupId}
                accentColor={identity.transitionAccentColor}
                levels={supportsMeters ? trackLevels : undefined}
                sliderPos={pair.sliderPos}
                origin={{
                  trackId: pair.origin.handle.id,
                  name: pair.origin.handle.name,
                  role: pair.origin.role,
                  sourceName: pair.originSourceName,
                  soundLabel: pair.originSoundLabel,
                  runtimeState: pair.origin.runtimeState,
                }}
                target={{
                  trackId: pair.target.handle.id,
                  name: pair.target.handle.name,
                  role: pair.target.role,
                  sourceName: pair.targetSourceName,
                  soundLabel: pair.targetSoundLabel,
                  runtimeState: pair.target.runtimeState,
                }}
                onMuteToggle={() => transition.handleCrossfadeMute(pair)}
                onSoloToggle={() => transition.handleCrossfadeSolo(pair)}
                onVolumeChange={(slot: CrossfadeSlot, vol: number) =>
                  handlers.volumeChange(
                    slot === 'origin' ? pair.origin.handle.id : pair.target.handle.id,
                    vol,
                  )
                }
                onPanChange={(slot: CrossfadeSlot, pan: number) =>
                  handlers.panChange(
                    slot === 'origin' ? pair.origin.handle.id : pair.target.handle.id,
                    pan,
                  )
                }
                onSliderChange={(pos: number) => transition.handleCrossfadeSlider(pair, pos)}
                onDelete={() => transition.handleCrossfadeDelete(pair)}
              />
            ))}
            {resolvedFades.map((fade) => (
              <FadeTrackRow
                key={fade.dbId}
                accentColor={identity.transitionAccentColor}
                levels={supportsMeters ? trackLevels : undefined}
                direction={fade.meta.direction}
                gesture={fade.meta.gesture}
                sliderPos={fade.meta.sliderPos}
                layer={{
                  trackId: fade.track.handle.id,
                  name: fade.track.handle.name,
                  role: fade.track.role,
                  sourceName: fade.meta.sourceName,
                  soundLabel: fade.meta.soundLabel,
                  runtimeState: fade.track.runtimeState,
                }}
                onMuteToggle={() => handlers.muteToggle(fade.track.handle.id)}
                onSoloToggle={() => handlers.soloToggle(fade.track.handle.id)}
                onVolumeChange={(vol: number) => handlers.volumeChange(fade.track.handle.id, vol)}
                onPanChange={(pan: number) => handlers.panChange(fade.track.handle.id, pan)}
                onSliderChange={(pos: number) => transition.handleFadeSlider(fade, pos)}
                onDelete={() => transition.handleFadeDelete(fade)}
              />
            ))}
            {(adapter.groupExtensions ?? []).flatMap((ext) =>
              (resolvedGenericGroups[ext.metaKey]?.resolved ?? []).map((group) => (
                <React.Fragment key={`${ext.metaKey}:${group.groupId}`}>
                  {ext.renderGroup(group, groupCtx)}
                </React.Fragment>
              )),
            )}
            {tracks.map((track: GeneratorTrackState, index: number) => {
              if (
                crossfadeMemberDbIds.has(track.handle.dbId) ||
                fadeMemberDbIds.has(track.handle.dbId) ||
                genericGroupMemberDbIds.has(track.handle.dbId)
              ) {
                return null;
              }
              return <TrackRow key={track.handle.id} {...buildRowProps(track, reorder.dragPropsFor(index))} />;
            })}
            {slots?.afterRows}
          </>
        ))}

      {/* Export Tracks — bundle all tracks' MIDI as a ZIP */}
      {features.exportMidi &&
        !designerView &&
        !isLoadingTracks &&
        tracks.length > 0 &&
        (() => {
          const hasAnyMidi = tracks.some((t) => t.hasMidi);
          const exportDisabled = isExportingMidi || !hasAnyMidi;
          return (
            <div className="pt-2">
              <button
                data-testid="export-midi-tracks-button"
                onClick={handleExportMidi}
                disabled={exportDisabled}
                title={
                  isExportingMidi
                    ? 'Exporting...'
                    : !hasAnyMidi
                      ? 'Generate MIDI on at least one track first'
                      : 'Export all tracks as a ZIP of .mid files'
                }
                className={`w-full px-2 py-1.5 text-[10px] uppercase tracking-wide rounded-sm border transition-colors ${
                  exportDisabled
                    ? 'text-sas-muted/40 border-transparent hover:border-sas-accent cursor-not-allowed'
                    : 'text-sas-muted hover:text-sas-accent border-sas-border hover:border-sas-accent'
                }`}
              >
                {isExportingMidi ? 'Exporting...' : 'Export Tracks'}
              </button>
            </div>
          );
        })()}
    </div>
  );
}
