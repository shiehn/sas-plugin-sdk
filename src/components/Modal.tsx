/**
 * Modal — the SDK's one modal-stacking primitive (portal + z-tier + backdrop).
 *
 * Every SDK modal renders INSIDE a plugin's accordion section, whose animated
 * `overflow-hidden` + `transition-all` wrapper establishes a stacking context.
 * An inline `position: fixed` overlay is therefore scoped to that section and
 * can be painted UNDER a neighbouring panel (the "import modal invisible on a
 * later open" bug). This component solves that once: it portals the overlay to
 * <body> — out of every panel's stacking context — at a z-tier above all the
 * app's `z-50` dropdowns/banners but below the toast tier (`z-[9999]`), so
 * toasts still float over modals.
 *
 * Controlled: the caller owns `open` and `onClose`. The caller renders its own
 * dialog box as `children` (keep the box's `onClick={e => e.stopPropagation()}`
 * so inside-clicks don't dismiss). Escape and a backdrop click both close.
 *
 * @since SDK 2.21.0
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface ModalProps {
  /** Controls visibility (the caller owns open/closed). */
  open: boolean;
  /** Close handler — fired on Escape and backdrop click. */
  onClose: () => void;
  /** The dialog box. Give it `onClick={e => e.stopPropagation()}`. */
  children: React.ReactNode;
  /** data-testid prefix; the backdrop is `${testIdPrefix}-overlay`. */
  testIdPrefix?: string;
  /** Close when the backdrop is clicked (default true). */
  closeOnBackdrop?: boolean;
  /** Close on Escape (default true). */
  closeOnEscape?: boolean;
  /** Focused when the modal opens (e.g. a Cancel button) so a reflexive Enter is safe. */
  initialFocusRef?: React.RefObject<HTMLElement>;
}

export function Modal({
  open,
  onClose,
  children,
  testIdPrefix = 'modal',
  closeOnBackdrop = true,
  closeOnEscape = true,
  initialFocusRef,
}: ModalProps): React.ReactElement | null {
  // Escape closes; focus the requested element on open.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (closeOnEscape && e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    initialFocusRef?.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, closeOnEscape, initialFocusRef]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60"
      data-testid={`${testIdPrefix}-overlay`}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      {children}
    </div>,
    document.body,
  );
}

export default Modal;
