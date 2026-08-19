# Changelog — @signalsandsorcery/plugin-sdk

Versions below are SDK **contract** versions (`PLUGIN_SDK_VERSION`), which the
npm package version now tracks 1:1 (they historically diverged; converged at
2.49.0). This file starts at 2.46.0 — earlier history lives in git log.

## 3.7.0 — BYO credentials: generic credential management + OAuth2

Third-party integrations (first consumer: the Freesound panel) need per-user
credentials — an API key the user pastes, plus an OAuth2 "Connect" for the
endpoints that demand it. That machinery is now host-provided and generic, so
the next integration reuses it instead of reinventing browser dances.

- **New optional `PluginHost` methods** (feature-probe before use):
  `credentialSetProfile` / `credentialGetProfile` / `credentialDeleteProfile` /
  `credentialGetStatus`, and `oauth2Authorize` / `oauth2CompleteWithCode` (OOB
  manual-code fallback) / `oauth2GetAccessToken` (transparent single-flight
  refresh) / `oauth2Disconnect`. New types `PluginCredentialState`,
  `PluginCredentialStatus`, `PluginOAuth2AuthorizeRequest`.
- Profiles + tokens persist under the plugin's own encrypted secrets;
  `refresh_token` and `client_secret` never cross to the renderer — plugins
  get only the short-lived access token, passed as a header to the
  equally-gated `httpRequest`/`downloadFile`.
- OAuth endpoints are gated by the same manifest
  `capabilities.network.allowedHosts` as every other egress path.
- **`downloadFile` hardened + made real**: now honors `headers`, `overwrite`
  and the new `timeoutMs` option (previously accepted-and-ignored), gates by
  `allowedHosts` (it was the one ungated egress path), rejects `..`/absolute
  filenames, and creates subdirectories (`previews/1.mp3` works now).

(Contract versions 3.4–3.6 were host-side additions — vocal rendering, freeze
`freezable`, text2voice — that shipped without a standalone SDK release; the
package version re-converges with the contract here.)

## 3.3.0 — The row's ❄ is a button

Freezing a track was a three-click dive (`▾` → Freeze tab → button) even though
the row already showed a ❄ telling you the state. The badge is now the control.

- **`TrackRow`**: the ❄ is a `<button>` that toggles — frozen → unfreeze, live →
  freeze — with **no confirmation dialog** (freeze is reversible and the stem is
  kept for an instant re-freeze, so a modal only taxed the common case). It now
  renders on LIVE tracks too, dimmed; previously it appeared only once frozen,
  so the row could show freeze state but never enter it. Inert while a render is
  in flight, while the row is generating, and while the recorded plugins are
  provably missing (unfreeze cannot rebuild that chain). The drawer's Freeze tab
  is unchanged — it still owns re-freeze, force-re-render, and dep detail.
  Same `data-testid="sdk-track-freeze-badge"`; glyphs ❄ / ⚠❄ / ❄! are unchanged.
- **NEW `TrackFreezeState.freezable?: boolean`** — false when a track can never
  freeze however it is edited (today: tracks in a transition scene, whose live
  volume-automation fades would bake into the stem and then apply twice). The
  row hides the toggle rather than offering a button certain to fail. Optional:
  hosts that omit it keep the always-offer behaviour.
- **`useTrackFreeze`**: single-track freeze/unfreeze now dispatches
  `sas:freeze-changed` (with `detail.trackId`) on success, so the scene and
  project ❄ rollups follow a row's toggle — previously only batch operations
  broadcast, and a per-track freeze left those counts stale. The hook skips its
  own echo. Failures now also go through `host.showToast`, since a one-click
  toggle has nowhere else to report a refusal.

## 3.1.0 — The track drawer stops hiding its options

Selecting a drawer tab now shows what that tab is for. The FX tab used to open
on `3RD-PARTY FX  none  [FX +]` and the Import tab on a single button — both
made choosing a thing a two-click dive that the instrument-picker tab never
imposed.

- **FX tab**: `TrackExternalFxSection`'s picker is open on mount and **stays
  open after a pick**, so a comp and a reverb go on back-to-back. `FX +` / `FX ▴`
  survives as a collapse control. `useTrackExternalFx` moves its
  `getAvailableFx` cache read from the toggle to the mount effect. The
  panel-bus strip (`PanelMasterStrip`) deliberately keeps its closed-by-default
  gate — it is a one-line control visible in every panel header, not a drawer
  you opened on purpose.
- **Import tab**: renders the scene → track chooser INLINE.
  - **NEW `ImportTrackBrowser`** — the two-step drill-down extracted out of
    `ImportTrackModal` (whose props and test ids are unchanged; it is now
    chrome + browser). `variant='inline'` drops the modal's fixed width and
    scroll box and shows a header row only while drilled into a scene.
  - **NEW `TrackDrawer` / `TrackRow` prop `onImportPick(sel)`** — apply a picked
    source sound to THAT row's track. Wiring it swaps the button for the inline
    browser; `onImportSound` alone still renders the button. Either prop now
    enables the tab.
  - **REMOVED from `useGeneratorPanelCore`**: `soundImportTarget` /
    `setSoundImportTarget`, and `handleSoundImportPick` becomes
    **`handleSoundImportPickFor(target, sel)`** — the destination arrives as an
    argument because the browser lives in the row that owns it. The shell no
    longer renders a `mode='sound'` `ImportTrackModal` (the whole-track import,
    launched from the panel header, keeps its modal).
- **RENAMED tab label**: `Pick` → **`Synth`**. The tab key (`pick`), the
  `DrawerTab` union and `data-testid="sdk-drawer-tab-pick"` are unchanged. Only
  the six Surge XT panels ever enable it (`features.instrumentPicker`); drum and
  instrument omit `onSelect` and never grow the tab.

## 3.0.0 — Built-in Tracktion FX removed (BREAKING)

The product is 3rd-party-FX-only: the six built-in FX categories
(eq/compressor/chorus/phaser/delay/reverb) — their sliders, presets and host
surface — are gone. The host additionally strips legacy built-in FX nodes
from every project on load (3rd-party inserts and their state are preserved
byte-for-byte) and clears the old `fx_preset_data` recipes (migration 083).

- **REMOVED components/exports**: `FxToggleBar`, everything from
  `fx-toggle.types` (`FxCategory`, `TrackFxDetailState`,
  `EMPTY_FX_DETAIL_STATE`, `FX_CATEGORIES`, …), `FX_PRESET_CONFIGS`,
  `pluginFxToToggleFx`.
- **REMOVED PluginHost methods**: `getTrackFxState`, `toggleTrackFx`,
  `setTrackFxPreset`, `setTrackFxDryWet`, `listTrackFxParameters`,
  `setTrackFxAutomation` (+ their types `PluginTrackFxDetailState`,
  `PluginFxCategoryDetailState`, `PluginFxParameterInfo`,
  `PluginFxAutomationResult`). `PluginAutomationPoint` stays
  (`setTrackVolumeAutomation`).
- **REMOVED TrackRow/TrackDrawer props**: `fxDetailState`, `fxState`,
  `onFxToggle`, `onFxPresetChange`, `onFxDryWetChange`. The FX tab is now
  gated purely on `externalFxHost` supporting `getTrackExternalFx` (or
  `altTracks`), and its body is `TrackExternalFxSection` (+ alternatives).
- **ADDED `applyManagedFxPreset?(trackId, intent)`** — closed intent set
  (`ManagedFxIntent = 'safety-limiter'`): the one surviving internal use of
  engine built-ins (brickwall limiter for coupled sound-design panels),
  resolved by preset NAME host-side. Panels re-arm after adoption — built-ins
  are stripped from disk on every load.
- **`renderSampleEffect`** effect union gains `'delay'`: an offline
  feedback-echo throw (optional `delayBeats`/`feedback`/`mix`), replacing the
  old built-in delay path in loop transitions (which was silently broken).
- `TrackFxCopyResult.builtIn` is always `[]` (kept for wire-shape compat);
  `copyTrackFxFrom` copies external inserts only.

## 2.69.0 — Regenerating over existing MIDI asks first

"Create" is the same button before and after a track has MIDI: the first press
composes, every later press silently replaced the pattern — and any piano-roll
edits — with a fresh LLM take, with no undo. It now confirms.

- **`useRegenerateGuard({ hasMidi, onGenerate, subject, detail })`** — returns
  `{ request, open, dialog }`. Call `request` instead of the generate handler
  and render `dialog`: with `hasMidi` false it generates immediately (nothing
  to lose), with `hasMidi` true it opens a "Replace existing MIDI?" confirm
  and only then calls `onGenerate`. Built on `ConfirmDialog`.
- **`TrackRow`** uses it internally for the Create button AND the prompt's
  Enter-to-generate, so every panel that renders a row (synth, drum,
  instrument, livecode, bass/arp/ensemble/pad voices) gets the guard with no
  change. `hasMidi` false — the first generation — is untouched. Its Create
  tooltip now reads "Regenerate MIDI — replaces the current pattern" once MIDI
  exists. Dialog test ids are prefixed `track-regenerate-confirm-*`.
- The voice-group panels' own group-header Generate button drives the anchor
  track directly and never passes through `TrackRow`; each now calls the hook
  itself (bass / arp / ensemble / pad), naming how many voices one press
  rewrites.

## 2.68.0 — Import Track reaches the stamping hook

`onTrackCreated` has always documented itself as running on "Add Track /
Import Track", but the cross-scene import path never called it: the shell's
`onImported` just reloaded. For plain families that was invisible. For a GROUP
family it is not — the host's copy brings every `track:<sourceDbId>:*` key
across with the values untouched, so the newborn still carries a group meta
naming the SOURCE scene's anchor. It joins a group that does not exist here,
or (as a non-anchor voice) resolves to an incomplete one and degrades to a
loose row.

- **`core.handleImportedTrack(handle)`** — the shell now wires it as the
  ImportTrackModal's `onImported`: run the family's `onTrackCreated`, then
  reload. Panels that hand the core straight to `GeneratorPanelShell` get it
  with no change.
- **`TrackCreatedContext.origin`** — `'add' | 'import' | 'port'`, so a family
  can stamp only the newborns that arrive carrying content. The bass panel
  anchors imports and ports as a voice-group of one while Add stays a plain
  row until the first generation; the arp panel ignores `origin` and keeps
  anchoring all three. Implementations that predate the field are unaffected.
- **`applyPortedTrackSound(handle, role, source)`** — the port flow now hands
  the adapter a `PortedTrackSource` (the source track's dbId + name), so a
  family whose instrument can host the source's patch may inherit it via
  `host.getTrackSound` instead of picking a fresh sound. The core stays
  policy-free: it passes the selector, the family decides, and nothing carries
  across unless an implementation asks. Bass is the first to take it up —
  ported parts keep a Surge patch and fall back to a shuffle for anything
  else. The third parameter is optional; two-parameter implementations
  (synth, drum, instrument, …) are unchanged.

## 2.67.0 — Forced re-freeze, for sound the app cannot see move

Freeze staleness is derived from what reaches the database. A third-party
instrument's patch edited in ITS OWN window (Massive X, Kontakt, Diva…) never
touches the database, so the freeze keeps claiming to be fresh while the stem
plays the previous sound — and a cached stem makes the next freeze "instant"
by re-using exactly that possibly-wrong render. This release adds the user's
"I know it changed" override.

- **`host.freezeTrack(trackId, { force: true })`** — renders a NEW stem even
  when the freeze hash is unchanged. The one-argument call is unchanged.
- **`useTrackFreeze().forceRefreeze`** — the hook's action for it, and
  `TrackFreezeSection`'s `onForceRefreeze` prop. Both are `undefined` on hosts
  that predate the option (detected via `freezeTrack.length`) rather than
  silently degrading to an ordinary cache-reusing freeze, so a panel can hide
  the control instead of lying about what it does.
- **`TrackFreezeSection`** renders the override exactly where the trap lives —
  a freeze that claims to be current, or a live track whose cached stem would
  make the next freeze instant — and learned two new staleness labels,
  `sound` ("sound changed") and `animate` ("animation changed").

## 2.66.0 — Alt-tracks: interchangeable alternatives that rotate, not stack

Until now every track in a scene played simultaneously. **Alt-tracks** name the
other case: n tracks that are interchangeable variants of ONE part — a second
Lead with a different preset — equally good, filling the same role, and never
meant to sound together. The host rotates a group round-robin (one member per
loop cycle on loop-a) and the arranger receives the grouping so it staggers
members across an arrangement instead of layering them.

Membership is **first-class host state**, not panel scene-data: it lives on the
track rows (host Migration 080) precisely so the arranger can consume it. That
makes this the one group family the panel does not parse — the shell owns both
the model and the rendering.

- **`PluginTrackHandle.altGroupId` / `.altGroupOrder`** — membership + rotation
  order (lowest plays first, and is the member a render bakes) on every handle
  from `getPluginTracks` / `adoptSceneTracks`.
- **`host.groupTrackAlternatives(trackIds)`** — group ≥2 OWNED tracks of the
  active scene. Creates a group, or extends when the inputs touch exactly one
  existing group; rejects inputs spanning two groups (`VALIDATION_ERROR` —
  ungroup first). v1 is same-panel only.
- **`host.removeTrackAlternative(trackId)`** — leave a group; a lone remaining
  member dissolves it (one alternative is not an alternative).
- **`host.setAltGroupPinned(groupId, pinned)` / `host.getAltGroupPinStates()`**
  — hold the current member while the FULL mix keeps playing. Distinct from
  solo, which also pauses rotation but isolates what you hear. Transient
  playback state: it resets on relaunch and never affects renders.
- **`features.altTracks`** opts a panel in. No parser or renderer required —
  the shell renders the stacked bracket (member rows, a ● on whoever is
  audible, pin, per-member remove) and `TrackAlternativesSection` in the FX
  drawer's tab. Inert on hosts without the surface.
- **`TrackAlternativesSection`** is exported for direct use; `altGroupsFromTracks`
  / `altGroupCandidates` are the pure helpers behind it.

The ● is derived from runtime mute state rather than local state, so it tracks
what is actually sounding even when rotation advances from outside the panel.

Also fixes a long-standing drift: `PLUGIN_SDK_VERSION` had been stuck at
`2.55.0` while the package version moved on. Both now read 2.66.0.

First consumer is the Synth panel (`@signalsandsorcery/synth-generator`).

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
