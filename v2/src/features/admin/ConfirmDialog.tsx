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
  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="card modal" style={{ maxWidth: 430 }} onClick={(e) => e.stopPropagation()} role="alertdialog" aria-label={title}>
        <h3>{title}</h3>
        <p style={{ color: 'var(--a-dim)', margin: '0 0 20px', lineHeight: 1.55 }}>{message}</p>
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
