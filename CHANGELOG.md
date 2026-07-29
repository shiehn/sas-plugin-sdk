# Changelog — @signalsandsorcery/plugin-sdk

Versions below are SDK **contract** versions (`PLUGIN_SDK_VERSION`), which the
npm package version now tracks 1:1 (they historically diverged; converged at
2.49.0). This file starts at 2.46.0 — earlier history lives in git log.

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
