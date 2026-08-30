/**
 * copyTrackFxBestEffort — the shared best-effort FX-chain copy used by the
 * cross-panel port path (handlePortTrack) and transition layer creation.
 * Contract under test: dest + source forwarded verbatim; silent success when
 * everything copies; a warning toast NAMES the missing third-party plugins;
 * hosts without the method (pre-2.41) no-op; a throwing host is swallowed —
 * the newborn track must never be rolled back over FX.
 */

import { copyTrackFxBestEffort } from '../fx-copy';
import type { PluginHost, TrackFxCopyResult } from '../../types/plugin-sdk.types';

type FxHost = Pick<PluginHost, 'copyTrackFxFrom' | 'showToast'>;

function makeHost(copyImpl: jest.Mock): { host: FxHost; toast: jest.Mock } {
  const toast = jest.fn();
  const host = { copyTrackFxFrom: copyImpl, showToast: toast } as unknown as FxHost;
  return { host, toast };
}

const okResult = (missing: string[] = []): TrackFxCopyResult => ({
  builtIn: [],
  externalCopied: 2,
  externalMissing: missing,
});

describe('copyTrackFxBestEffort', () => {
  it('forwards dest + source to host.copyTrackFxFrom and stays silent on full success', async () => {
    const copy = jest.fn().mockResolvedValue(okResult());
    const { host, toast } = makeHost(copy);

    await copyTrackFxBestEffort(host, 'engine-track-9', 'db-row-42');

    expect(copy).toHaveBeenCalledTimes(1);
    expect(copy).toHaveBeenCalledWith('engine-track-9', 'db-row-42');
    expect(toast).not.toHaveBeenCalled();
  });

  it('warns with the missing plugin names on partial success (copy still counts)', async () => {
    const copy = jest.fn().mockResolvedValue(okResult(['Diva', 'Serum']));
    const { host, toast } = makeHost(copy);

    await copyTrackFxBestEffort(host, 't1', 's1');

    expect(toast).toHaveBeenCalledWith(
      'warning',
      'Some FX not copied',
      'Missing plugin(s): Diva, Serum',
    );
  });

  it('no-ops on a host without copyTrackFxFrom (pre-2.41)', async () => {
    const toast = jest.fn();
    const host = { showToast: toast } as unknown as FxHost;

    await expect(copyTrackFxBestEffort(host, 't1', 's1')).resolves.toBeUndefined();
    expect(toast).not.toHaveBeenCalled();
  });

  it('swallows a throwing host — never rejects, never toasts', async () => {
    const copy = jest.fn().mockRejectedValue(new Error('engine offline'));
    const { host, toast } = makeHost(copy);

    await expect(copyTrackFxBestEffort(host, 't1', 's1')).resolves.toBeUndefined();
    expect(toast).not.toHaveBeenCalled();
  });
});
