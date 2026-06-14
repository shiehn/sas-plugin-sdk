/**
 * ConfirmDialog — styled in-app confirmation modal (SDK component).
 *
 * A small, reusable "are you sure?" dialog matching the app's dark theme
 * (mirrors ImportTrackModal chrome: sas-panel / sas-border / shadow-xl). It
 * guards destructive actions; the first consumer is track deletion, which was
 * one stray click away from losing a track's MIDI + sound.
 *
 * Controlled component — the caller owns `open` and the confirm/cancel
 * handlers. Escape and a backdrop click both cancel, and the Cancel button is
 * auto-focused on open so a reflexive Enter dismisses rather than deletes.
 *
 * @since SDK 2.17.0
 */

import React, { useRef } from 'react';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  /** Controls visibility (the caller owns open/closed). */
  open: boolean;
  /** Bold heading line. */
  title: string;
  /** Body copy — a string or richer node. */
  message: React.ReactNode;
  /** Confirm button label (default "Delete"). */
  confirmLabel?: string;
  /** Cancel button label (default "Cancel"). */
  cancelLabel?: string;
  /** When true (default), the confirm button reads as a destructive (red) action. */
  destructive?: boolean;
  /** Fired when the user confirms. */
  onConfirm: () => void;
  /** Fired on Cancel, Escape, or backdrop click. */
  onCancel: () => void;
  /** data-testid prefix so each dialog is addressable in tests. */
  testIdPrefix?: string;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onCancel,
  testIdPrefix = 'confirm-dialog',
}: ConfirmDialogProps): React.ReactElement | null {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Escape, backdrop click, and focus-on-open are owned by the shared <Modal>.
  return (
    <Modal open={open} onClose={onCancel} testIdPrefix={testIdPrefix} initialFocusRef={cancelRef}>
      <div
        className="w-[360px] max-w-[90vw] flex flex-col rounded-md border border-sas-border bg-sas-panel shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={`${testIdPrefix}-modal`}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-sas-border">
          <span className="text-sm font-medium text-sas-text" data-testid={`${testIdPrefix}-title`}>
            {title}
          </span>
        </div>

        {/* Body */}
        <div
          className="px-4 py-3 text-xs text-sas-muted leading-relaxed break-words"
          data-testid={`${testIdPrefix}-message`}
        >
          {message}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-sas-border">
          <button
            ref={cancelRef}
            type="button"
            className="px-3 py-1 rounded-sm text-xs font-medium border border-sas-border bg-sas-panel-alt text-sas-text hover:border-sas-accent hover:text-sas-accent transition-colors"
            onClick={onCancel}
            data-testid={`${testIdPrefix}-cancel`}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`px-3 py-1 rounded-sm text-xs font-medium border transition-colors ${
              destructive
                ? 'border-sas-danger bg-sas-danger/20 text-sas-danger hover:bg-sas-danger hover:text-sas-bg'
                : 'border-sas-accent bg-sas-accent/20 text-sas-accent hover:bg-sas-accent hover:text-sas-bg'
            }`}
            onClick={onConfirm}
            data-testid={`${testIdPrefix}-confirm`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
