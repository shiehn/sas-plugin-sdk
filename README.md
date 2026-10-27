# @signalsandsorcery/plugin-sdk

Plugin SDK for building custom generator plugins for [Signals & Sorcery](https://signalsandsorcery.com) — an AI-powered music production workstation.

<p align="center">
  <img src="assets/signals-and-sorcery.png" alt="Signals & Sorcery" width="420" />
</p>

> Part of the **[Signals & Sorcery](https://signalsandsorcery.com)** ecosystem.

Plugins extend the Loop Workstation with custom input generators that create MIDI patterns, manage audio samples, generate AI audio textures, or combine all three. Each plugin gets its own accordion section in the workstation UI and a scoped `PluginHost` API for interacting with tracks, MIDI, audio, and more.

## Installation

```bash
npm install @signalsandsorcery/plugin-sdk
```

## Documentation

Full documentation is available at [signalsandsorcery.com/plugin-sdk](https://signalsandsorcery.com/plugin-sdk/):

- [Getting Started](https://signalsandsorcery.com/plugin-sdk/getting-started.html) — Directory structure, manifest, installation, debugging
- [API Reference](https://signalsandsorcery.com/plugin-sdk/api-reference.html) — Complete PluginHost API with type signatures and examples
- [Tutorial: Euclidean Rhythm Generator](https://signalsandsorcery.com/plugin-sdk/tutorial.html) — Build a working plugin from scratch

## Reference Plugins

These built-in plugins serve as reference implementations:

| Plugin | Type | Description | Source |
|--------|------|-------------|--------|
| Synth Generator | `midi` | AI-powered MIDI generation with Surge XT presets | [sas-synth-plugin](https://github.com/shiehn/sas-synth-plugin) |
| Loops | `sample` | Audio loop / sample library browser with time-stretching | [sas-loops-plugin](https://github.com/shiehn/sas-loops-plugin) |
| Stems | `audio` | AI audio-from-text generation with optional stem splitting | [sas-stems-plugin](https://github.com/shiehn/sas-stems-plugin) |

## What's in the SDK

### Types

The core plugin contract — everything you need to implement a generator plugin:

```typescript
import type {
  GeneratorPlugin,    // Interface your plugin class implements
  PluginHost,         // Scoped API surface (tracks, MIDI, audio, LLM, etc.)
  PluginUIProps,      // Props passed to your React component
  PluginManifest,     // plugin.json schema
  MusicalContext,     // Key, mode, BPM, bars, chords
  MidiClipData,       // MIDI clip payload
  PluginMidiNote,     // Individual MIDI note
  PluginTrackHandle,  // Track identity returned by createTrack()
  PluginError,        // Typed error class with error codes
} from '@signalsandsorcery/plugin-sdk';
```

### UI Components

Pre-built components that match the host app's visual style:

| Component | Description |
|-----------|-------------|
| `TrackRow` | Full-featured track row with prompt input, generate/shuffle/copy buttons, mute/solo, volume/pan, FX drawer, instrument drawer, and progress overlay |
| `VolumeSlider` | Compact horizontal volume slider (0-1) with dB tooltip |
| `PanSlider` | Compact horizontal pan slider (-1 to +1) with double-click to center |
| `SorceryProgressBar` | Animated progress bar with time-based pacing for long operations |
| `InstrumentDrawer` | Searchable grid of available VST3/AU instrument plugins |
| `DownloadPackButton` | Download/verify/extract button for a sample pack; driven through `host.startSamplePackDownload` + `host.onSamplePackProgress` (since 2.8.0) |
| `SamplePackCTACard` | Empty-state card a generator panel renders when its sample pack is missing or stale; wraps `DownloadPackButton` (since 2.8.0) |

**Waveform / audio-clip toolkit** *(since 2.10.0)* — shared by audio-oriented plugins (stems, recorder):

| Export | Kind | Description |
|--------|------|-------------|
| `WaveformView` | component | Static waveform render of an audio file (decodes + draws peaks) |
| `ScrollingWaveform` | component | Live scrolling waveform for input monitoring / recording |
| `LevelMeter` | component | Peak/RMS level meter |
| `OffsetScrubber` | component | Drag-to-offset clip start with beat tick marks + snap |
| `computePeaks` / `drawWaveform` | util | Peak math + canvas drawing (`WaveformPeaks`) |
| `analyzeWavPeak` | util | Peak analysis of a WAV (`PeakAnalysis`) |
| `synthesizeCuePoints` | util | Derive cue points from a clip (`SynthesizeCuePointsOptions`) |

```typescript
import {
  TrackRow, VolumeSlider, PanSlider, SorceryProgressBar,
  SamplePackCTACard, DownloadPackButton,
} from '@signalsandsorcery/plugin-sdk';

// SamplePackCTACard / DownloadPackButton take the `host` the plugin received
// and drive the download entirely through PluginHost — a plugin never reaches
// the app's renderer or window.electronAPI to manage its sample pack.
<SamplePackCTACard
  host={host}
  pack={{ packId: 'sas-drum-pack', displayName: 'Drum Sample Library', description: 'Kicks, snares, hats', sizeBytes: 100_934_888 }}
  status={packStatus}            // 'missing' | 'stale' | 'checking'
  onDownloadComplete={refresh}   // re-check pack status when the download finishes
/>
```

### Hooks

```typescript
import { useSceneState } from '@signalsandsorcery/plugin-sdk';

// Maintains separate state per scene — preserved across scene switches
const [prompts, setPrompts, setPromptsForScene] = useSceneState(activeSceneId, {});
```

### Constants

```typescript
import {
  PLUGIN_SDK_VERSION,      // current API version — see src/constants/sdk-version.ts
  FX_CATEGORIES,           // ['eq', 'compressor', 'chorus', 'phaser', 'delay', 'reverb']
  FX_PRESET_CONFIGS,       // Preset definitions for all 6 FX categories
} from '@signalsandsorcery/plugin-sdk';
```

> **Instrument roles are not a static export.** `VALID_INSTRUMENT_ROLES` was
> removed in SDK 2.0.0 — call `host.getValidRoles()` at runtime instead. The
> canonical role list lives in the host app, so plugins always see the current set.

## Quick Start

### 1. Create the manifest (`plugin.json`)

```json
{
  "id": "@my-org/my-plugin",
  "displayName": "My Plugin",
  "version": "1.0.0",
  "description": "A custom generator plugin",
  "generatorType": "midi",
  "main": "index.js",
  "minHostVersion": "1.0.0",
  "capabilities": {
    "requiresLLM": true,
    "requiresSurgeXT": true
  }
}
```

Generator types: `midi` | `audio` | `sample` | `hybrid`

### 2. Implement the plugin class

```typescript
import type { GeneratorPlugin, PluginHost, PluginUIProps, PluginSettingsSchema, MusicalContext } from '@signalsandsorcery/plugin-sdk';
import { MyPanel } from './components/Panel';

export class MyPlugin implements GeneratorPlugin {
  readonly id = '@my-org/my-plugin';
  readonly displayName = 'My Plugin';
  readonly version = '1.0.0';
  readonly description = 'A custom generator plugin';
  readonly generatorType = 'midi' as const;

  private host: PluginHost | null = null;

  async activate(host: PluginHost): Promise<void> {
    this.host = host;
  }

  async deactivate(): Promise<void> {
    this.host = null;
  }

  getUIComponent() {
    return MyPanel;
  }

  getSettingsSchema(): PluginSettingsSchema | null {
    return null;
  }

  // Optional lifecycle hooks
  async onSceneChanged(sceneId: string | null): Promise<void> { }
  onContextChanged(context: MusicalContext): void { }
}
```

### 3. Build the UI

```tsx
import type { PluginUIProps } from '@signalsandsorcery/plugin-sdk';

export function MyPanel({ host, activeSceneId, isAuthenticated, isConnected }: PluginUIProps) {
  const handleGenerate = async () => {
    if (!activeSceneId) {
      host.showToast('warning', 'No Scene', 'Select a scene first');
      return;
    }

    // Create a track
    const track = await host.createTrack({ name: 'My Track', role: 'lead', loadSynth: true });

    // Get musical context
    const context = await host.getMusicalContext();

    // Write MIDI
    await host.writeMidiClip(track.id, {
      startTime: 0,
      endTime: (context.bars * 4 * 60) / context.bpm,
      tempo: context.bpm,
      notes: [
        { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 },
        { pitch: 64, startBeat: 1, durationBeats: 1, velocity: 90 },
        { pitch: 67, startBeat: 2, durationBeats: 1, velocity: 85 },
        { pitch: 72, startBeat: 3, durationBeats: 1, velocity: 100 },
      ],
    });

    host.showToast('success', 'Done', 'Pattern generated');
  };

  return (
    <div>
      <button onClick={handleGenerate} disabled={!isConnected}>
        Generate
      </button>
    </div>
  );
}
```

### 4. Install the plugin

Place the compiled plugin in:

```
~/.signals-and-sorcery/plugins/my-plugin/
  plugin.json
  index.js
  ...
```

Restart Signals & Sorcery. The plugin appears in the workstation accordion.

## PluginHost API Overview

All methods are available on the `host` object your plugin receives in `activate()` and via `PluginUIProps.host`. Methods marked with **ownership** can only modify tracks the calling plugin created.

### Track Management
| Method | Description |
|--------|-------------|
| `createTrack(options)` | Create a track with name, role, synth, instrument |
| `deleteTrack(trackId)` | Delete an owned track |
| `getPluginTracks()` | List all tracks this plugin owns in the active scene |
| `getTrackInfo(trackId)` | Detailed track state (mute, volume, pan, plugins) |
| `adoptSceneTracks()` | Re-claim unowned tracks matching generator type |
| `setTrackMute/Volume/Pan/Solo/Name` | Track property setters |
| `shufflePreset(trackId)` | Randomize Surge XT preset (keeps MIDI) |
| `duplicateTrack(trackId)` | Clone track with MIDI + new preset |

### MIDI Operations
| Method | Description |
|--------|-------------|
| `writeMidiClip(trackId, clip)` | Write MIDI notes (replaces existing) |
| `clearMidi(trackId)` | Clear all MIDI from a track |
| `postProcessMidi(notes, options)` | Quantize, swing, scale enforcement, humanization |
| `auditionNote(trackId, pitch, velocity, durationMs)` | Preview a single note |

### Audio Operations
| Method | Description |
|--------|-------------|
| `writeAudioClip(trackId, filePath, position?)` | Place audio file on track |
| `generateAudioTexture(request)` | AI audio generation from text prompt |

### Plugin/Synth Operations
| Method | Description |
|--------|-------------|
| `loadSynthPlugin(trackId, pluginName)` | Load VST3/AU plugin |
| `setPluginState/getPluginState` | Save/restore base64-encoded preset data |
| `getTrackPlugins(trackId)` | List loaded plugins |
| `getAvailableInstruments()` | Get scanned VST3/AU instruments |
| `setTrackInstrument(trackId, pluginId)` | Change instrument (preserves MIDI) |

### FX Operations
Six categories in signal chain order: `eq` > `compressor` > `chorus` > `phaser` > `delay` > `reverb`

| Method | Description |
|--------|-------------|
| `getTrackFxState(trackId)` | Get enabled/preset/dryWet per category |
| `toggleTrackFx(trackId, category, enabled)` | Enable/disable FX category |
| `setTrackFxPreset(trackId, category, presetIndex)` | Set FX preset (0-4) |
| `setTrackFxDryWet(trackId, category, value)` | Set dry/wet mix (0.0-1.0) |

### Scene Context
| Method | Description |
|--------|-------------|
| `getGenerationContext(excludeTrackId?)` | Full context + concurrent track MIDI data |
| `getMusicalContext()` | Key, mode, BPM, bars, genre, chords |
| `getActiveSceneId()` | Current scene ID (synchronous) |
| `getSceneList()` | All scenes in the project |
| `getArrangementOutline?()` | *(3.23.0, optional)* The song order: sections in play order (`sceneId`, `sceneName`, `label?`, `role?`, `startBar`, `bars`, `occurrence`, `instanceId`) plus `pickupBars?`; `null` with no arrangement. Bars are song bars, the first section's downbeat = 1. Helpers: `hasArrangementOutline`, `sectionsOfScene`, `formatSongOrder` |

### Song Lyrics *(since SDK 3.24.0; all optional, feature-check with `hasSongLyrics`)*
The song's words belong to the arrangement. The host keeps one **song lyric document** per
arrangement: a section of words per placement, keyed by the outline's `instanceId`, plus the song's
description. The arrangement row's Lyrics tab, the agent and vocal plugins all read and write that one copy.

| Method | Description |
|--------|-------------|
| `getSongLyrics?()` | The document `{ version: 1, arrangementId, description, sections: { [instanceId]: SongLyricsSection }, spare, updatedAt }`; `null` with no arrangement or nothing written |
| `setSectionLyrics?(instanceId, patch)` | Write one section; present fields change, `null` clears: `lines`, `locks`, `hints`, `role`, `sameAs`, `take`, `renderedSig`, `voiceTrackDbId` |
| `setSongDescription?(text)` | The song's one description (`''` clears) |
| `onSongLyricsChanged?(listener)` | `(doc, change?) => void` after any writer; `doc` is `null` when the project changes to one without a document; returns unsubscribe |

- A section is `{ sceneId, voiceTrackDbId, role?, lines, locks, hints, sameAs?, take?, renderedSig?, writtenAt? }`:
  one line per sung phrase. `role` is free text (`SongRole`; `SONG_ROLE_SUGGESTIONS` lists the common
  forms) read by the model from the section's label and position. Code never derives it from a word list.
- `sameAs` makes a section repeat another placement **of the same scene** (a chorus): its `lines`
  mirror that section, a rewrite reaches every repeat, and writing its own `lines` needs `sameAs: null`
  in the same patch.
- `voiceTrackDbId` claims a section for your vocal reading. It must be a track you own, and a
  section another plugin's track sings is not yours to write (`NOT_OWNED`).
- After a render, store `take` and `renderedSig: songLinesSignature(linesYouSang)`;
  `isSectionTakeStale(doc, instanceId)` then tells anyone (the Lyrics tab too) that the take is stale.
- Refusals reject with `PluginError` `VALIDATION_ERROR` and `details.reason`
  (`SONG_LYRICS_WRITE_FAILURES`), or `NOT_OWNED`. Caps: `SONG_LYRICS_LIMITS` (64 lines × 300
  characters per section, the latest 40 hints kept, a 2000-character description).

```typescript
import { hasSongLyrics, hasArrangementOutline, songLyricsInOrder, songLinesSignature } from '@signalsandsorcery/plugin-sdk';

if (hasSongLyrics(host) && hasArrangementOutline(host)) {
  const song = songLyricsInOrder(await host.getArrangementOutline(), await host.getSongLyrics());
  for (const { section, lines } of song.filter((s) => s.section.sceneId === mySceneId)) {
    show(section.label ?? section.sceneName, lines);
  }
  await host.setSectionLyrics(instanceId, { lines: newLines, voiceTrackDbId: myVocalTrackDbId });
  // …after Sing:
  await host.setSectionLyrics(instanceId, { take: 1, renderedSig: songLinesSignature(newLines) });
  const off = host.onSongLyricsChanged((doc) => rerender(doc));
}
```

The pure rules (`applySongLyricsPatch`, `applySongDescription`, `resolveSectionLines`) and the
document types are also importable without React from `@signalsandsorcery/plugin-sdk/song-lyrics`.
The host runs the same rules. For tests, `createSongLyricsTestHost({ outline, ownedTrackDbIds,
otherTrackOwners })` is an in-memory host with the same behaviour.

### Track Onsets *(since SDK 3.24.0; optional, feature-check with `hasTrackOnsets`)*
Where another track's hits land, measured from its **audio**: the groove a MIDI read can't see, like the
backbeat of a drum loop. Read-only and not ownership-gated: any track of the project, by DB id.

| Method | Description |
|--------|-------------|
| `readTrackOnsets?(trackDbId, { maxCount? })` | `{ source: 'audio', sampleRate, durationSec, bpm, onsets: [{ timeSec, beat, strength }], truncated }` for one pass of the track's scene loop, as heard; `null` with no project, an unknown track, or nothing to measure |
| `listSceneAudioTracks?()` | The active scene's sample and audio tracks, `[{ dbId, name, kind: 'sample' \| 'audio', pluginId?, category?, tags?, description? }]`, which `listSceneTracks()` (MIDI tracks only) leaves out. Feature-check with `hasSceneAudioTracks` |

- Time starts at the scene's first downbeat; `beat` is quarter-notes at `bpm`. The host has already
  applied the clip's offset and stretch, so `beat` lines up with your MIDI.
- `strength` is relative (0..1, the loudest hit of the reading is 1): it compares hits within one
  track, not across tracks.
- Onsets come in time order. Past `maxCount` (default 512, at most `TRACK_ONSETS_LIMITS.maxCount` =
  4096) the weakest are dropped and `truncated` is `true`. A silent track reads as `onsets: []`.
- One hit can give more than one onset. Synth kicks, for example, give a secondary onset about
  0.25 beat after each hit (the body or tail) at a lower strength. Weight onsets by `strength` and
  merge near-duplicates before you count hits.
- Readings are cached until the track's sound changes, and a fresh freeze stem is read without a
  render. Any other uncached read bounces the track. When it can't bounce now, it takes no lock and
  rejects with `PluginError` `ENGINE_ERROR` and `details: { retryable: true, reason }`. That
  means busy, not broken. `reason` is a `TrackOnsetsBusyReason` (`TRACK_ONSETS_BUSY_REASONS`):
  - `'TRANSPORT_PLAYING'`: retry once the transport stops.
  - `'TRANSITION_RENDER_IN_PROGRESS'`: retry once the other render finishes.
  Key on `retryable` in general and on `reason` for when to retry. Or go on without that track.

```typescript
import { hasTrackOnsets, hasSceneAudioTracks } from '@signalsandsorcery/plugin-sdk';

if (hasTrackOnsets(host)) {
  // Every track in the scene: MIDI tracks, plus loops and audio (a drum loop has no MIDI).
  const midi = (await host.listSceneTracks?.()) ?? [];
  const audio = hasSceneAudioTracks(host) ? await host.listSceneAudioTracks() : [];
  for (const track of [...midi, ...audio]) {
    const reading = await host.readTrackOnsets(track.dbId);
    if (!reading) continue;
    // e.g. how hard each beat of a 4/4 bar is hit
    const perBeat = [0, 0, 0, 0];
    for (const o of reading.onsets) perBeat[Math.round(o.beat) % 4] += o.strength;
  }
}
```

Hosts turn a detector's output into the reading with `finishTrackOnsets(raw, opts)`, also importable
without React from `@signalsandsorcery/plugin-sdk/track-onsets`.

### Sample Packs *(status methods since SDK 2.7.0; download/progress since 2.8.0)*
Versioned sample packs (drums, instruments, the loop/sample library) install on demand under `<userData>/samples/`. A plugin checks install state to decide between its normal UI and a "download library" CTA, then drives the download **through the host** — never `window.electronAPI`.

| Method | Description |
|--------|-------------|
| `getSamplePackRoot(packId)` | Absolute path to the installed pack root, or null if missing/stale |
| `isSamplePackCurrent(packId)` | True iff the installed version matches this build's expected version |
| `getSamplePackInstalledVersion(packId)` | Installed version string, or null if not installed |
| `startSamplePackDownload(packId)` | Trigger download + install; resolves `{ success, error? }` |
| `onSamplePackProgress(packId, listener)` | Subscribe to `{ status, progress }` updates; returns an unsubscribe fn |

### Plugin State *(raw state since SDK 2.15.0; apply verdict since 3.22.0)*
| Method | Description |
|--------|-------------|
| `setPluginState/getPluginState` | A plugin's state through Tracktion's ValueTree (Surge XT) |
| `setRawPluginState/getRawPluginState` | A third-party plugin's own raw state (Kontakt, Diva, Serum…); a write only acknowledges receipt |
| `awaitStateApplied?(trackId, { pluginIndex?, timeoutMs? })` | *(optional, since 3.22.0)* Did the plugin actually load the last state it was given? `verified`, `not_applied` (`STATE_NOT_APPLIED`), `timeout` (default 45 s) or `unsupported`; the engine decides ~20 s after the write. Feature-detect it |

### Sample Library Files
| Method | Description |
|--------|-------------|
| `listAudioFiles(rootPath, { extensions?, recursive? })` | Absolute paths of the audio files under a root |
| `readTextFile(absolutePath)` | A UTF-8 file's contents, or null on any error |
| `scanInstrumentLibrary?(root, { refresh? })` | *(optional, since SDK 3.21.0)* The instrument pack's whole scan in one call, cached by the host: flat instruments with their prompts, and each manifest folder's trimmed `manifest.json`. Feature-detect it; fall back to `listAudioFiles` + `readTextFile` |

### Deck Playback *(since SDK 2.9.0)*
The two playback decks: `'loop-a'` (composition / cue, headphones) and `'loop-b'` (performance / main). These route through the **same host path the workstation UI uses**, so the deck mutual-exclusivity rules (the host's PlaybackRuleEngine) are enforced identically — a plugin can't bypass them. Used by playback-driven plugins (e.g. the recorder, which starts loop-a so a take has a backing loop). Available to renderer-hosted plugins.

| Method | Description |
|--------|-------------|
| `deckPlay(deckId, contentId?, contentType?)` | Start a deck playing a scene/transition (`contentType` defaults to `'scene'`); resolves `{ success, error?, code? }` |
| `deckStop(deckId)` | Stop a deck; resolves `{ success, error? }` |
| `onDeckStateChanged(listener)` | Subscribe to `{ deckId, property, value }` (e.g. `property: 'playing'`); returns an unsubscribe fn |
| `onAllDecksStopped(listener)` | Subscribe to the global "all decks stopped" event; returns an unsubscribe fn |

### Transport & Events
| Method | Description |
|--------|-------------|
| `onTrackStateChange(listener)` | Real-time mute, solo, volume, pan updates |
| `onTransportEvent(listener)` | Play, stop, BPM change, position |
| `onDeckBoundary(listener)` | Loop boundary events (bar, beat, loopCount) |
| `onSceneChange(listener)` | Scene selection changes |
| `onEngineReady(listener)` | Engine finished loading tracks |
| `getTransportState()` | Current playback state snapshot |

### LLM Access
| Method | Description |
|--------|-------------|
| `generateWithLLM(request)` | Generate text/JSON (metered, requires auth) |
| `isLLMAvailable()` | Check auth + gateway reachability |

### Preset System
| Method | Description |
|--------|-------------|
| `getPresetCategories(pluginName)` | Available Surge XT categories |
| `getRandomPreset(category)` | Random preset from category |
| `getPresetByName(category, name)` | Specific preset lookup |
| `classifyPresetCategory(description)` | LLM-based text-to-category |

### Scene Composition
| Method | Description |
|--------|-------------|
| `composeScene(options)` | Bulk LLM arrangement generation |
| `onComposeProgress(listener)` | Progress events (planning, generating, complete) |

### Data Persistence
| Method | Description |
|--------|-------------|
| `getSceneData/setSceneData/getAllSceneData/deleteSceneData` | Per-scene key-value storage |
| `getProjectData/setProjectData` | Project-wide storage |
| `settings.get/set/getAll/onChange` | Global settings (cross-project) |
| `getDataDirectory()` | Plugin's isolated data directory path |

### Plugin Presets
| Method | Description |
|--------|-------------|
| `getPluginPresets(category?)` | Get saved presets for this plugin |
| `savePluginPreset(options)` | Save a preset (name, category, data) |
| `deletePluginPreset(id)` | Delete a preset |

### File System & Network
| Method | Description |
|--------|-------------|
| `showOpenDialog/showSaveDialog` | Native file dialogs (requires `fileDialog` capability) |
| `downloadFile/importFile` | Download/copy files to plugin data directory |
| `httpRequest(options)` | HTTP requests (requires `network` capability with `allowedHosts`) |
| `fetchUrlText?(req)` | *(3.23.0, optional)* Read a page or document the USER linked as readable text (see below; requires `urlText` capability, plus the user's consent per origin) |

#### Text from a link *(since SDK 3.23.0)*

For lore, notes or a story the user keeps on the web: `host.fetchUrlText({ url, maxChars?, purpose })`
resolves `{ ok, reason?, detail?, status?, text?, title?, finalUrl?, contentType?, truncated? }` and
never rejects for a failed fetch. Declare `"capabilities": { "urlText": true }`; the host then asks
the user once per plugin and origin (showing your `purpose` line) and remembers the answer.

- One GET, no cookies or credentials, no headers or body from the plugin; `https:` (or `http:`,
  consented separately and marked unencrypted). Loopback and private-network addresses are refused
  (`blocked-address`), redirects (at most 5) re-checked, each new origin consented.
- 2 MB of body, 20 s overall; HTML reduced to its readable text with `<title>` as `title`; a Google
  Docs link (`docs.google.com/document/d/<id>/…`) read as its plain-text export, so it must be shared
  "anyone with the link"; `text` capped at `min(maxChars, 200 000)` with `truncated: true`.
- Reasons: `capability-denied`, `invalid-url`, `unsupported-scheme`, `blocked-address`, `denied`,
  `too-many-redirects`, `timeout`, `network`, `http-error` (with `status`), `not-text`, `too-large`
  (`URL_TEXT_FAILURE_REASONS`).

```typescript
import { hasUrlText, describeUrlTextFailure } from '@signalsandsorcery/plugin-sdk';

if (hasUrlText(host)) {
  const r = await host.fetchUrlText({ url, maxChars: 20_000, purpose: 'Use this page as the lyric context' });
  if (r.ok) saveLore(r.text ?? '');
  else showNote(describeUrlTextFailure(r, url));
}
```

Helpers: `URL_TEXT_LIMITS`, `clampUrlTextChars`, `googleDocsExportUrl`, `isUrlTextContentType` and
`htmlToReadableText`, also importable without React from `@signalsandsorcery/plugin-sdk/url-text`
(the host uses them). For an API your plugin calls, use `httpRequest` with `allowedHosts` instead.

### Secure Storage
| Method | Description |
|--------|-------------|
| `storeSecret/getSecret/deleteSecret` | OS keychain encryption, per-plugin scoped |

### Sample Library
| Method | Description |
|--------|-------------|
| `getSamples/getSampleById` | Query sample library |
| `importSamples(filePaths)` | Import audio files |
| `createSampleTrack/deleteSampleTrack` | Manage sample tracks |
| `getPluginSampleTracks()` | List owned sample tracks |
| `timeStretchSample(sampleId, targetBpm)` | Time-stretch to target BPM |

### Notifications & Progress
| Method | Description |
|--------|-------------|
| `showToast(type, title, message?)` | Toast notification (info/success/warning/error) |
| `setProgress(trackId, progress)` | Track progress bar (0-100, -1 to hide) |
| `setStatusMessage(message)` | Accordion header status text |
| `confirmAction(title, message)` | Confirmation dialog |

## Error Codes

All errors are `PluginError` instances with a typed `code` property:

| Code | Description |
|------|-------------|
| `NOT_OWNED` | Tried to modify a track not owned by this plugin |
| `TRACK_NOT_FOUND` | Track ID doesn't exist in engine |
| `TRACK_LIMIT_EXCEEDED` | Plugin has too many tracks (default: 16 per scene) |
| `NO_ACTIVE_SCENE` | No scene is selected |
| `ENGINE_ERROR` | Audio engine call failed |
| `INVALID_MIDI` | Malformed MIDI data |
| `FILE_NOT_FOUND` | Referenced file doesn't exist |
| `INVALID_FORMAT` | Unsupported audio format |
| `PLUGIN_NOT_FOUND` | VST/AU plugin not installed |
| `LLM_BUDGET_EXCEEDED` | Over daily token limit |
| `LLM_UNAVAILABLE` | LLM gateway unreachable |
| `NOT_AUTHENTICATED` | User not logged in |
| `TIMEOUT` | Operation timed out |
| `CANCELLED` | User cancelled the operation |
| `INCOMPATIBLE` | Plugin requires newer SDK version |
| `CAPABILITY_DENIED` | Plugin lacks required capability in manifest |
| `SECRET_NOT_FOUND` | Secret key doesn't exist |

## Security Model

- **Ownership scoping** — Plugins can only modify tracks they created (enforced at runtime)
- **Capability gating** — Network and file system access require manifest declarations
- **Consent per origin** — `fetchUrlText` reads only links the user allows, per plugin and origin, never from local or private-network addresses
- **Song lyrics by reading** — a plugin claims a song section only with a vocal track it owns, and can't rewrite a section another plugin's track sings
- **Secret isolation** — Each plugin's secrets are encrypted and scoped per plugin
- **Track limits** — 16 tracks per plugin per scene (configurable)

## The Signals & Sorcery Ecosystem

- **[Signals & Sorcery](https://signalsandsorcery.com)** — the flagship AI music production workstation
- **[sas-synth-plugin](https://github.com/shiehn/sas-synth-plugin)** — AI MIDI generation with Surge XT
- **[sas-loops-plugin](https://github.com/shiehn/sas-loops-plugin)** — Audio loop / sample library browser with time-stretching
- **[sas-stems-plugin](https://github.com/shiehn/sas-stems-plugin)** — AI audio-from-text generation with stem splitting
- **[DeclarAgent](https://github.com/shiehn/DeclarAgent)** — Declarative agent + MCP transport for S&S

<p align="center">
  <a href="https://signalsandsorcery.com">signalsandsorcery.com</a>
</p>

## License

MIT
