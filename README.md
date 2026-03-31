# @signalsandsorcery/plugin-sdk

Plugin SDK for building custom generator plugins for [Signals & Sorcery](https://signalsandsorcery.com) — an AI-powered music production workstation.

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
| Sample Player | `sample` | Sample library browser with time-stretching | [sas-sample-plugin](https://github.com/shiehn/sas-sample-plugin) |
| Audio Texture | `audio` | AI audio texture generation | [sas-audio-plugin](https://github.com/shiehn/sas-audio-plugin) |

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
| `FxToggleBar` | Per-track FX control panel with 6 categories, 5 presets each, and dry/wet sliders |
| `SorceryProgressBar` | Animated progress bar with time-based pacing for long operations |
| `InstrumentDrawer` | Searchable grid of available VST3/AU instrument plugins |

```typescript
import { TrackRow, VolumeSlider, PanSlider, FxToggleBar, SorceryProgressBar } from '@signalsandsorcery/plugin-sdk';
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
  VALID_INSTRUMENT_ROLES,  // ['bass', 'kick', 'snare', 'lead', 'pad', ...]
  PLUGIN_SDK_VERSION,      // '1.0.0'
  FX_CATEGORIES,           // ['eq', 'compressor', 'chorus', 'phaser', 'delay', 'reverb']
  FX_PRESET_CONFIGS,       // Preset definitions for all 6 FX categories
} from '@signalsandsorcery/plugin-sdk';
```

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
- **Secret isolation** — Each plugin's secrets are encrypted and scoped per plugin
- **Track limits** — 16 tracks per plugin per scene (configurable)

## License

MIT
