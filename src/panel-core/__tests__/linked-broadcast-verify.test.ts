/**
 * SDK 3.22.0 (S-276): the linked "→ All" broadcast waits for the engine's
 * verdict per part. A Kontakt patch sent to 5 voices could land on some and
 * silently miss others (S-273: v3–v5 kept an empty Kontakt and froze silent),
 * because a raw state write only acknowledges receipt and a read-back serves
 * the written state (engine S-139 L1.2). Contract under test:
 *   - applies stay one at a time; verdicts are awaited in PARALLEL;
 *   - 'not_applied' → re-applied ONCE (just the write), then FAILED and named
 *     in "… applied to some parts only — Skipped: <names>" (voice order);
 *   - other errors → failed, no retry; 'unknown' / a throwing verdict →
 *     applied (today's behaviour); no verifyTarget → exactly as before.
 * The adapter half maps host.awaitStateApplied's shapes onto those verdicts.
 */

import {
  runLinkedBroadcast,
  LINKED_APPLY_VERDICT_TIMEOUT_MS,
  type GroupBroadcastProgress,
  type LinkedApplyVerdict,
} from '../linked-broadcast';
import { createSurgeSoundAdapter } from '../surge-sound-adapter';
import { STATE_NOT_APPLIED, type PluginHost, type StateApplyVerdict } from '../../types/plugin-sdk.types';

type Target = { engineId: string; label?: string };
const VOICES: Target[] = [1, 2, 3, 4, 5].map((n) => ({ engineId: `t${n}`, label: `Voice ${n}` }));

/** Verdicts scripted per target, consumed in order (the retry reads the next one). */
function script(verdicts: Record<string, LinkedApplyVerdict[]>) {
  return jest.fn(async (t: Target): Promise<LinkedApplyVerdict> => verdicts[t.engineId]?.shift() ?? 'verified');
}

function run(over: Partial<Parameters<typeof runLinkedBroadcast<Target>>[0]> = {}) {
  const progress: Array<GroupBroadcastProgress | null> = [];
  const toast = jest.fn();
  const onTargetError = jest.fn();
  const applyToTarget = jest.fn(async (_t: Target) => {});
  const opts = {
    kind: 'sound' as const,
    label: 'Kontakt patch',
    targets: VOICES,
    applyToTarget,
    onProgress: (p: GroupBroadcastProgress | null) => progress.push(p),
    showToast: toast,
    onTargetError,
    ...over,
  };
  return { promise: runLinkedBroadcast<Target>(opts), progress, toast, onTargetError, applyToTarget: opts.applyToTarget };
}

describe('runLinkedBroadcast — per-part apply verdicts (SDK 3.22.0)', () => {
  it('without verifyTarget behaves exactly as before', async () => {
    const r = run();
    const res = await r.promise;

    expect(r.applyToTarget).toHaveBeenCalledTimes(5);
    expect(res.failed).toEqual([]);
    expect(res.appliedIds.size).toBe(5);
    expect(r.progress.some((p) => p?.phase === 'verifying')).toBe(false);
    expect(r.toast).toHaveBeenCalledWith('success', 'Linked sound applied to all parts', 'Kontakt patch → 5 parts');
  });

  it('all verified: one verdict per part, a verifying phase, the all-ok toast unchanged', async () => {
    const verifyTarget = script({});
    const r = run({ verifyTarget });
    const res = await r.promise;

    expect(verifyTarget).toHaveBeenCalledTimes(5);
    expect(res.failed).toEqual([]);
    expect(r.progress).toContainEqual({ kind: 'sound', label: 'Kontakt patch', total: 5, done: 5, phase: 'verifying' });
    expect(r.progress[r.progress.length - 1]).toBeNull();
    expect(r.toast).toHaveBeenCalledWith('success', 'Linked sound applied to all parts', 'Kontakt patch → 5 parts');
  });

  it('a part that ignored the state is re-applied ONCE (just the write) and then counts as applied', async () => {
    const reapplyTarget = jest.fn(async (_t: Target) => {});
    const r = run({ verifyTarget: script({ t3: ['not_applied', 'verified'] }), reapplyTarget });
    const res = await r.promise;

    expect(reapplyTarget).toHaveBeenCalledTimes(1);
    expect(reapplyTarget).toHaveBeenCalledWith(VOICES[2]);
    expect(r.applyToTarget).toHaveBeenCalledTimes(5); // the retry never repeats the full apply
    expect(res.appliedIds.has('t3')).toBe(true);
    expect(r.toast).toHaveBeenCalledWith('success', 'Linked sound applied to all parts', 'Kontakt patch → 5 parts');
  });

  it('still not applied after the retry → FAILED and named (the S-273 shape: v3–v5)', async () => {
    const reapplyTarget = jest.fn(async (_t: Target) => {});
    const r = run({
      verifyTarget: script({
        t3: ['not_applied', 'not_applied'],
        t4: ['not_applied', 'not_applied'],
        t5: ['not_applied', 'not_applied'],
      }),
      reapplyTarget,
    });
    const res = await r.promise;

    expect(reapplyTarget).toHaveBeenCalledTimes(3);
    expect(res.failed).toEqual(['Voice 3', 'Voice 4', 'Voice 5']);
    expect([...res.appliedIds]).toEqual(['t1', 't2']);
    expect(r.toast).toHaveBeenCalledWith(
      'warning',
      'Linked sound applied to some parts only',
      'Skipped: Voice 3, Voice 4, Voice 5',
    );
    expect(String((r.onTargetError.mock.calls[0][1] as Error).message)).toContain('STATE_NOT_APPLIED');
  });

  it('a plain apply error: failed and named, never verified, never retried', async () => {
    const verifyTarget = script({});
    const reapplyTarget = jest.fn(async (_t: Target) => {});
    const applyToTarget = jest.fn(async (t: Target) => {
      if (t.engineId === 't2') throw new Error('frozen sibling');
    });
    const r = run({ verifyTarget, reapplyTarget, applyToTarget });
    const res = await r.promise;

    expect(verifyTarget).not.toHaveBeenCalledWith(VOICES[1]);
    expect(reapplyTarget).not.toHaveBeenCalled();
    expect(res.failed).toEqual(['Voice 2']);
  });

  it("'unknown' (timeout / unsupported / old host) and a throwing verdict both count as applied", async () => {
    const verifyTarget = jest.fn(async (t: Target): Promise<LinkedApplyVerdict> => {
      if (t.engineId === 't1') throw new Error('host blew up');
      return 'unknown';
    });
    const reapplyTarget = jest.fn(async (_t: Target) => {});
    const r = run({ verifyTarget, reapplyTarget });
    const res = await r.promise;

    expect(reapplyTarget).not.toHaveBeenCalled();
    expect(res.failed).toEqual([]);
    expect(res.appliedIds.size).toBe(5);
  });

  it('applies one part at a time but awaits the verdicts in parallel', async () => {
    const order: string[] = [];
    const resolvers: Array<() => void> = [];
    const applyToTarget = jest.fn(async (t: Target) => {
      order.push(`apply ${t.engineId}`);
    });
    const verifyTarget = jest.fn(
      (t: Target) =>
        new Promise<LinkedApplyVerdict>((resolve) => {
          order.push(`verify ${t.engineId}`);
          resolvers.push(() => resolve('verified'));
        }),
    );
    const r = run({ applyToTarget, verifyTarget });
    // Let the apply loop run: no verdict has resolved, yet every part is applied.
    for (let i = 0; i < 50; i++) await Promise.resolve();
    expect(applyToTarget).toHaveBeenCalledTimes(5);
    expect(order.slice(0, 2)).toEqual(['apply t1', 'verify t1']);
    resolvers.forEach((resolve) => resolve());
    const res = await r.promise;
    expect(res.failed).toEqual([]);
  });

  it('names failures in voice order, whichever was detected first', async () => {
    const applyToTarget = jest.fn(async (t: Target) => {
      if (t.engineId === 't4') throw new Error('refused');
    });
    const r = run({
      applyToTarget,
      verifyTarget: script({ t2: ['not_applied', 'not_applied'] }),
      reapplyTarget: jest.fn(async (_t: Target) => {}),
    });
    const res = await r.promise;

    expect(res.failed).toEqual(['Voice 2', 'Voice 4']);
  });

  it('a re-apply that throws counts the part as failed', async () => {
    const r = run({
      verifyTarget: script({ t1: ['not_applied'] }),
      reapplyTarget: jest.fn(async () => {
        throw new Error('engine gone');
      }),
    });
    const res = await r.promise;

    expect(res.failed).toEqual(['Voice 1']);
  });
});

describe('verdict timeout: a late real miss is still honoured (S-276, measured on the engine)', () => {
  // A host that honours timeoutMs the way sas-app's does: the engine's verdict
  // for this part arrives at 40 s (a part judged late in a long serial "→ All":
  // ≈ 0.55 s × N + 20 s), unless the caller gave up first → 'timeout'.
  function slowHost() {
    const awaitStateApplied = jest.fn(
      (_trackId: string, opts?: { pluginIndex?: number; timeoutMs?: number }) =>
        new Promise<StateApplyVerdict>((resolve) => {
          const limit = opts?.timeoutMs ?? 45_000;
          if (limit >= 40_000) {
            setTimeout(() => resolve({ status: 'not_applied', errorCode: STATE_NOT_APPLIED }), 40_000);
          } else {
            setTimeout(() => resolve({ status: 'timeout' }), limit);
          }
        }),
    );
    const host = {
      getTrackPlugins: jest.fn(async () => [{ index: 0, name: 'Kontakt 8' }]),
      awaitStateApplied,
    } as unknown as PluginHost;
    return { adapter: createSurgeSoundAdapter(host), awaitStateApplied };
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('the broadcast waits LINKED_APPLY_VERDICT_TIMEOUT_MS (45 s), so a 40 s not_applied fails the part', async () => {
    const { adapter, awaitStateApplied } = slowHost();
    const target = { engineId: 't15', label: 'Voice 15' };
    const toast = jest.fn();
    // Wired exactly as useGeneratorPanelCore wires it.
    const promise = runLinkedBroadcast<Target>({
      kind: 'sound',
      label: 'Kontakt patch',
      targets: [target],
      applyToTarget: async () => {},
      reapplyTarget: async () => {},
      verifyTarget: (t) => adapter.awaitSoundApplied!(t.engineId, { timeoutMs: LINKED_APPLY_VERDICT_TIMEOUT_MS }),
      onProgress: () => {},
      showToast: toast,
    });
    await jest.advanceTimersByTimeAsync(40_000); // first verdict: not_applied → re-apply
    await jest.advanceTimersByTimeAsync(40_000); // second verdict: still not_applied
    const res = await promise;

    expect(LINKED_APPLY_VERDICT_TIMEOUT_MS).toBe(45_000);
    expect(awaitStateApplied).toHaveBeenCalledWith('t15', { pluginIndex: 0, timeoutMs: 45_000 });
    expect(res.failed).toEqual(['Voice 15']);
    expect(toast).toHaveBeenCalledWith('warning', 'Linked sound applied to some parts only', 'Skipped: Voice 15');
  });

  it('the old 30 s budget would have read the same miss as timeout (unknown → counted as applied)', async () => {
    const { adapter } = slowHost();
    const pending = adapter.awaitSoundApplied!('t15', { timeoutMs: 30_000 });
    await jest.advanceTimersByTimeAsync(30_000);
    expect(await pending).toBe('unknown');
  });
});

describe('createSurgeSoundAdapter().awaitSoundApplied (host.awaitStateApplied shapes)', () => {
  function adapterWith(awaitStateApplied?: jest.Mock, plugins = [{ index: 0, name: 'Kontakt 8' }]) {
    const host = {
      getTrackPlugins: jest.fn(async () => plugins),
      ...(awaitStateApplied ? { awaitStateApplied } : {}),
    } as unknown as PluginHost;
    return createSurgeSoundAdapter(host);
  }
  const verdict = (v: StateApplyVerdict) => jest.fn(async () => v);

  it('maps verified / not_applied, asking about the instrument slot', async () => {
    const ok = verdict({ status: 'verified' });
    expect(await adapterWith(ok).awaitSoundApplied!('t1')).toBe('verified');
    expect(ok).toHaveBeenCalledWith('t1', { pluginIndex: 0 });

    const ignored = verdict({ status: 'not_applied', errorCode: STATE_NOT_APPLIED, appliedBytes: 2105407, liveBytes: 6045 });
    expect(await adapterWith(ignored).awaitSoundApplied!('t3')).toBe('not_applied');
  });

  it("timeout / unsupported / a host without the method / a throw / no instrument → 'unknown'", async () => {
    expect(await adapterWith(verdict({ status: 'timeout' })).awaitSoundApplied!('t1')).toBe('unknown');
    expect(await adapterWith(verdict({ status: 'unsupported' })).awaitSoundApplied!('t1')).toBe('unknown');
    expect(await adapterWith(undefined).awaitSoundApplied!('t1')).toBe('unknown');
    const throws = jest.fn(async () => {
      throw new Error('x');
    });
    expect(await adapterWith(throws).awaitSoundApplied!('t1')).toBe('unknown');
    expect(await adapterWith(verdict({ status: 'verified' }), []).awaitSoundApplied!('t1')).toBe('unknown');
  });

  it('forwards the caller timeout to the host', async () => {
    const ok = verdict({ status: 'verified' });
    await adapterWith(ok).awaitSoundApplied!('t1', { timeoutMs: 45_000 });
    expect(ok).toHaveBeenCalledWith('t1', { pluginIndex: 0, timeoutMs: 45_000 });
  });

  it('types the verdict (compile-time)', () => {
    const failed: StateApplyVerdict = { status: 'not_applied', errorCode: 'STATE_NOT_APPLIED' };
    // @ts-expect-error a not_applied verdict carries the engine's code
    const bare: StateApplyVerdict = { status: 'not_applied' };
    // @ts-expect-error only the four statuses exist
    const other: StateApplyVerdict = { status: 'pending' };
    expect([failed, bare, other]).toHaveLength(3);
  });
});
