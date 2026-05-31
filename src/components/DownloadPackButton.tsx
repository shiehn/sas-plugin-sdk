/**
 * DownloadPackButton — versioned-pack download trigger (SDK component).
 *
 * Parameterized by `packId`; drives the download through the host
 * (`host.startSamplePackDownload` / `host.onSamplePackProgress`) so plugins
 * never reach into the app's IPC (`window.electronAPI`). Two display variants:
 *   - 'compact' (default) — small uppercase button for panel headers
 *   - 'large'             — bigger CTA used inside SamplePackCTACard
 *
 * @since SDK 2.8.0 (moved from the app and refactored onto PluginHost).
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { PluginHost } from '../types/plugin-sdk.types';

export type DownloadPackButtonVariant = 'compact' | 'large';

type PackDownloadStatus =
  | 'idle'
  | 'downloading'
  | 'verifying'
  | 'extracting'
  | 'installing'
  | 'complete'
  | 'error';

export interface DownloadPackButtonProps {
  /** Host the plugin received; drives the download + progress. */
  host: PluginHost;
  packId: string;
  /** Pack display name, e.g. 'Drum Sample Library'. Used in tooltips/labels. */
  displayName: string;
  /** Bundle size in bytes (shown in the large-variant label). */
  sizeBytes?: number;
  variant?: DownloadPackButtonVariant;
  /** Called once after the install completes (status === 'complete'). */
  onDownloadComplete?: () => void;
}

// Base-1024 (GiB/MiB) to match the host's own SamplePackDownloader formatter and
// the `_pack-version.json` / sample-packs.ts size comments (e.g. a 28.5e9-byte
// instrument bundle reads as "26.6 GB", not the decimal "28.5 GB").
function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${Math.round(mb)} MB`;
}

export const DownloadPackButton: React.FC<DownloadPackButtonProps> = ({
  host,
  packId,
  displayName,
  sizeBytes,
  variant = 'compact',
  onDownloadComplete,
}) => {
  const [status, setStatus] = useState<PackDownloadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = host.onSamplePackProgress(packId, (p) => {
      setStatus(p.status as PackDownloadStatus);
      setProgress(p.progress);
      if (p.status === 'error') {
        setErrorMessage(p.message || 'Download failed');
      } else if (p.status === 'complete') {
        setErrorMessage(null);
        setTimeout(() => onDownloadComplete?.(), 250);
      } else {
        setErrorMessage(null);
      }
    });
    return unsub;
  }, [host, packId, onDownloadComplete]);

  const handleClick = useCallback(async (): Promise<void> => {
    if (status !== 'idle' && status !== 'error') return;
    try {
      setStatus('downloading');
      setProgress(0);
      setErrorMessage(null);
      const result = await host.startSamplePackDownload(packId);
      if (!result.success) {
        setStatus('error');
        setErrorMessage(result.error || 'Download failed');
      }
    } catch (err) {
      console.error('[DownloadPackButton] start failed:', err);
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, [host, packId, status]);

  const isWorking =
    status === 'downloading' ||
    status === 'verifying' ||
    status === 'extracting' ||
    status === 'installing';
  const isDisabled = isWorking || status === 'complete';

  const buttonLabel = (() => {
    switch (status) {
      case 'downloading':
        return `${progress}%`;
      case 'verifying':
        return 'Verifying...';
      case 'extracting':
        return 'Extracting...';
      case 'installing':
        return 'Installing...';
      case 'complete':
        return 'Done!';
      case 'error':
        return 'Retry';
      default:
        return variant === 'large'
          ? `Download ${displayName}${sizeBytes ? ` (${formatSize(sizeBytes)})` : ''}`
          : 'Download';
    }
  })();

  const tooltip = (() => {
    if (status === 'error') return errorMessage || 'Download failed. Click to retry.';
    if (isWorking) return `${buttonLabel} — ${displayName}`;
    if (status === 'complete') return 'Installation complete';
    return `Download ${displayName}${sizeBytes ? ` (${formatSize(sizeBytes)})` : ''}`;
  })();

  const baseClasses =
    variant === 'large'
      ? 'px-4 py-2 text-sm font-medium rounded border transition-colors'
      : 'px-2 py-0.5 text-[10px] uppercase tracking-wide rounded-sm border transition-colors';

  let className: string;
  if (status === 'error') {
    className = `${baseClasses} text-red-400 border-red-400/50 hover:text-red-300 hover:border-red-300`;
  } else if (status === 'complete') {
    className = `${baseClasses} text-green-400 border-green-400/50`;
  } else if (isDisabled) {
    className = `${baseClasses} text-sas-accent border-sas-accent/50 cursor-wait`;
  } else {
    className = `${baseClasses} text-sas-muted hover:text-sas-accent border-sas-border hover:border-sas-accent`;
  }

  return (
    <div>
      <button
        data-testid={`download-pack-button-${packId}`}
        onClick={handleClick}
        disabled={isDisabled}
        className={className}
        title={tooltip}
      >
        {buttonLabel}
      </button>
      {variant === 'large' && status === 'error' && errorMessage && (
        <div className="text-xs text-sas-danger mt-2" data-testid={`download-pack-error-${packId}`}>
          {errorMessage}
        </div>
      )}
    </div>
  );
};

export default DownloadPackButton;
