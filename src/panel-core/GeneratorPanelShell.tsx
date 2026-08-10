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

import React, { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { BulkAddPlaceholderTrack } from '../types/plugin-sdk.types';
import type { FxCategory } from '../types/fx-toggle.types';
import { TrackRow, type SDKTrackRowProps } from '../components/TrackRow';
import { CrossfadeTrackRow } from '../components/CrossfadeTrackRow';
import { FadeTrackRow } from '../components/FadeTrackRow';
import { GroupFadeTrackRow } from '../components/GroupFadeTrackRow';
import { ImportTrackModal } from '../components/ImportTrackModal';
import { TransitionDesigner } from '../components/TransitionDesigner';
import { SorceryProgressBar } from '../components/SorceryProgressBar';
import { PanelMasterStrip } from '../components/PanelMasterStrip';
import { GroupCollapseChevron } from '../components/GroupCollapseChevron';
import { usePanelBus } from '../hooks/usePanelBus';
import type { CrossfadeSlot } from '../crossfade-meta';
import type { TrackRowDragProps } from '../hooks/useTrackReorder';
import type { GeneratorTrackState } from './track-state';
import type { GeneratorPanelCore } from './useGeneratorPanelCore';
import type { GeneratorPanelSlots, GroupRenderContext, PanelGroupExtension } from './adapter.types';
import type { ResolvedTrackGroup } from './group-meta';
import { altGroupCandidates, type AltTrackMeta } from './alt-tracks';

/** Scene-data suffix holding a group's UI state (`track:<groupId>:groupUi`). */
const GROUP_UI_KEY = 'groupUi';

/**
 * Per-group collapse wrapper (@since SDK 2.48.0): owns the group's collapsed
 * flag, hydrates it once from scene-data (`track:<groupId>:groupUi`, groupId =
 * the anchor's dbId in every voice-group plugin), persists on toggle
 * (fire-and-forget), and hands the group renderer a per-group ctx with
 * `collapsed` + `onToggleCollapse`. Persistence lives HERE — once for all
 * group plugins — so families without their own config channel get it free.
 */
function CollapsibleGroup({
  ext,
  group,
  groupCtx,
}: {
  ext: PanelGroupExtension<unknown>;
  group: ResolvedTrackGroup<unknown, GeneratorTrackState>;
  groupCtx: GroupRenderContext;
}): React.ReactElement {
  const { host, activeSceneId, trackDataKey } = groupCtx.services;
  const uiKey = trackDataKey(group.groupId, GROUP_UI_KEY);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!activeSceneId) return undefined;
    void host
      .getSceneData(activeSceneId, uiKey)
      .then((raw) => {
        if (cancelled || !raw || typeof raw !== 'object') return;
        setCollapsed((raw as { collapsed?: unknown }).collapsed === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [host, activeSceneId, uiKey]);

  const onToggleCollapse = useCallback((): void => {
    setCollapsed((prev) => {
      const next = !prev;
      if (activeSceneId) {
        void host.setSceneData(activeSceneId, uiKey, { collapsed: next }).catch(() => {});
      }
      return next;
    });
  }, [host, activeSceneId, uiKey]);

  return <>{ext.renderGroup(group, { ...groupCtx, collapsed, onToggleCollapse })}</>;
}

/**
 * Alt-track bracket (@since SDK 2.66.0): n interchangeable ALTERNATIVES of
 * one part, stacked under one header so the grouping is visible at a glance.
 * Only ONE member sounds at a time — the host rotates them round-robin, one
 * per loop cycle, and the arranger staggers them across the arrangement.
 *
 * The ● marks whichever member is currently audible. It is DERIVED from
 * runtime mute state (the host's rotation is engine-only and pushes
 * trackStateChanged), never from local state — so the dot tracks the actual
 * sound even when rotation advances from outside this panel.
 */
function AltTrackGroup({
  group,
  pinned,
  accentColor,
  collapsed,
  onToggleCollapse,
  onTogglePin,
  onRemoveMember,
  renderRow,
}: {
  group: ResolvedTrackGroup<AltTrackMeta, GeneratorTrackState>;
  pinned: boolean;
  accentColor?: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
  onRemoveMember: (trackId: string) => void;
  renderRow: (track: GeneratorTrackState) => ReactNode;
}): React.ReactElement {
  const activeDbId =
    group.members.find((m) => !m.track.runtimeState.muted)?.dbId ?? null;
  return (
    <div
      data-testid={`sdk-alt-group-${group.groupId}`}
      className="border border-sas-border rounded-sm mb-1"
      style={accentColor ? { borderLeft: `2px solid ${accentColor}` } : undefined}
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-sas-border">
        <GroupCollapseChevron
          what="alternatives"
          collapsed={collapsed}
          onToggle={onToggleCollapse}
        />
        <span className="text-[10px] uppercase tracking-wide text-sas-muted">
          Alternatives · {group.members.length} · round-robin
        </span>
        <div className="flex-1" />
        <button
          data-testid={`sdk-alt-group-pin-${group.groupId}`}
          onClick={onTogglePin}
          aria-pressed={pinned}
          title={
            pinned
              ? 'Pinned — the current alternative keeps playing. Click to resume rotating each loop.'
              : 'Pin this group: hold the current alternative while the full mix plays (soloing pauses rotation too).'
          }
          className={`px-1.5 py-0.5 text-[10px] rounded-sm border transition-colors ${
            pinned
              ? 'text-sas-accent border-sas-accent'
              : 'text-sas-muted border-sas-border hover:text-sas-accent hover:border-sas-accent'
          }`}
        >
          {pinned ? '📌 Pinned' : 'Pin'}
        </button>
      </div>
      {!collapsed && (
        <div className="p-1 space-y-1">
          {group.members.map((member) => (
            <div key={member.dbId} className="flex items-start gap-1">
              <span
                data-testid={`sdk-alt-active-${member.dbId}`}
                title={
                  member.dbId === activeDbId
                    ? 'Playing this loop'
                    : 'Silent this loop — waiting its turn'
                }
                className={`mt-2 text-[10px] leading-none ${
                  member.dbId === activeDbId ? 'text-sas-accent' : 'text-sas-muted/30'
                }`}
              >
                ●
              </span>
              <div className="flex-1 min-w-0">{renderRow(member.track)}</div>
              <button
                data-testid={`sdk-alt-remove-${member.dbId}`}
                onClick={() => onRemoveMember(member.track.handle.id)}
                title="Remove from this alternatives group (it plays with the mix again)"
                className="mt-1 px-1 text-[10px] text-sas-muted hover:text-sas-accent transition-colors"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
    handleRestoreSound,
    handlePortTrack,
    handleImportedTrack,
    transition,
    crossfadePairsMeta,
    fadesMeta,
    resolvedCrossfadePairs,
    crossfadeMemberDbIds,
    resolvedSingleFades,
    resolvedGroupFades,
    fadeMemberDbIds,
    resolvedGenericGroups,
    genericGroupMemberDbIds,
    resolvedAltGroups,
    altGroupMemberDbIds,
    altGroupPins,
    altTracksEnabled,
    groupAlternatives,
    removeAlternative,
    setAltGroupPinned,
    groupBroadcast,
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
  // Alt-group collapse is view-local (a glance-level affordance, not document
  // state) — unlike the generic CollapsibleGroup, which persists per group
  // because those families have no other home for their UI flags.
  const [collapsedAltGroups, setCollapsedAltGroups] = useState<Record<string, boolean>>({});
  const toggleAltGroupCollapsed = useCallback((groupId: string): void => {
    setCollapsedAltGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

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
      // Alternatives section in the FX drawer. Candidates are pre-filtered to
      // what the host will accept (same panel, not already in another group),
      // so nothing offered here can fail.
      const altTrackProps = altTracksEnabled
        ? {
            altTracks: {
              members: (
                resolvedAltGroups.find((g) => g.groupId === track.handle.altGroupId)?.members ?? []
              ).map((m) => ({
                trackId: m.track.handle.id,
                dbId: m.dbId,
                name: m.track.handle.name,
              })),
              candidates: altGroupCandidates(tracks, track).map((t) => ({
                trackId: t.handle.id,
                dbId: t.handle.dbId,
                name: t.handle.name,
              })),
              onGroup: (otherTrackId: string) => {
                void groupAlternatives([id, otherTrackId]);
              },
              onUngroup: () => {
                void removeAlternative(id);
              },
            },
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
        ...altTrackProps,
        soundHistory: soundHistory.list(id).entries,
        soundHistoryCursor: soundHistory.list(id).cursor,
        onRestoreSound: (i: number) => {
          void handleRestoreSound(id, i);
        },
        onToggleFavorite: (i: number) => soundHistory.toggleFavorite(id, i),
        ...importSoundProps,
        editNotes: track.editNotes,
        onNotesChange: (notes) => handlers.notesChange(id, notes),
        editBars: track.editBars,
        editBpm: track.editBpm,
        editBeatsPerBar: track.editBeatsPerBar,
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
      handleRestoreSound,
      handleFxToggle,
      handleFxPresetChange,
      handleFxDryWetChange,
      onAuditionNote,
      altTracksEnabled,
      resolvedAltGroups,
      tracks,
      groupAlternatives,
      removeAlternative,
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
    <div data-testid={`${identity.familyKey}-section`} className="relative p-2 space-y-2">
      {/* Blocking overlay while a linked-group broadcast applies a sound /
          instrument serially across every sibling (@since SDK 2.49.0). The
          per-part applies are engine round-trips with large state blobs, so
          a full group takes seconds — block the panel so a second gesture
          can't interleave, and show determinate progress. */}
      {groupBroadcast && (
        <div
          data-testid={`${identity.familyKey}-group-broadcast-overlay`}
          role="alert"
          aria-busy="true"
          className="absolute inset-0 z-30 flex items-center justify-center rounded-sm bg-black/60 backdrop-blur-[1px]"
        >
          <div className="w-[min(20rem,90%)] rounded-sm border border-sas-border bg-sas-panel p-3 shadow-xl">
            <div className="mb-1 font-mono text-xs text-sas-text">
              Applying {groupBroadcast.kind === 'sound' ? 'sound' : 'instrument'} to all parts…
            </div>
            <div
              className="mb-2 truncate font-mono text-[10px] text-sas-muted"
              title={groupBroadcast.label}
            >
              {groupBroadcast.label}
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded bg-sas-panel-alt">
              {/* Same sas-accent gradient as SorceryProgressBar — progress is
                  always the project green, not the panel family's accent. */}
              <div
                className="h-full bg-gradient-to-r from-sas-accent/70 to-sas-accent transition-all duration-300"
                style={{
                  width: `${Math.round((groupBroadcast.done / Math.max(1, groupBroadcast.total)) * 100)}%`,
                }}
              />
            </div>
            <div className="mt-1 text-right font-mono text-[10px] text-sas-muted">
              {groupBroadcast.done}/{groupBroadcast.total} parts
            </div>
          </div>
        </div>
      )}
      {features.importTracks && host.listImportableTracks && (
        <ImportTrackModal
          host={host}
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={(handle) => {
            void handleImportedTrack(handle);
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
            onCreateCrossfade={
              adapter.transitionGroup?.fadeOnly ? undefined : transition.handleCreateCrossfade
            }
            onCreateFade={
              adapter.transitionGroup
                ? (sel, dir) => transition.handleCreateVerbatimGroupFade(sel, dir)
                : transition.handleCreateFade
            }
            mapColumnSubjects={
              adapter.transitionGroup
                ? (sceneId, tracks) => adapter.transitionGroup!.mapColumnSubjects(sceneId, tracks)
                : undefined
            }
            fadeEstimateMs={adapter.transitionGroup?.fadeEstimateMs}
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
                onMoveFx={panelBus.fxReorderSupported ? panelBus.onMoveFx : undefined}
                sidechain={
                  adapter.features.busSidechain && panelBus.sidechainSupported
                    ? panelBus.sidechain
                    : null
                }
                onSidechainAmountChange={
                  adapter.features.busSidechain && panelBus.sidechainSupported
                    ? panelBus.onSidechainAmountChange
                    : undefined
                }
                onSidechainPresetChange={
                  adapter.features.busSidechain && panelBus.sidechainSupported
                    ? panelBus.onSidechainPresetChange
                    : undefined
                }
                onSidechainSourceChange={
                  adapter.features.busSidechain && panelBus.sidechainSupported
                    ? panelBus.onSidechainSourceChange
                    : undefined
                }
                motion={
                  adapter.features.busMotion && panelBus.motionSupported
                    ? panelBus.motion
                    : null
                }
                onMotionAmountChange={
                  adapter.features.busMotion && panelBus.motionSupported
                    ? panelBus.onMotionAmountChange
                    : undefined
                }
                onMotionRateChange={
                  adapter.features.busMotion && panelBus.motionSupported
                    ? panelBus.onMotionRateChange
                    : undefined
                }
                onMotionShapeChange={
                  adapter.features.busMotion && panelBus.motionSupported
                    ? panelBus.onMotionShapeChange
                    : undefined
                }
                onMotionTargetChange={
                  adapter.features.busMotion && panelBus.motionSupported
                    ? panelBus.onMotionTargetChange
                    : undefined
                }
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
            {resolvedSingleFades.map((fade) => (
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
            {resolvedGroupFades.map((group) => (
              <GroupFadeTrackRow
                key={group.groupId}
                accentColor={identity.transitionAccentColor}
                levels={supportsMeters ? trackLevels : undefined}
                direction={group.direction}
                gesture={group.gesture}
                sliderPos={group.sliderPos}
                groupLabel={
                  adapter.transitionGroup?.groupRowLabel?.(group.members.length) ??
                  `Group (${group.members.length} tracks)`
                }
                members={group.members.map((m) => ({
                  trackId: m.track.handle.id,
                  name: m.track.handle.name,
                  role: m.track.role,
                  sourceName: m.meta.sourceName,
                  soundLabel: m.meta.soundLabel,
                  memberLabel: m.meta.memberLabel,
                  runtimeState: m.track.runtimeState,
                }))}
                onMemberMuteToggle={(trackId: string) => handlers.muteToggle(trackId)}
                onMemberSoloToggle={(trackId: string) => handlers.soloToggle(trackId)}
                onMemberVolumeChange={(trackId: string, vol: number) => handlers.volumeChange(trackId, vol)}
                onMemberPanChange={(trackId: string, pan: number) => handlers.panChange(trackId, pan)}
                onMuteAll={() =>
                  setGroupMute(
                    group.members.map((m) => m.track.handle.id),
                    !group.members.every((m) => m.track.runtimeState.muted),
                  )
                }
                onSoloAll={() =>
                  setGroupSolo(
                    group.members.map((m) => m.track.handle.id),
                    !group.members.every((m) => m.track.runtimeState.solo),
                  )
                }
                onSliderChange={(pos: number) => transition.handleGroupFadeSlider(group, pos)}
                onDelete={() => transition.handleGroupFadeDelete(group)}
              />
            ))}
            {(adapter.groupExtensions ?? []).flatMap((ext) =>
              (resolvedGenericGroups[ext.metaKey]?.resolved ?? [])
                // A GROUP FADE's copies carry BOTH the family group meta and a
                // fade meta — the GroupFadeTrackRow above owns them. Deleting
                // the fade metas degrades back to a normal family group row.
                .filter((group) => !group.members.every((m) => fadeMemberDbIds.has(m.dbId)))
                .map((group) => (
                  <CollapsibleGroup
                    key={`${ext.metaKey}:${group.groupId}`}
                    ext={ext}
                    group={group}
                    groupCtx={groupCtx}
                  />
                )),
            )}
            {resolvedAltGroups.map((group) => (
              <AltTrackGroup
                key={`alt:${group.groupId}`}
                group={group}
                pinned={altGroupPins[group.groupId] === true}
                accentColor={identity.accentColor}
                collapsed={collapsedAltGroups[group.groupId] === true}
                onToggleCollapse={() => toggleAltGroupCollapsed(group.groupId)}
                onTogglePin={() => {
                  void setAltGroupPinned(group.groupId, altGroupPins[group.groupId] !== true);
                }}
                onRemoveMember={(trackId) => {
                  void removeAlternative(trackId);
                }}
                // Members are ordinary rows — every per-track control keeps
                // working inside the bracket. No drag props: like every other
                // group row, members are not reorderable.
                renderRow={(track) => <TrackRow {...buildRowProps(track)} />}
              />
            ))}
            {tracks.map((track: GeneratorTrackState, index: number) => {
              if (
                crossfadeMemberDbIds.has(track.handle.dbId) ||
                fadeMemberDbIds.has(track.handle.dbId) ||
                genericGroupMemberDbIds.has(track.handle.dbId) ||
                altGroupMemberDbIds.has(track.handle.dbId)
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
