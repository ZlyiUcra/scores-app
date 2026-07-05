import { useState } from 'react';
import type { ConfirmDialogProps } from '../components/ConfirmDialog';

/** What a caller passes to open the dialog: the full ConfirmDialog props minus
 * `onCancel` (the hook owns closing). */
type ConfirmRequest = Omit<ConfirmDialogProps, 'onCancel'>;

/**
 * Pending-state for one ConfirmDialog, packaged as a hook so any component can
 * gate an action behind a confirm without hand-rolling the open/close state.
 * `request({ ..., onConfirm })` opens the dialog; the dialog auto-closes after
 * either button is clicked. Only one confirm is active at a time.
 */
export function useConfirmDialog(): {
  request: (opts: ConfirmRequest) => void;
  dialog: ConfirmDialogProps | null;
} {
  const [pending, setPending] = useState<ConfirmRequest | null>(null);
  const request = (opts: ConfirmRequest) => setPending(opts);
  const dialog: ConfirmDialogProps | null = pending
    ? {
        ...pending,
        onConfirm: () => {
          pending.onConfirm();
          setPending(null);
        },
        onCancel: () => setPending(null),
      }
    : null;
  return { request, dialog };
}
