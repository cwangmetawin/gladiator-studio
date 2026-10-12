import { useId } from 'react';
import { useDialogFocus } from '@/shared/hooks/useDialogFocus';

interface ConfirmDialogProps {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly danger?: boolean;
  readonly busy?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** A themed confirmation popup — replaces native window.confirm/alert. */
export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useDialogFocus<HTMLDivElement>({ onEscape: () => { if (!busy) onCancel(); } });
  return (
    <div className="modal-bg" onClick={() => { if (!busy) onCancel(); }}>
      <div ref={dialogRef} className="card modal" style={{ maxWidth: 430 }} onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
        <h3 id={titleId}>{title}</h3>
        <p id={descriptionId} style={{ color: 'var(--a-dim)', margin: '0 0 20px', lineHeight: 1.55 }}>{message}</p>
        <div className="modal__foot">
          <button className="btn btn--ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={danger ? 'btn btn--danger' : 'btn btn--primary'} onClick={onConfirm} disabled={busy}>
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
