/**
 * SamplePackCTACard — empty-state card a generator panel renders when its
 * sample pack is missing OR a newer version is available. Wraps
 * DownloadPackButton in a centered card. The completion callback should
 * re-fetch pack status on the parent so the card unmounts and the normal panel
 * UI takes over.
 *
 * @since SDK 2.8.0 (moved from the app; download driven through PluginHost).
 */

import React from 'react';
import type { PluginHost } from '../types/plugin-sdk.types';
import { DownloadPackButton } from './DownloadPackButton';

export type SamplePackCTACardStatus = 'missing' | 'stale' | 'checking';

/** Minimal pack info the card needs. A PackConfig is structurally compatible. */
export interface SamplePackCardInfo {
  packId: string;
  displayName: string;
  description: string;
  sizeBytes?: number;
}

export interface SamplePackCTACardProps {
  /** Host the plugin received; drives the download. */
  host: PluginHost;
  pack: SamplePackCardInfo;
  status: SamplePackCTACardStatus;
  onDownloadComplete?: () => void;
}

export const SamplePackCTACard: React.FC<SamplePackCTACardProps> = ({
  host,
  pack,
  status,
  onDownloadComplete,
}) => {
  if (status === 'checking') {
    return (
      <div
        data-testid={`sample-pack-cta-checking-${pack.packId}`}
        className="flex items-center justify-center py-16 text-sas-muted text-sm"
      >
        Checking sample library...
      </div>
    );
  }

  const headline =
    status === 'stale'
      ? `${pack.displayName} update available`
      : `${pack.displayName} not installed`;

  const sublabel =
    status === 'stale'
      ? `A newer version is available for download.`
      : pack.description;

  return (
    <div
      data-testid={`sample-pack-cta-${pack.packId}`}
      className="flex flex-col items-center justify-center py-12 px-6 text-center"
    >
      <div className="text-sm uppercase tracking-wide text-sas-muted mb-2">
        {status === 'stale' ? 'Update available' : 'Sample library not installed'}
      </div>
      <div className="text-base text-sas-text mb-1">{headline}</div>
      <div className="text-xs text-sas-muted mb-6 max-w-md">{sublabel}</div>
      <DownloadPackButton
        host={host}
        packId={pack.packId}
        displayName={pack.displayName}
        sizeBytes={pack.sizeBytes}
        variant="large"
        onDownloadComplete={onDownloadComplete}
      />
    </div>
  );
};

export default SamplePackCTACard;
