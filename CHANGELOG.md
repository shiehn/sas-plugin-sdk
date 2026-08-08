# Changelog — @signalsandsorcery/plugin-sdk

Versions below are SDK **contract** versions (`PLUGIN_SDK_VERSION`), which the
npm package version now tracks 1:1 (they historically diverged; converged at
2.49.0). This file starts at 2.46.0 — earlier history lives in git log.

## 2.65.0 — Exact media properties for raw audio files

`PluginSampleInfo.durationSeconds` only covers files that were imported into
the sample library, so a panel resolving a one-shot straight out of a pack
folder had no way to learn how long it is. That blocks end-alignment: you
cannot place a riser so its natural end lands on the loop boundary without
knowing its duration first.

- **`host.getAudioFileInfo(filePath)` → `PluginAudioFileInfo`** —
  `durationSeconds` (decoded, not read off the header), `sampleRate`,
  `channels`. Backed by sas-audio-tool's analyze path.
- Rejects `VALIDATION_ERROR` when the file does not exist and `ENGINE_ERROR`
  when the audio tool is unavailable or cannot decode it. Treat any failure
  as "duration unknown" and degrade gracefully rather than blocking
  generation.
- Optional for older-host compat — feature-check
  `host.getAudioFileInfo?.(...)`.

First consumer is the Mix Assets panel (`@signalsandsorcery/mix-assets`),
which end-aligns risers via `startSec = loopEnd − sampleDuration`.

## 2.64.0 — Animate: the cross-track animation surface

The ownership model (`assertOwned`) blocks every per-track mutator on tracks a
plugin didn't create — correct for generator panels, fatal for a control-plane
panel whose whole job is animating OTHER panels' tracks. This release adds the
single sanctioned exception: a **declarative, capability-gated animate
surface**, built for the new Animate panel (`@signalsandsorcery/animate`).

- **Types**: `AnimationSpec` (`type` + `targets` (track DB ids) + `params` +
  optional `listen` sources), `AnimationType` (18-token wire vocabulary —
  pumper/autopan/tremolo/trance-gate, fades/dj-filter/riser/reverb-tail/
  delay-throw/washout, duck/sidechain-filter/keyed-gate/gap-filler,
  stutter/drunk-walk/breathe), `AnimationListenDerive` (all deterministic —
  MIDI onsets, ghost grids, or analysis of a cached offline source render;
  never live audio), `AnimateState`/`AnimationInfo`/`AnimateTrackRef`.
- **Host methods** (all optional — feature-gate on
  `typeof host.setAnimation === 'function'`): `getAnimateState`,
  `setAnimation` (full-spec upsert by `spec.id`; validates and pushes
  compiled engine configs; `VALIDATION_ERROR` on unsupported type, bad
  ranges, `targets ∩ listen.sources`, or a claimed (target, slot) — the
  error names the conflicting animation), `removeAnimation` (clears every
  pushed slot), `refreshAnimations` (system-facing re-push).
- **`PluginCapabilities.crossTrackAutomation`** — gates the four methods
  (`CAPABILITY_DENIED` otherwise). It does NOT unlock any direct per-track
  mutator; those stay `assertOwned`-gated. Granted to the built-in Animate
  panel only — treat further grants as a design smell, not a template.
- The wire vocabulary is deliberately a superset of what the host compiles
  today; unsupported types reject legibly so panel and host can version
  independently.

## 2.63.0 — FX parameter automation

Before this, **`setTrackVolumeAutomation` was the entire automation surface a
panel could reach** — volume only. A panel could not automate an FX parameter
at all, and there is no beat clock in the renderer to fake one with
(`onTransportEvent` fires only play/stop; `positionChange` is declared but
never emitted). Tempo-locked FX automation from a panel was simply impossible.

- **`PluginHost.setTrackFxAutomation?(trackId, category, curves)`** — write
  automation curves onto a track's built-in FX. `curves` maps parameter name to
  a `{ timeSeconds, value, curve? }` point list. Rides the engine's
  `plugin.setParameterAutomation`, so curves **re-read on loop wrap and bake
  into bounces** — a pattern authored across one loop repeats for free and
  survives into renders. An empty point array CLEARS that parameter.
  - The alias **`'dryWet'`** resolves to whichever parameter carries the
    category's mix (`'Wet Level'` for reverb, `'Mix proportion'` for delay), so
    the common case needs no knowledge of engine parameter names.
  - Chorus and phaser drive mix through plugin *state* rather than a parameter,
    so `'dryWet'` is rejected for those with a reason — never silently no-op'd.
  - Partial success is REPORTED (`{ written, skipped }`), not thrown: one bad
    parameter name must not discard the curves that resolved. A single
    requested curve that fails does throw.
- **`PluginHost.listTrackFxParameters?(trackId, category)`** — enumerate a
  built-in FX's automatable parameters (name, index, range, current value), with
  `isDryWet` marking what the alias resolves to.
- Feature-gate both on `typeof host.setTrackFxAutomation === 'function'`.

CAVEAT: curves are authored in SECONDS at the current tempo. After a BPM change
they no longer line up musically — re-push them. (`AutomationCurve` supports a
beat time-base; wiring it up is future work.)

## 2.53.0 — Panel-bus FX drag-to-reorder

- **`PluginHost.movePanelBusFx?(sceneId, fromFxIndex, toFxIndex)`** — move a
  bus FX to another slot in the chain. Both indices are
  `PanelBusFxEntry.index` values; splice semantics (the FX lands AT
  `toFxIndex`). Rides the engine's pre-existing `panelBus.reorderFx` (open
  editors closed first; Volume & Pan + the bus level meter stay pinned to
  the chain tail). Feature-gate on
  `typeof host.movePanelBusFx === 'function'`.
- **`PanelMasterStrip`**: FX chips drag-to-reorder when the new optional
  `onMoveFx` prop is provided — the same chip-drag interaction as the track
  drawer's 3rd-party FX (2.51.0). `usePanelBus` grows `fxReorderSupported` +
  `onMoveFx(fromFxIndex, toFxIndex)` (optimistic local reorder, converging
  reload); the panel-core shell wires it automatically, so panels pick this
  up with no per-panel changes.
- Durability: the host refreshes the per-panel bus blob after every move, so
  the new order survives reopen and `.sasproj` import.

## 2.52.0 — Panel-bus sidechain (kick→bass ducking)

- **`PluginHost.getPanelBusSidechain?(sceneId)` / `setPanelBusSidechain?(sceneId, amount, presetId)`**
  — the bus's "Duck" control: `amount` 0..1 (0 = off) + preset curve
  (`'subtle' | 'classic' | 'hard'`). The duck envelope is derived host-side
  from the scene's **kick MIDI onsets** (Kickstart-style gain shaping, not a
  compressor): muting kicks never breaks the pump, bounces bake it in, and
  new/regenerated kicks reshape it automatically. Reading state never engages
  the bus; the first `set` does. New type: **`PanelBusSidechainState`**
  (`engaged`, `amount`, `presetId`, `kickTrackCount`, `kickOnsetCount`).
- **`PanelMasterStrip`**: optional DUCK cluster (amount slider + preset
  select + "no kicks" hint), rendered only when the new `sidechain` props are
  provided. `usePanelBus` grows `sidechain`, `sidechainSupported`,
  `onSidechainAmountChange` (150 ms drag debounce, local echo) and
  `onSidechainPresetChange`.
- **`PanelFeatureFlags.busSidechain?`** — per-family opt-in; the shell
  additionally gates on host support, so the flag is inert on pre-2.52 hosts.
  The bass panel ships it first.

## 2.51.0 — Track external FX drag-to-reorder

- **`PluginHost.moveTrackExternalFx?(trackId, fromFxIndex, toFxIndex)`** —
  move a third-party insert to another slot in the track's chain. Both
  indices are `TrackExternalFxEntry.index` values; splice semantics (the FX
  lands AT `toFxIndex`). Only external inserts are movable or valid landing
  slots — never the instrument or built-ins; the engine additionally pins
  Volume & Pan to the chain tail and closes the track's open plugin editors
  before the move. Feature-gate on
  `typeof host.moveTrackExternalFx === 'function'`.
- **`TrackExternalFxSection`**: FX chips drag-to-reorder when the host
  supports the method (optimistic local reorder, converging reload —
  `useTrackReorder`'s HTML5 DnD idiom at chip size). `useTrackExternalFx`
  grows `reorderSupported` + `onMoveFx(fromFxIndex, toFxIndex)`.
- Durability: the host refreshes the per-track external-FX blob after every
  move, so the new order survives reopen and `.sasproj` import.

## 2.50.0 — Time signatures (types + utils; still dark)

- **`utils/time-signature.ts`** (new, exported from the root): meter parsing +
  conversions — `parseTimeSignature` / `tryParseTimeSignature`,
  `ALLOWED_TIME_SIGNATURES`, `isAllowedTimeSignature`, `barsToSeconds` /
  `barsToQn` / `denseGridLength`, `meterFamily` / `beatGrouping` /
  `strongSlots` / `finalCadenceSlotCount`, and `manifestSupportsMeter`
  (undeclared ⇒ 4/4-only; `'*'`; `'*/den'` denominator-family wildcards).
  Byte-identical twin of the app's `src/shared/utils/time-signature.ts`,
  pinned by the app's sdk-parity test.
- **`PluginManifest.supportedTimeSignatures?: string[] | '*'`** — declare the
  meters a plugin can author for. Absent ⇒ `['4/4']` (safe back-compat
  default). The host disables the panel and refuses content writes
  (`createTrack`, `writeMidiClip`, sample placement, stems, recording) with
  the new **`TIME_SIGNATURE_UNSUPPORTED`** `PluginErrorCode` on unsupported
  scene meters; read paths stay open.
- **`PluginSceneContext.timeSignature?: string`** — the scene's meter ("N/D");
  absent on older hosts ⇒ '4/4'. Also healed the `chordTiming` drift (the
  field existed only in the app's copy of the types).
- **`RecordingTargetInfo.timeSignature?: string`** + `bars` doc now references
  it (was "(4/4 assumed)"). `MusicalContext.timeSignature` documented as the
  SCENE's signature on hosts ≥ 2.50 (earlier hosts returned the project-level
  value). `fitSampleToScene` documented 4/4-only (library `duration_bars` are
  4/4-relative).
- **`crossfade-meta.buildCrossfadeVolumeCurves` / `fade-meta.buildFadeVolumeCurve`**
  gain an optional trailing `timeSignature?` param (omitted = 4/4-identical);
  durations now route through `barsToSeconds`.
- **panel-core**: new `meter.ts` helpers `panelClipEndSeconds` /
  `panelMaxBeats` / `panelMeter` / `panelQuarterNotesPerBar`;
  `useGeneratorPanelCore` + `useTransitionOps` compute clip `endTime` / note
  clamps from `MusicalContext.timeSignature` and thread the meter into the
  fade/crossfade automation curves.
- **panel-core `meter-prompt.ts`** (new): `buildPluginMeterGuidance(ts)` →
  `{ rhythm, grouping, barArithmetic }` — per-meter-family musical guidance
  for plugin LLM prompts (waltz no-backbeat 3/4, 6/8 second-pulse backbeat +
  threes, 12/8 shuffle pulses, odd/asymmetric group-start anchoring with the
  grouping stated, 2/4 march, 9/8 three pulses), plus the prompt-ready
  `formatPluginMeterGuidance(ts)` renderer. **'4/4' returns EMPTY strings** —
  plugins keep their 4/4 prompts byte-identical and only append guidance on
  non-4/4 scenes.
- **Piano-roll meter wiring**: `GeneratorTrackState.editBeatsPerBar` (quarter
  notes per bar; default 4) threads through `GeneratorPanelShell` →
  `TrackRow.editBeatsPerBar` → `TrackDrawer.editBeatsPerBar` →
  `PianoRollEditor.beatsPerBar`, set from the scene meter on edit-load
  (`panelQuarterNotesPerBar`). Direct `TrackRow`/`TrackDrawer` users omit the
  prop and keep today's 4-qn grid.
- **`GeneratorPanelAdapter.buildSystemPrompt(validRoles, timeSignature?)`** —
  the core now passes the scene meter to the family system prompt (incl. the
  crossfade/fade inpaint calls); implementations may ignore the new optional
  parameter, so existing adapters compile unchanged.
- **`PianoRollEditor.beatsPerBar`** doc corrected: the prop is QUARTER-NOTES
  per bar (pass `parseTimeSignature(ts).quarterNotesPerBar`; fractional 3.5
  for 7/8 is safe — geometry is float-safe, no integer loops).
- Repo now has its own jest suite (`npm test`): time-signature util, meter
  cases for the curve builders, panel-core meter helpers.
- Internal version drift healed: `src/constants/sdk-version.ts` said 2.46.0
  while package.json said 2.49.0; both now 2.50.0.

With every scene in 4/4 and no manifest declaring `supportedTimeSignatures`,
every addition above is observably inert.

## 2.49.0 — Pack size variants + linked-broadcast progress

- `SamplePackPublicInfo.installedSizeBytes?` + `variants?` (small/large);
  `startSamplePackDownload(packId, variant?)`.
- `DrumKit.restore?` / `InstrumentSampler.restore?` — replaying persisted
  sounds on load is not a sound edit (freeze stays intact).
- panel-core linked-broadcast progress surface; VolumeSlider thumb fix.

## 2.48.0 — Ensemble instrumentation axis + group collapse & link-sounds

- ensemble-core instrumentation modes (strings / horns / winds).
- panel-core `CollapsibleGroup` + 🔗 link-sounds. No new host surface.

## 2.47.1 — Freeze badge refresh

- `useTrackFreeze` listens for the workstation's `sas:freeze-changed` window
  event so batch freezes update mounted badges/tabs.

## 2.47.0 — Track freeze badge + lifted hook

- `useTrackFreeze` hook + TrackRow ❄ badge (feature-detects the 2.46.0 host
  freeze trio; old hosts render nothing).

## 2.46.0 — Track freeze drawer tab

- `TrackFreezeSection` + host freeze trio (`getTrackFreezeState` /
  `freezeTrack` / `unfreezeTrack`).
