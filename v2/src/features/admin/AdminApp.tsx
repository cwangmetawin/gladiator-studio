import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { LayoutDashboard, Gamepad2, FileText, Mail, Menu } from 'lucide-react';
import { fetchEnquiryCount } from '@/api/enquiriesDb';
import { useAdminAuth, signIn, signOut } from './useAdminAuth';
import { DashboardPanel } from './DashboardPanel';
import { GamesPanel } from './GamesPanel';
import { ContentPanel } from './ContentPanel';
import { EnquiriesPanel } from './EnquiriesPanel';
import { ConfirmDialog } from './ConfirmDialog';
import { ToastProvider, useToast } from './Toast';
import { UnsavedProvider, useUnsaved } from './Unsaved';
import type { AdminDestination } from './adminNavigation';
import './admin.css';

type Tab = AdminDestination['tab'];

const NAV: readonly { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} aria-hidden="true" /> },
  { id: 'games', label: 'Catalogue', icon: <Gamepad2 size={17} aria-hidden="true" /> },
  { id: 'content', label: 'Content', icon: <FileText size={17} aria-hidden="true" /> },
  { id: 'enquiries', label: 'Enquiries', icon: <Mail size={17} aria-hidden="true" /> },
];

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin login">
      <form className="card login__card" onSubmit={submit}>
        <h1>Gladiator <span>Admin</span></h1>
        <p className="sub">Sign in to manage the catalogue, content &amp; enquiries.</p>
        <div className="login__fields">
          {err && <div className="msg msg--err">{err}</div>}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input id="pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? '…' : 'Sign in'}</button>
        </div>
      </form>
    </div>
  );
}

function NotAuthorized({ email }: { readonly email: string | undefined }) {
  return (
    <div className="admin login">
      <div className="card login__card">
        <h1>Not <span>authorized</span></h1>
        <p className="sub">{email} is signed in but not an admin. Ask an existing admin to allow-list this email.</p>
        <button className="btn" onClick={() => signOut()}>Sign out</button>
      </div>
    </div>
  );
}

function AdminShell({ email }: { readonly email: string | undefined }) {
  const [destination, setDestination] = useState<AdminDestination>({ tab: 'dashboard' });
  const tab = destination.tab;
  const [pending, setPending] = useState<AdminDestination | 'sign-out' | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [unhandledCount, setUnhandledCount] = useState<number | null>(null);
  const [badgeVersion, setBadgeVersion] = useState(0);
  const { hasUnsaved } = useUnsaved();
  const { toast } = useToast();
  const refreshBadge = useCallback(() => setBadgeVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    void fetchEnquiryCount({ handled: false }).then(
      (count) => { if (alive) setUnhandledCount(count); },
      (error: unknown) => { if (alive) toast(error instanceof Error ? error.message : 'Enquiry badge could not be refreshed.', 'err'); },
    );
    return () => { alive = false; };
  }, [tab, badgeVersion, toast]);

  const enquiryBadge = unhandledCount !== null && unhandledCount > 0 ? (
    <span className="tag tag--hot admin__badge">{unhandledCount}<span className="sr-only"> new enquiries</span></span>
  ) : null;

  // Guard actions that leave the editor with the same in-app confirmation.
  function go(next: AdminDestination) {
    setNavOpen(false);
    if (next.tab === tab) return;
    if (hasUnsaved()) { setPending(next); return; }
    setDestination(next);
  }

  function askSignOut() {
    setNavOpen(false);
    if (hasUnsaved()) { setPending('sign-out'); return; }
    void signOut();
  }

  return (
    <div className="admin admin--shell">
      <aside className={`admin__sidebar ${navOpen ? 'is-open' : ''}`}>
        <div className="admin__brand">Gladiator <span>Admin</span></div>
        <nav className="admin__nav" aria-label="Admin sections">
          {NAV.map((n) => (
            <button key={n.id} type="button" className={`admin__navitem ${tab === n.id ? 'is-active' : ''}`} onClick={() => go({ tab: n.id })} aria-current={tab === n.id ? 'page' : undefined}>
              {n.icon}<span>{n.label}</span>
              {n.id === 'enquiries' && enquiryBadge}
            </button>
          ))}
        </nav>
        <div className="admin__sidefoot">
          <span className="admin__who" title={email}>{email}</span>
          <button className="btn btn--sm btn--ghost" onClick={askSignOut}>Sign out</button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="admin__mobilebar">
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setNavOpen((v) => !v)} aria-label="Toggle menu" aria-expanded={navOpen}><Menu size={17} aria-hidden="true" /></button>
        <span className="admin__brand">Gladiator <span>Admin</span></span>
        <button type="button" className="btn btn--sm btn--ghost admin__mobile-enquiries" onClick={() => go({ tab: 'enquiries' })} aria-label={unhandledCount ? `Enquiries, ${unhandledCount} new` : 'Enquiries'}>
          <Mail size={17} aria-hidden="true" />{enquiryBadge}
        </button>
      </div>
      {navOpen && <div className="admin__scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}

      <main className="admin__content">
        {tab === 'dashboard' && <DashboardPanel onNavigate={go} />}
        {destination.tab === 'games' && <GamesPanel initialState={destination.state} />}
        {tab === 'content' && <ContentPanel />}
        {destination.tab === 'enquiries' && <EnquiriesPanel initialFilter={destination.filter} onChanged={refreshBadge} />}
      </main>

      {pending && (
        <ConfirmDialog
          title="Unsaved changes"
          message="You have unsaved content edits. Leave this section without saving?"
          confirmLabel="Leave" danger
          onConfirm={() => { if (pending === 'sign-out') void signOut(); else if (pending) setDestination(pending); setPending(null); }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

export function AdminApp() {
  const { session, isAdmin, loading } = useAdminAuth();

  if (loading) return <div className="admin"><div className="center-note">Loading…</div></div>;
  if (!session) return <LoginScreen />;
  if (!isAdmin) return <NotAuthorized email={session.user.email} />;

  return (
    <ToastProvider>
      <UnsavedProvider>
        <AdminShell email={session.user.email} />
      </UnsavedProvider>
    </ToastProvider>
  );
}
