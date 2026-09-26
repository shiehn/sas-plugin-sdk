import * as fs from 'fs';
import * as path from 'path';
import type {
  PluginHost,
  PluginImportedSample,
  PluginSampleImportResult,
  PluginSampleInfo,
} from '../index';
import { PLUGIN_SDK_VERSION } from '../index';

/**
 * SDK 3.18.0: importSamples reports WHICH library samples it produced
 * (`samples`), so a plugin can place what it just imported. The type-level
 * lines below (`@ts-expect-error`) are enforced by `npm run typecheck` (tsc
 * covers src/__tests__); jest here does not report type diagnostics.
 */

type ImportOnlyHost = Pick<PluginHost, 'importSamples'>;

/** A 3.18.0+ host: per-file results, a duplicate counted in `imported`. */
function makeHost(): ImportOnlyHost {
  return {
    async importSamples(filePaths: string[]): Promise<PluginSampleImportResult> {
      const samples: PluginImportedSample[] = [];
      let skipped = 0;
      for (const p of filePaths) {
        if (p.endsWith('.txt')) {
          skipped++;
          continue;
        }
        samples.push({
          id: `sample-${path.basename(p)}`,
          sourcePath: p,
          duplicate: p.includes('already'),
        });
      }
      return { imported: samples.length, skipped, errors: [], samples };
    },
  };
}

/** A pre-3.18.0 host: counts only. Must still satisfy the type. */
function makeLegacyHost(): ImportOnlyHost {
  return {
    async importSamples(filePaths: string[]): Promise<PluginSampleImportResult> {
      return { imported: filePaths.length, skipped: 0, errors: [] };
    },
  };
}

/** The consumer pattern plugins should use: feature-detect, then split new vs existing. */
async function importAndSplit(host: ImportOnlyHost, files: string[]) {
  const result = await host.importSamples(files);
  if (result.samples === undefined) return { supported: false as const, result };
  return {
    supported: true as const,
    result,
    fresh: result.samples.filter((s) => !s.duplicate).map((s) => s.id),
    existing: result.samples.filter((s) => s.duplicate).map((s) => s.id),
  };
}

describe('importSamples per-file results (SDK 3.18.0)', () => {
  it('returns one entry per resolved file, in input order, with the caller path', async () => {
    const files = ['/loops/a_94bpm.wav', '/notes.txt', '/loops/already_b.wav'];
    const result = await makeHost().importSamples(files);

    expect(result.samples?.map((s) => s.sourcePath)).toEqual([
      '/loops/a_94bpm.wav',
      '/loops/already_b.wav',
    ]);
    expect(result.skipped).toBe(1);
  });

  it('keeps counting duplicates in `imported`; `duplicate` tells them apart', async () => {
    const out = await importAndSplit(makeHost(), ['/loops/new.wav', '/loops/already.wav']);

    expect(out.supported).toBe(true);
    if (!out.supported) return;
    expect(out.result.imported).toBe(2);
    expect(out.fresh).toEqual(['sample-new.wav']);
    expect(out.existing).toEqual(['sample-already.wav']);
  });

  it('leaves `samples` absent on an older host so callers can fall back', async () => {
    const out = await importAndSplit(makeLegacyHost(), ['/loops/x.wav']);

    expect(out.supported).toBe(false);
    expect(out.result.imported).toBe(1);
    expect('samples' in out.result).toBe(false);
  });

  it('types every field (compile-time)', () => {
    const ok: PluginImportedSample = { id: 's1', sourcePath: '/a.wav', duplicate: false };
    // @ts-expect-error `duplicate` is required
    const missing: PluginImportedSample = { id: 's1', sourcePath: '/a.wav' };
    // @ts-expect-error `duplicate` is a boolean
    const wrong: PluginImportedSample = { id: 's1', sourcePath: '/a.wav', duplicate: 'no' };
    // A counts-only result is still a valid PluginSampleImportResult (additive field).
    const legacy: PluginSampleImportResult = { imported: 0, skipped: 0, errors: [] };

    expect([ok, missing, wrong, legacy]).toHaveLength(4);
  });
});

/** A library row as a pre-3.18.0 host returns it: no `importedAt`, no `origin`. */
function legacySample(id: string): PluginSampleInfo {
  return {
    id,
    filename: `${id}.wav`,
    filePath: `/library/${id}.wav`,
    category: null,
    bpm: null,
    keyTonic: null,
    keyMode: null,
    durationSeconds: null,
    fileSizeBytes: null,
    tags: null,
  };
}

/** A 3.18.0+ library row. */
function sample(
  id: string,
  origin: 'import' | 'pack',
  importedAt: string,
): PluginSampleInfo {
  return { ...legacySample(id), origin, importedAt };
}

/**
 * The consumer pattern for a "Recently imported" section: user imports only,
 * inside the window, newest first. An empty result means "hide the section".
 */
function recentlyImported(
  samples: PluginSampleInfo[],
  now: number,
  windowMs: number,
): PluginSampleInfo[] {
  return samples
    .filter((s) => s.origin === 'import' && s.importedAt !== undefined)
    .map((s) => ({ s, t: Date.parse(s.importedAt as string) }))
    .filter(({ t }) => Number.isFinite(t) && now - t <= windowMs)
    .sort((a, b) => b.t - a.t)
    .map(({ s }) => s);
}

describe('PluginSampleInfo importedAt / origin (SDK 3.18.0)', () => {
  const now = Date.parse('2026-09-26T18:00:00.000Z');
  const day = 24 * 60 * 60 * 1000;

  it('lists user imports newest first and keeps a fresh pack out', () => {
    const library = [
      sample('older-import', 'import', '2026-09-26T09:00:00.000Z'),
      sample('pack-kick', 'pack', '2026-09-26T17:59:00.000Z'),
      sample('exb-flow', 'import', '2026-09-26T17:55:00.000Z'),
      sample('last-month', 'import', '2026-08-20T12:00:00.000Z'),
    ];

    expect(recentlyImported(library, now, day).map((s) => s.id)).toEqual([
      'exb-flow',
      'older-import',
    ]);
  });

  it('shows nothing on an older host (fields absent), so the section hides', () => {
    const library = [legacySample('a'), legacySample('b')];

    expect(library.every((s) => !('importedAt' in s) && !('origin' in s))).toBe(true);
    expect(recentlyImported(library, now, day)).toEqual([]);
  });

  it('types both fields (compile-time)', () => {
    const imported: PluginSampleInfo = sample('s1', 'import', '2026-09-26T18:00:00.000Z');
    // Additive: a row without either field is still a valid PluginSampleInfo.
    const legacy: PluginSampleInfo = legacySample('s2');
    // @ts-expect-error `origin` is 'import' | 'pack' only
    const badOrigin: PluginSampleInfo = { ...legacySample('s3'), origin: 'upload' };
    // @ts-expect-error `importedAt` is an ISO-8601 string, not epoch ms
    const badTime: PluginSampleInfo = { ...legacySample('s4'), importedAt: 1790000000000 };

    expect([imported, legacy, badOrigin, badTime]).toHaveLength(4);
  });
});

describe('SDK version constant', () => {
  it('is 3.18.0 or later and agrees with package.json on major.minor', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
    ) as { version: string };
    const majorMinor = (v: string) => v.split('.').slice(0, 2).join('.');

    // CI bumps only package.json's PATCH on publish, so compare major.minor.
    expect(majorMinor(PLUGIN_SDK_VERSION)).toBe(majorMinor(pkg.version));
    const [major, minor] = PLUGIN_SDK_VERSION.split('.').map(Number);
    expect(major > 3 || (major === 3 && minor >= 18)).toBe(true);
  });
});
