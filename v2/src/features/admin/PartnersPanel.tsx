import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import type { PartnerRow } from '@/features/partner/portalHelpers';
import { ConfirmDialog } from './ConfirmDialog';
import { PartnerCredentialsEditor } from './PartnerCredentialsEditor';
import { PartnerDocsEditor } from './PartnerDocsEditor';
import { PartnerFilesPanel } from './PartnerFilesPanel';
import { PasswordOnceDialog } from './PasswordOnceDialog';
import { useToast } from './Toast';
import { useUnsaved } from './Unsaved';
import { fetchPartners, invokePartnerAction, setPartnerActive, updatePartner, validatePartnerAccount, type PartnerAccountDraft } from './partnerAdminApi';

const EMPTY: PartnerAccountDraft = { company: '', email: '', contactEmail: '' };
interface PasswordOnce { readonly email: string; readonly password: string }
interface Pending { readonly title: string; readonly message: string; readonly label: string; readonly danger?: boolean; readonly run: () => void | Promise<void> }
const errorMessage = (error: unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : 'The request failed. Please try again.';
const createdDate = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-GB') : 'Unknown';
};

export function PartnersPanel() {
  const { toast } = useToast();
  const { setDirty } = useUnsaved();
  const prefix = useId();
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [company, setCompany] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState<PartnerAccountDraft>(EMPTY);
  const [newError, setNewError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [credentialDirty, setCredentialDirty] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [passwordOnce, setPasswordOnce] = useState<PasswordOnce | null>(null);
  const passwordRequest = useRef(0);
  const listRequest = useRef(0);
  const selected = partners.find((row) => row.id === selectedId) ?? null;
  const newDirty = draft.company !== '' || draft.email !== '' || draft.contactEmail !== '';
  const detailDirty = !!selected && (company !== selected.company || contactEmail !== selected.contact_email);
  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    return partners.filter((row) => `${row.company} ${row.login_email} ${row.contact_email}`.toLowerCase().includes(search));
  }, [partners, query]);
  const credentialDirtyChanged = useCallback((dirty: boolean) => setCredentialDirty(dirty), []);

  useEffect(() => { setDirty('partner-new-account', newDirty); }, [newDirty, setDirty]);
  useEffect(() => { setDirty('partner-account-details', detailDirty); }, [detailDirty, setDirty]);
  useEffect(() => () => { setDirty('partner-new-account', false); setDirty('partner-account-details', false); }, [setDirty]);
  useEffect(() => () => { passwordRequest.current += 1; setPasswordOnce(null); }, []);

  const reload = useCallback(async () => {
    const request = ++listRequest.current;
    setLoading(true); setError(null);
    try { const rows = await fetchPartners(); if (request === listRequest.current) setPartners(rows); }
    catch (reason) { if (request === listRequest.current) setError(errorMessage(reason)); }
    finally { if (request === listRequest.current) setLoading(false); }
  }, []);
  useEffect(() => { void reload(); return () => { listRequest.current += 1; }; }, [reload]);

  function closePassword() { setPasswordOnce(null); }
  function choosePartner(row: PartnerRow) {
    if (row.id === selectedId) return;
    const run = () => {
      setSelectedId(row.id); setCompany(row.company); setContactEmail(row.contact_email); setDetailError(null);
      setDraft(EMPTY); setNewError(null); setNewOpen(false); setCredentialDirty(false); setEditorVersion((version) => version + 1);
    };
    if (newDirty || detailDirty || credentialDirty) setConfirm({ title: 'Discard unsaved partner changes?', message: 'Your account or credential changes have not been saved.', label: 'Discard changes', danger: true, run });
    else run();
  }
  function closeNew() {
    const run = () => { setDraft(EMPTY); setNewError(null); setNewOpen(false); };
    if (newDirty) setConfirm({ title: 'Discard new partner?', message: 'This account has not been created. Your form changes will be lost.', label: 'Discard changes', danger: true, run });
    else run();
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const invalid = validatePartnerAccount(draft);
    if (invalid) { setNewError(invalid); return; }
    setBusy(true); setNewError(null);
    const request = ++passwordRequest.current;
    try {
      const loginEmail = draft.email.trim().toLowerCase();
      const result = await invokePartnerAction({ action: 'create', company: draft.company.trim(), email: loginEmail, ...(draft.contactEmail.trim() ? { contactEmail: draft.contactEmail.trim().toLowerCase() } : {}) });
      if (request !== passwordRequest.current) return;
      setPasswordOnce({ email: result.email ?? loginEmail, password: result.password });
      setDraft(EMPTY); setNewOpen(false);
      await reload();
    } catch (reason) { if (request === passwordRequest.current) setNewError(errorMessage(reason)); }
    finally { if (request === passwordRequest.current) setBusy(false); }
  }
  function merge(row: PartnerRow) {
    listRequest.current += 1;
    setLoading(false); setError(null);
    setPartners((prev) => prev.map((item) => item.id === row.id ? row : item));
  }
  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    if (!selected || busy) return;
    const invalid = validatePartnerAccount({ company, email: selected.login_email, contactEmail });
    if (invalid || !contactEmail.trim()) { setDetailError(invalid ?? 'A valid contact email is required.'); return; }
    setBusy(true); setDetailError(null);
    try {
      const saved = await updatePartner(selected.id, { company: company.trim(), contact_email: contactEmail.trim().toLowerCase() });
      merge(saved); setCompany(saved.company); setContactEmail(saved.contact_email); toast('Partner details saved.');
    } catch (reason) { setDetailError(errorMessage(reason)); }
    finally { setBusy(false); }
  }
  async function toggleActive(row: PartnerRow) {
    try {
      const saved = await setPartnerActive(row.id, !row.active);
      merge({ ...row, active: saved.active }); toast(saved.active ? 'Partner enabled.' : 'Partner disabled.');
    } catch (reason) {
      // The function may cut data access before a login-ban error; refresh that flag.
      await reload();
      throw reason;
    }
  }
  function askToggle(row: PartnerRow) {
    if (row.active) setConfirm({ title: 'Disable partner', message: `Disable access for "${row.company}"? The partner will lose access to the portal.`, label: 'Disable', danger: true, run: () => toggleActive(row) });
    else {
      setBusy(true);
      void toggleActive(row).catch((reason: unknown) => toast(errorMessage(reason), 'err')).finally(() => setBusy(false));
    }
  }
  function askReset(row: PartnerRow) {
    setConfirm({ title: 'Reset partner password', message: `Replace the login password for ${row.login_email}? The previous password will stop working.`, label: 'Reset password', danger: true, run: async () => {
      const request = ++passwordRequest.current;
      const result = await invokePartnerAction({ action: 'reset', partnerId: row.id });
      if (request === passwordRequest.current) setPasswordOnce({ email: row.login_email, password: result.password });
    } });
  }
  async function runConfirm() {
    if (!confirm || busy) return;
    setBusy(true);
    try { await confirm.run(); setConfirm(null); }
    catch (reason) { toast(errorMessage(reason), 'err'); }
    finally { setBusy(false); }
  }
  return (
    <div className="partner-admin">
      <section className="card partner-admin-section" aria-labelledby={`${prefix}-heading`}>
        <div className="toolbar"><h2 id={`${prefix}-heading`}>Partners</h2><span className="count-pill">{partners.length} {partners.length === 1 ? 'account' : 'accounts'}</span><button className="btn btn--primary" type="button" disabled={busy || newOpen} onClick={() => setNewOpen(true)}>New partner</button></div>
        <p className="hint">Open partner accounts, manage their test credentials, and publish shared integration resources.</p>
        {newOpen && <form className="partner-admin-editor" onSubmit={(event) => { void create(event); }}>
          <h3>New partner</h3>
          {newError && <p className="msg msg--err" role="alert">{newError}</p>}
          <fieldset className="partner-admin-fieldset" disabled={busy}><div className="form-grid">
            <div className="field"><label htmlFor={`${prefix}-new-company`}>Company</label><input id={`${prefix}-new-company`} className="input" autoComplete="organization" maxLength={120} required value={draft.company} onChange={(event) => setDraft((prev) => ({ ...prev, company: event.target.value }))} /></div>
            <div className="field"><label htmlFor={`${prefix}-new-email`}>Login email</label><input id={`${prefix}-new-email`} className="input" type="email" autoComplete="off" maxLength={254} required value={draft.email} onChange={(event) => setDraft((prev) => ({ ...prev, email: event.target.value }))} /></div>
            <div className="field col-span"><label htmlFor={`${prefix}-new-contact`}>Contact email (optional)</label><input id={`${prefix}-new-contact`} className="input" type="email" autoComplete="off" maxLength={254} value={draft.contactEmail} placeholder="Defaults to login email" onChange={(event) => setDraft((prev) => ({ ...prev, contactEmail: event.target.value }))} /></div>
          </div><div className="modal__foot"><button className="btn btn--ghost" type="button" onClick={closeNew}>Cancel</button><button className="btn btn--primary" type="submit">{busy ? 'Creating…' : 'Create partner'}</button></div></fieldset>
        </form>}
        <div className="toolbar"><span className="toolbar__search"><Search size={15} aria-hidden="true" /><input className="input input--search" type="search" aria-label="Search partners" placeholder="Search company or email…" value={query} onChange={(event) => setQuery(event.target.value)} /></span></div>
        {error && <p className="msg msg--err" role="alert">{error}<button className="btn btn--sm" type="button" disabled={busy || loading} onClick={() => { void reload(); }}>Retry</button></p>}
        {loading ? <p className="hint" role="status">Loading partners…</p> : visible.length === 0 ? <p className="list-empty">{query ? 'No partners match this search.' : 'No partner accounts yet.'}</p> : <div className="table-wrap"><table className="table">
          <thead><tr><th>Company</th><th>Login email</th><th>Contact email</th><th>Created</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{visible.map((row) => <tr key={row.id}><td>{row.company}</td><td>{row.login_email}</td><td>{row.contact_email}</td><td>{createdDate(row.created_at)}</td><td><span className={`pill ${row.active ? 'pill--ok' : ''}`}>{row.active ? 'Active' : 'Disabled'}</span></td><td><button className="btn btn--sm" type="button" disabled={busy} aria-pressed={selectedId === row.id} aria-label={`Manage ${row.company}`} onClick={() => choosePartner(row)}>Manage</button></td></tr>)}</tbody>
        </table></div>}
      </section>
      {selected && <>
        <section className="card partner-admin-section" aria-labelledby={`${prefix}-details`}>
          <div className="toolbar"><h3 id={`${prefix}-details`}>{selected.company}</h3><span className="count-pill">{selected.active ? 'Active' : 'Disabled'}</span></div>
          <p className="hint">Login email: {selected.login_email}</p>
          {detailError && <p className="msg msg--err" role="alert">{detailError}</p>}
          <form onSubmit={(event) => { void saveDetails(event); }}><fieldset className="partner-admin-fieldset" disabled={busy}><div className="form-grid">
            <div className="field"><label htmlFor={`${prefix}-company`}>Company</label><input id={`${prefix}-company`} className="input" required maxLength={120} value={company} onChange={(event) => setCompany(event.target.value)} /></div>
            <div className="field"><label htmlFor={`${prefix}-contact`}>Contact email</label><input id={`${prefix}-contact`} className="input" type="email" required maxLength={254} value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} /></div>
          </div><div className="modal__foot"><button className="btn btn--primary" type="submit" disabled={!detailDirty}>Save details</button></div></fieldset></form>
          <div className="partner-admin-actions"><button className={selected.active ? 'btn btn--danger' : 'btn'} type="button" disabled={busy} onClick={() => askToggle(selected)}>{selected.active ? 'Disable partner' : 'Enable partner'}</button><button className="btn" type="button" disabled={busy} onClick={() => askReset(selected)}>Reset password</button></div>
        </section>
        <PartnerCredentialsEditor key={`${selected.id}:${editorVersion}`} partnerId={selected.id} onDirtyChange={credentialDirtyChanged} />
      </>}
      <PartnerDocsEditor />
      <PartnerFilesPanel />
      {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.label} danger={confirm.danger} busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => { void runConfirm(); }} />}
      {passwordOnce && <PasswordOnceDialog email={passwordOnce.email} password={passwordOnce.password} onClose={closePassword} />}
    </div>
  );
}
