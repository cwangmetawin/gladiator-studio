import { useId, useState } from 'react';
import { Copy } from 'lucide-react';
import { useDialogFocus } from '@/shared/hooks/useDialogFocus';

/**
 * The parent owns the only temporary password value and destroys it on close.
 * Only "Done" closes it: a stray backdrop click or Escape would lose a password
 * that is never shown again.
 */
export function PasswordOnceDialog({ email, password, onClose }: { readonly email: string; readonly password: string; readonly onClose: () => void }) {
  const titleId = useId();
  const descriptionId = useId();
  const ref = useDialogFocus<HTMLDivElement>();
  const [status, setStatus] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(`Email: ${email}\nPassword: ${password}`); setStatus('Copied'); }
    catch { setStatus('Copy failed. Select the password and copy it manually.'); }
  }
  return (
    <div className="modal-bg">
      <div ref={ref} className="card modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
        <h3 id={titleId}>Partner login details</h3>
        <p id={descriptionId} className="msg">Copy this password now and share it securely with the partner. It will not be shown again.</p>
        <dl className="partner-login-details"><dt>Login email</dt><dd>{email}</dd><dt>Temporary password</dt><dd><code>{password}</code></dd></dl>
        <p className="hint" aria-live="polite">{status}</p>
        <div className="modal__foot">
          <button className="btn" type="button" onClick={() => { void copy(); }}><Copy size={15} aria-hidden="true" /> Copy login details</button>
          <button className="btn btn--primary" type="button" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
