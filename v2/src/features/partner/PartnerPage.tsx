import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { FlatEmblem } from '@/features/arena/FlatEmblem';
import { HeadlineWords } from '@/features/arena-page/HeadlineWords';
import { usePageBodyReady } from '@/features/arena-page/usePageBodyReady';
import { safeHref } from '@/shared/utils/text';
import { PortalSections } from './PortalSections';
import { partnerError } from './usePartnerAuth';
import type { usePartnerAuth } from './usePartnerAuth';

export interface PartnerHeroCopy {
  readonly eyebrow: string;
  readonly title: string;
  readonly lede: string;
  readonly contactEmail: string;
}
interface PartnerPageProps {
  readonly content: PartnerHeroCopy;
  readonly titleId: string;
  readonly auth?: ReturnType<typeof usePartnerAuth>;
}

/** The shell owns initial focus; only an explicit auth switch moves it again. */
export function PartnerPage({ content: c, titleId, auth }: PartnerPageProps) {
  const bodyReady = usePageBodyReady('partner');
  const status = auth?.status ?? 'signedout';
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [actionError, setActionError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null), focusAfterAuth = useRef(false), inFlight = useRef(false);
  const signedIn = Boolean(auth?.session), preview = status === 'preview';
  const ready = status === 'partner' || preview;
  const company = auth?.partner?.company;
  const title = ready ? company || 'Client Area' : status === 'noaccess' ? 'Partner access' : c.title || 'Partners';
  const contactEmail = String(c.contactEmail ?? '').trim();
  const contactHref = /^[^\s@?\r\n]+@[^\s@?\r\n]+\.[^\s@?\r\n]+$/.test(contactEmail) ? safeHref(`mailto:${contactEmail}`) : '';

  useEffect(() => {
    if (!focusAfterAuth.current || status === 'loading' || status === 'unknown') return;
    focusAfterAuth.current = false;
    // The new state starts at the top, not at the old sign-in form's scroll position.
    heading.current?.closest('.partner__scroll')?.scrollTo({ top: 0, behavior: 'instant' });
    heading.current?.focus({ preventScroll: true });
  }, [status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setActionError(''); focusAfterAuth.current = true;
    try { await auth?.signIn(email, password); setPassword(''); }
    catch (error) { focusAfterAuth.current = false; setActionError(partnerError(error, 'Sign-in failed. Please try again.')); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function signOut() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setActionError(''); focusAfterAuth.current = true;
    try { await auth?.signOut(); setPassword(''); }
    catch (error) { focusAfterAuth.current = false; setActionError(partnerError(error, 'Sign-out failed. Please try again.')); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <main className="partner__stage">
    <section className={`partner__hero${ready ? ' partner__hero--portal' : ''}`}>
      <div className="partner__identity">
        {(c.eyebrow || signedIn) && <p className="partner__eyebrow">{signedIn ? 'Client Area' : c.eyebrow}</p>}
        <FlatEmblem className="partner__emblem" fillId={`${titleId}-steel`} />
      </div>
      <h1 ref={heading} id={titleId} className="partner__title" tabIndex={-1} aria-label={title}><HeadlineWords text={title} ready={bodyReady} /></h1>
      {status === 'signedout' && c.lede && <p className="partner__lede">{c.lede}</p>}
      {preview && <p className="partner__preview" role="status">Admin preview — this is what an active partner sees.</p>}
      {signedIn && <div className="partner__account"><p>Signed in as {auth?.session?.user.email || company || 'partner'}</p>
        <button className="partner__button" type="button" onClick={signOut} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</button></div>}
      {actionError && <p className="partner__error" role="alert">{actionError}</p>}
      {status === 'loading' && <p className="partner__load-status" role="status">Checking partner access…</p>}
      {status === 'error' && <div className="partner__access-error"><p className="partner__error" role="alert">{auth?.error || 'Partner access could not be checked. Please try again.'}</p>
        <button className="partner__button" type="button" onClick={() => { setActionError(''); auth?.retry(); }}>Retry</button></div>}
      {status === 'noaccess' && <p className="partner__lede">This login has no partner access. If you think it should, contact us.</p>}
      {status === 'signedout' && <div className="partner__signin">
        <h2 className="partner__heading">Enter the console</h2>
        <form className="partner__form" onSubmit={submit} aria-busy={busy}>
          <div className="partner__field"><input id={`${titleId}-email`} name="email" type="email" autoComplete="username" required maxLength={254} placeholder=" "
            value={email} onChange={event => setEmail(event.target.value)} disabled={busy} />
          <label className="partner__field-label" htmlFor={`${titleId}-email`}>Email</label></div>
          <div className="partner__field"><input id={`${titleId}-password`} name="password" type="password" autoComplete="current-password" required placeholder=" "
            value={password} onChange={event => setPassword(event.target.value)} disabled={busy} />
          <label className="partner__field-label" htmlFor={`${titleId}-password`}>Password</label></div>
          <button className="partner__button" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        {contactEmail && <p className="partner__contact">Accounts are opened by Gladiator Studio. Need one? {contactHref
          ? <a href={contactHref}>{contactEmail}</a> : contactEmail}</p>}
      </div>}
    </section>
    {ready && auth?.session && <PortalSections key={`${auth.session.user.id}:${auth.partner?.id ?? 'preview'}`} partner={auth.partner} preview={preview} userId={auth.session.user.id} />}
    <footer className="partner__foot">© 2026 Gladiator Studio · A MetaWin Company</footer>
  </main>;
}
