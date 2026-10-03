import type {
  InstrumentLibraryFolderEntry,
  InstrumentLibraryScan,
  InstrumentManifestFields,
  PluginHost,
} from '../index';
import { PLUGIN_SDK_VERSION } from '../index';

/**
 * SDK 3.21.0: `host.scanInstrumentLibrary` — the instrument pack's walk and
 * manifest reads done (and cached) by the host in one call. Optional and
 * feature-detected; a pre-3.21.0 host only has `listAudioFiles` +
 * `readTextFile`. The type-level lines below (`@ts-expect-error`) are
 * enforced by `npm run typecheck` (tsc covers src/__tests__); jest here does
 * not report type diagnostics.
 */

type FsHost = Pick<PluginHost, 'listAudioFiles' | 'readTextFile' | 'scanInstrumentLibrary'>;

const ROOT = '/samples/instruments';

const MANIFEST: InstrumentManifestFields = {
  schema_version: 1,
  instrument_id: 'warm-pluck',
  category_display: 'Plucks',
  open_ended: false,
  prompt: 'a warm nylon pluck',
  zones: [{ sample: 'zones/c4.wav', root_midi: 60, min_midi: 0, max_midi: 127 }],
};

const SCAN: InstrumentLibraryScan = {
  root: ROOT,
  version: '3.0.2',
  flat: [{ categoryId: 'keys', filename: 'rhodes.wav', prompt: 'an electric piano\n' }],
  folders: [
    { categoryId: 'plucks', subdir: 'warm-pluck', manifest: MANIFEST },
    { categoryId: 'plucks', subdir: 'broken', manifest: null, error: 'Unexpected token } in JSON' },
  ],
};

/** A 3.21.0+ host: one call, cached per root until `refresh`. */
function makeHost(): FsHost & { scans: number } {
  let cached: InstrumentLibraryScan | null = null;
  const host = {
    scans: 0,
    async listAudioFiles(): Promise<string[]> {
      throw new Error('a 3.21.0 host is never walked file by file');
    },
    async readTextFile(): Promise<string | null> {
      throw new Error('a 3.21.0 host is never read file by file');
    },
    async scanInstrumentLibrary(root: string, opts?: { refresh?: boolean }): Promise<InstrumentLibraryScan> {
      if (!cached || opts?.refresh) {
        host.scans++;
        cached = { ...SCAN, root };
      }
      return cached;
    },
  };
  return host;
}

/** A pre-3.21.0 host: no scan method; the plugin walks and reads itself. */
function makeLegacyHost(): FsHost {
  const files: Record<string, string> = {
    [`${ROOT}/keys/rhodes.txt`]: 'an electric piano\n',
    [`${ROOT}/plucks/warm-pluck/manifest.json`]: JSON.stringify({ ...MANIFEST, extra_field: 'trimmed by a host' }),
    [`${ROOT}/plucks/broken/manifest.json`]: '{ "schema_version": 1, }',
  };
  return {
    async listAudioFiles(): Promise<string[]> {
      return [
        `${ROOT}/keys/rhodes.wav`,
        `${ROOT}/plucks/warm-pluck/zones/c4.wav`,
        `${ROOT}/plucks/broken/zones/x.wav`,
        `${ROOT}/_failures/keys/bad.wav`,
        `${ROOT}/stray.wav`,
      ];
    },
    async readTextFile(p: string): Promise<string | null> {
      return files[p] ?? null;
    },
  };
}

/** The consumer pattern: feature-detect the host scan, else the old walk, into ONE shape. */
async function scanLibrary(host: FsHost, root: string): Promise<{ via: 'host' | 'walk'; scan: InstrumentLibraryScan }> {
  if (typeof host.scanInstrumentLibrary === 'function') {
    return { via: 'host', scan: await host.scanInstrumentLibrary(root) };
  }
  const paths = await host.listAudioFiles(root, { extensions: ['.wav', '.flac'], recursive: true });
  const flat: InstrumentLibraryScan['flat'] = [];
  const folderKeys = new Set<string>();
  for (const p of paths) {
    const segments = p.slice(root.length + 1).split('/').filter(Boolean);
    if (segments.length < 2 || segments.some((s) => s.startsWith('_'))) continue;
    if (segments.length === 2) {
      const prompt = await host.readTextFile(`${root}/${segments[0]}/${segments[1].replace(/\.(wav|flac)$/i, '')}.txt`);
      flat.push({ categoryId: segments[0], filename: segments[1], prompt });
    } else {
      folderKeys.add(`${segments[0]}/${segments[1]}`);
    }
  }
  const folders: InstrumentLibraryFolderEntry[] = [];
  for (const key of folderKeys) {
    const [categoryId, subdir] = key.split('/');
    const raw = await host.readTextFile(`${root}/${key}/manifest.json`);
    if (raw === null) {
      folders.push({ categoryId, subdir, manifest: null, error: 'no readable manifest.json' });
      continue;
    }
    try {
      const m = JSON.parse(raw) as InstrumentManifestFields;
      const { schema_version, instrument_id, category_display, open_ended, prompt, zones } = m;
      folders.push({ categoryId, subdir, manifest: { schema_version, instrument_id, category_display, open_ended, prompt, zones } });
    } catch (err) {
      folders.push({ categoryId, subdir, manifest: null, error: (err as Error).message });
    }
  }
  return { via: 'walk', scan: { root, version: '3.0.2', flat, folders } };
}

describe('scanInstrumentLibrary (SDK 3.21.0)', () => {
  it('uses the host scan when the host has it — one call, no per-file reads', async () => {
    const host = makeHost();
    const out = await scanLibrary(host, ROOT);

    expect(out.via).toBe('host');
    expect(out.scan.flat).toHaveLength(1);
    expect(out.scan.folders.map((f) => f.subdir)).toEqual(['warm-pluck', 'broken']);
    expect(host.scans).toBe(1);
  });

  it('is cached per root until refresh', async () => {
    const host = makeHost();
    await host.scanInstrumentLibrary?.(ROOT);
    await host.scanInstrumentLibrary?.(ROOT);
    expect(host.scans).toBe(1);

    await host.scanInstrumentLibrary?.(ROOT, { refresh: true });
    expect(host.scans).toBe(2);
  });

  it('falls back to the walk on an older host and yields the same shape', async () => {
    const legacy = await scanLibrary(makeLegacyHost(), ROOT);
    const scanned = await scanLibrary(makeHost(), ROOT);

    expect(legacy.via).toBe('walk');
    // _-prefixed and 1-segment paths are skipped; the broken manifest is null + an error.
    expect(legacy.scan.flat).toEqual(scanned.scan.flat);
    expect(legacy.scan.folders.map((f) => [f.subdir, f.manifest])).toEqual(
      scanned.scan.folders.map((f) => [f.subdir, f.manifest]),
    );
    expect(legacy.scan.folders[1].error).toEqual(expect.any(String));
  });

  it('types every field (compile-time)', () => {
    // A minimal manifest: category_display / open_ended are optional.
    const minimal: InstrumentManifestFields = {
      schema_version: 1,
      instrument_id: 'x',
      prompt: '',
      zones: [],
    };
    // @ts-expect-error zones use the manifest's snake_case (root_midi), not the sampler's rootKey
    const camel: InstrumentManifestFields = { ...minimal, zones: [{ sample: 'a.wav', rootKey: 60, min_midi: 0, max_midi: 127 }] };
    // @ts-expect-error a flat entry's prompt is string | null, never undefined
    const noPrompt: InstrumentLibraryScan['flat'][number] = { categoryId: 'keys', filename: 'a.wav' };
    // A folder whose manifest failed: null + an optional error.
    const failed: InstrumentLibraryFolderEntry = { categoryId: 'plucks', subdir: 'b', manifest: null };
    // The method is optional: a host without it is still a valid FsHost.
    const legacy: FsHost = makeLegacyHost();

    expect([minimal, camel, noPrompt, failed, legacy]).toHaveLength(5);
  });
});

describe('SDK version constant', () => {
  it('is 3.21.0 or later', () => {
    const [major, minor] = PLUGIN_SDK_VERSION.split('.').map(Number);
    expect(major > 3 || (major === 3 && minor >= 21)).toBe(true);
  });
});
