import { useState, type FormEvent } from 'react';
import { useAdminAuth, signIn, signOut } from './useAdminAuth';
import { GamesPanel } from './GamesPanel';
import { ContentPanel } from './ContentPanel';
import './admin.css';

type Tab = 'games' | 'content';

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await signIn(email.trim(), password); // onAuthStateChange takes over
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
        <p className="sub">Sign in to manage the catalogue &amp; content.</p>
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

export function AdminApp() {
  const { session, isAdmin, loading } = useAdminAuth();
  const [tab, setTab] = useState<Tab>('games');

  if (loading) return <div className="admin"><div className="center-note">Loading…</div></div>;
  if (!session) return <LoginScreen />;
  if (!isAdmin) return <NotAuthorized email={session.user.email} />;

  return (
    <div className="admin">
      <header className="admin__bar">
        <div className="admin__brand">Gladiator <span>Admin</span></div>
        <nav className="admin__tabs">
          <button className={`admin__tab ${tab === 'games' ? 'is-active' : ''}`} onClick={() => setTab('games')}>Catalogue</button>
          <button className={`admin__tab ${tab === 'content' ? 'is-active' : ''}`} onClick={() => setTab('content')}>Content</button>
        </nav>
        <div className="admin__spacer" />
        <span className="admin__who">{session.user.email}</span>
        <button className="btn btn--sm btn--ghost" onClick={() => signOut()}>Sign out</button>
      </header>
      <main className="admin__main">
        {tab === 'games' ? <GamesPanel /> : <ContentPanel />}
      </main>
    </div>
  );
}
