import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { actionIcons } from '../constants';
import { useI18n } from '../i18n';

type Tone = 'normal' | 'danger';

export type ConfirmDialogProps = {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * A small centered confirm modal, portalled to <body>. A styled, focusable
 * replacement for window.confirm: Escape and a backdrop click cancel, focus
 * starts on the non-destructive button and returns to the trigger on close,
 * and the page does not scroll underneath. The action is supplied by the caller
 * via onConfirm, so the call site only has to open the dialog.
 */
export function ConfirmDialog({
  message,
  title,
  confirmLabel,
  cancelLabel,
  tone = 'normal',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Keep the latest handlers without re-running the mount effect (and so
  // without re-grabbing focus) when the parent re-renders while we are open.
  const latest = useRef({ onConfirm, onCancel });
  latest.current = { onConfirm, onCancel };

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') latest.current.onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  const confirm = () => latest.current.onConfirm();
  const cancel = () => latest.current.onCancel();

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-label={title ?? message}>
        {title && <h3 className="modal__title">{title}</h3>}
        <p className="modal__message">{message}</p>
        <div className="modal__actions">
          <button className="btn btn--sm btn--ghost" ref={cancelRef} onClick={cancel}
            title={cancelLabel ?? t('common.cancel')} aria-label={cancelLabel ?? t('common.cancel')}>
            {actionIcons.cancel}
          </button>
          <button
            className={`btn btn--sm${tone === 'danger' ? ' btn--danger' : ''}`}
            onClick={confirm}
            title={confirmLabel ?? t('common.confirm')} aria-label={confirmLabel ?? t('common.confirm')}
          >
            {actionIcons.save}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
