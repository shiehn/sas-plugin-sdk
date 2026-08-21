/**
 * useRegenerateGuard — confirm before a generate OVERWRITES existing MIDI.
 *
 * "Create" is the same button before and after a track has MIDI: the first
 * press composes, every later press silently replaces the pattern (and any
 * piano-roll edits) with a fresh LLM take. There is no undo. This hook makes
 * the second case ask first, and leaves the first case untouched — a track
 * with nothing to lose still generates on a single click.
 *
 * Used by the SDK {@link TrackRow} (so every panel that renders a row gets it
 * for free) and by the voice-group panels' own group-header Generate button,
 * which drives the anchor track directly and never passes through TrackRow.
 *
 * ```tsx
 * const regen = useRegenerateGuard({ hasMidi, onGenerate, subject: 'The bassline' });
 * <button onClick={regen.request}>Generate</button>
 * {regen.dialog}
 * ```
 *
 * @since SDK 2.69.0
 */

import React, { useCallback, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';

export interface UseRegenerateGuardOptions {
  /**
   * True when the target already holds generated MIDI — the ONLY case that
   * warns. False (nothing to lose) generates immediately.
   */
  hasMidi: boolean;
  /** The generate action. Omitted (no generate affordance) = the guard is inert. */
  onGenerate?: () => void;
  /** What gets overwritten, e.g. a track name or "The bassline". Default "This track". */
  subject?: string;
  /** Extra sentence for families where one Generate rewrites several tracks. */
  detail?: string;
  /** data-testid prefix for the dialog. */
  testIdPrefix?: string;
  /**
   * Override the dialog title (@since SDK 3.9.0). The default speaks of MIDI
   * and piano-roll edits, which is wrong for panels whose artifact is
   * something else — an audio reading, a rendered texture.
   */
  title?: string;
  /** Override the dialog body (@since SDK 3.9.0). `detail` still appends. */
  message?: React.ReactNode;
}

export interface RegenerateGuard {
  /** Call INSTEAD of the generate handler: opens the dialog, or generates now. */
  request: () => void;
  /** True while the confirmation is showing. */
  open: boolean;
  /** Render alongside the button (self-hides when closed). */
  dialog: React.ReactElement | null;
}

export function useRegenerateGuard({
  hasMidi,
  onGenerate,
  subject,
  detail,
  testIdPrefix = 'regenerate-confirm',
  title,
  message,
}: UseRegenerateGuardOptions): RegenerateGuard {
  const [open, setOpen] = useState(false);

  const request = useCallback((): void => {
    if (!onGenerate) return;
    // Nothing generated yet — no warning to give.
    if (!hasMidi) {
      onGenerate();
      return;
    }
    setOpen(true);
  }, [hasMidi, onGenerate]);

  const label = subject?.trim() || 'This track';

  const dialog = (
    <ConfirmDialog
      open={open}
      title={title ?? 'Replace existing MIDI?'}
      message={
        <>
          {message ?? (
            <>
              <span className="text-sas-text">{label}</span> already has MIDI. Generating
              again replaces it — the current pattern and any piano-roll edits are lost.
            </>
          )}
          {detail ? <> {detail}</> : null}
        </>
      }
      confirmLabel="Regenerate"
      onConfirm={() => {
        setOpen(false);
        onGenerate?.();
      }}
      onCancel={() => setOpen(false)}
      testIdPrefix={testIdPrefix}
    />
  );

  return { request, open, dialog };
}

export default useRegenerateGuard;
