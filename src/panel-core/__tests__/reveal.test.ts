/**
 * Agent auto-reveal, the panel's half (SDK 3.20.0).
 *
 * The host finds a row by the data attributes TrackRow renders, then sends a
 * PluginRevealRequest; panel-core maps it to its own track (findRevealTrackId)
 * and opens the drawer tab. The SDK's node-env jest can't mount the hook, so
 * this pins the two pieces it composes: the row's DOM hooks (server-rendered)
 * and the request → track mapping.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrackRow, type SDKTrackRowProps } from '../../components/TrackRow';
import { findRevealTrackId } from '../reveal';

const rowProps = (track: SDKTrackRowProps['track']): SDKTrackRowProps => ({
  track,
  runtimeState: { muted: false, solo: false, volume: 0.8, pan: 0 },
  drawerOpen: false,
  drawerTab: 'fx',
  onMuteToggle: () => undefined,
  onSoloToggle: () => undefined,
  onVolumeChange: () => undefined,
  onPanChange: () => undefined,
});

describe('TrackRow reveal hooks', () => {
  // Server rendering warns that TrackRow's useLayoutEffect can't run; that
  // is expected here (only the markup matters) — keep every other error loud.
  let errorSpy: jest.SpyInstance;
  beforeAll(() => {
    const original = console.error;
    errorSpy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (String(args[0]).includes('useLayoutEffect does nothing on the server')) return;
      original(...args);
    });
  });
  afterAll(() => errorSpy.mockRestore());

  it('renders the engine id, DB id and role on the row wrapper', () => {
    const html = renderToStaticMarkup(
      React.createElement(TrackRow, rowProps({ id: 'eng-1', name: 'Bass', role: 'bass', dbId: 'db-uuid-1' })),
    );
    expect(html).toMatch(/data-testid="sdk-track-row-wrapper"[^>]*data-track-id="eng-1"/);
    expect(html).toContain('data-track-db-id="db-uuid-1"');
    expect(html).toContain('data-track-role="bass"');
  });

  it('omits the DB id and role attributes when the caller has none', () => {
    const html = renderToStaticMarkup(React.createElement(TrackRow, rowProps({ id: 'eng-2', name: 'Pad' })));
    expect(html).toContain('data-track-id="eng-2"');
    expect(html).not.toContain('data-track-db-id');
    expect(html).not.toContain('data-track-role');
  });
});

describe('findRevealTrackId', () => {
  const tracks = [
    { handle: { id: 'eng-1', dbId: 'db-1' } },
    { handle: { id: 'eng-2', dbId: 'db-2' } },
  ];

  it('matches by engine id', () => {
    expect(findRevealTrackId(tracks, { trackId: 'eng-2' })).toBe('eng-2');
  });

  it('matches by DB id and returns the engine id panel state is keyed on', () => {
    expect(findRevealTrackId(tracks, { trackDbId: 'db-1' })).toBe('eng-1');
  });

  it('prefers the engine id, falling back to the DB id when the engine id is not ours', () => {
    expect(findRevealTrackId(tracks, { trackId: 'eng-1', trackDbId: 'db-2' })).toBe('eng-1');
    expect(findRevealTrackId(tracks, { trackId: 'eng-9', trackDbId: 'db-2' })).toBe('eng-2');
  });

  it('returns null for a track this panel does not own, or an empty request', () => {
    expect(findRevealTrackId(tracks, { trackId: 'eng-9', trackDbId: 'db-9' })).toBeNull();
    expect(findRevealTrackId(tracks, {})).toBeNull();
    expect(findRevealTrackId([], { trackId: 'eng-1' })).toBeNull();
  });
});
