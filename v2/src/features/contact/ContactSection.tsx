import { useState, useEffect } from 'react';
import { ARENA_PAGE_COPY } from '@/features/arena-page/pageCopy';
import { ArenaPageContent } from '@/features/arena-page/ArenaPageContent';
import { EditorialChapter, EditorialIndex } from '@/features/arena-page/Editorial';
import { soundEngine } from '@/shared/utils/soundEngine';
import { CONTACT } from '@/shared/constants/urls';
import { useSection } from '@/shared/content/SiteContentContext';
import { useStudioStats } from '@/shared/content/StudioStats';
import { withCatalogueCounts } from '@/shared/utils/catalogueText';
import { supabase } from '@/lib/supabase';

type EnquiryType = '' | 'Game Integration' | 'Request a Demo' | 'Distribution Partnership' | 'Press and Media' | 'Careers' | 'Other';
interface FormFields { readonly name: string; readonly company: string; readonly email: string; readonly enquiryType: EnquiryType; readonly message: string; }
interface FormErrors { readonly name?: string; readonly company?: string; readonly email?: string; readonly enquiryType?: string; readonly message?: string; }
type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error' | 'mailto';
interface EnquiryResponse { readonly ok?: boolean; readonly emailed?: boolean; readonly stored?: boolean; readonly error?: string; }

const ENQUIRY_OPTIONS: readonly EnquiryType[] = ['Game Integration', 'Request a Demo', 'Distribution Partnership', 'Press and Media', 'Careers', 'Other'] as const;
const INITIAL_FORM: FormFields = { name: '', company: '', email: '', enquiryType: '', message: '' };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PARTNER_TYPES: readonly { readonly label: string; readonly description: string }[] = [
  { label: 'Operators', description: 'Integrate {{games}} titles via a single API. Sandbox environment and a dedicated technical account manager included.' },
  { label: 'Aggregators', description: 'Add Gladiator + MetaWin Originals to your content portfolio. Full catalogue, one connection.' },
  { label: 'Platforms', description: 'Looking for high-volatility, crypto-native content? Our games are built to perform in your lobby from day one.' },
] as const;

const DIRECT_CHANNELS: readonly { readonly label: string; readonly value: string; readonly href?: string }[] = [
  { label: 'Email', value: CONTACT.email, href: `mailto:${CONTACT.email}` },
  { label: 'Phone', value: CONTACT.phone, href: `tel:${CONTACT.phone.replace(/\s/g, '')}` },
  { label: 'HQ', value: CONTACT.location },
  { label: 'Response', value: '< 1 business day (GMT)' },
] as const;

const FIELD_ORDER: readonly (keyof FormErrors)[] = ['name', 'company', 'email', 'enquiryType', 'message'];

function validate(f: FormFields): FormErrors {
  const e: Record<string, string> = {};
  if (!f.name.trim()) e.name = 'Please enter your name.';
  if (!f.email.trim()) e.email = 'Please enter your email.';
  else if (!EMAIL_PATTERN.test(f.email)) e.email = 'That email doesn’t look right.';
  if (!f.enquiryType) e.enquiryType = 'Please choose an enquiry type.';
  if (!f.message.trim()) e.message = 'Please add a short message.';
  return e as FormErrors;
}

function FieldError({ id, msg }: { readonly id: string; readonly msg: string | undefined }) {
  if (!msg) return null;
  return <span id={id} role="alert" className="field-error">{msg}</span>;
}

function getServerError(data: unknown): string | undefined {
  if (!data || typeof data !== 'object' || !('error' in data)) return undefined;
  return typeof data.error === 'string' && data.error.trim() ? data.error : undefined;
}

function enquiryEmail(fields: FormFields): { subject: string; body: string } {
  return {
    subject: `Enquiry — ${fields.enquiryType || 'General'} — ${fields.company || fields.name}`,
    body: [
      `Name: ${fields.name}`,
      `Company: ${fields.company}`,
      `Reply-to: ${fields.email}`,
      `Type: ${fields.enquiryType}`,
      '',
      fields.message,
    ].join('\n'),
  };
}

export function ContactSection({ titleId, bodyOnly = false }: { readonly titleId: string; readonly bodyOnly?: boolean }) {
  const s = useStudioStats();
  const { email } = useSection('contact', { email: CONTACT.email });
  const channels = DIRECT_CHANNELS.map((c) => (c.label === 'Email' ? { ...c, value: email, href: `mailto:${email}` } : c));
  const [fields, setFields] = useState<FormFields>(() => {
    try { const raw = sessionStorage.getItem('contact-draft'); return raw ? { ...INITIAL_FORM, ...JSON.parse(raw) } : INITIAL_FORM; }
    catch { return INITIAL_FORM; }
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [submitError, setSubmitError] = useState('');
  const [canUseMailto, setCanUseMailto] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [website, setWebsite] = useState('');

  // Failed sends and mailto keep the draft; confirmed delivery clears the fields.
  useEffect(() => {
    try {
      if (Object.values(fields).some((value) => value.length > 0)) sessionStorage.setItem('contact-draft', JSON.stringify(fields));
      else sessionStorage.removeItem('contact-draft');
    } catch { /* noop */ }
  }, [fields]);

  function update<K extends keyof FormFields>(k: K, v: FormFields[K]) {
    setFields((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }));
    setCopyStatus('idle');
  }

  /** Last-resort: open the visitor's mail client, pre-addressed to the studio inbox. */
  function openMailto() {
    const { subject, body } = enquiryEmail(fields);
    setStatus('mailto');
    setCopyStatus('idle');
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  async function copyMessage() {
    const { subject, body } = enquiryEmail(fields);
    try {
      await navigator.clipboard.writeText(`To: ${email}\nSubject: ${subject}\n\n${body}`);
      setCopyStatus('copied');
    } catch { setCopyStatus('error'); }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'submitting') return;
    const errs = validate(fields);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const firstKey = FIELD_ORDER.find((k) => errs[k]);
      if (firstKey) document.getElementById(`contact-${firstKey}`)?.focus();
      return;
    }
    setErrors({});
    setStatus('submitting');
    setSubmitError('');
    setCanUseMailto(false);
    setCopyStatus('idle');
    soundEngine.transmission();

    // Non-2xx responses live in response, not data. Preserve the server's error
    // and offer mailto only for retryable failures; never open it automatically.
    try {
      const { data, error, response } = await supabase.functions.invoke<EnquiryResponse>('send-enquiry', {
        body: { name: fields.name, company: fields.company, email: fields.email, enquiryType: fields.enquiryType, message: fields.message, website },
      });
      if (error) {
        const httpStatus = response?.status;
        const errorData: unknown = response ? await response.json().catch(() => null) : null;
        const fallbackError = httpStatus === 429 ? 'Too many enquiries. Please try again later or use your email app.'
          : httpStatus === 422 ? 'Please check your enquiry fields and try again.'
          : httpStatus === 413 ? 'Your enquiry is too large. Please shorten it and try again.'
          : 'Couldn’t send your enquiry. Your draft is saved — please try again.';
        setSubmitError(getServerError(errorData) ?? fallbackError);
        setCanUseMailto(httpStatus === undefined || httpStatus === 429 || httpStatus >= 500);
        setStatus('error');
        return;
      }

      // Delivered = emailed to the studio OR safely stored in the admin inbox (the
      // function stores without emailing when its email budget is spent).
      if (data?.ok === true && (data.emailed === true || data.stored === true)) {
        setStatus('success');
        soundEngine.alert();
        setFields(INITIAL_FORM);
        setWebsite('');
        return;
      }

      setSubmitError(getServerError(data) ?? 'Email delivery wasn’t confirmed. Your draft is saved — please use your email app or try again.');
      setCanUseMailto(data?.ok !== false);
      setStatus('error');
    } catch {
      setSubmitError('Couldn’t reach the studio. Your draft is saved — please try again or use your email app.');
      setCanUseMailto(true);
      setStatus('error');
    }
  }

  return (
    <ArenaPageContent titleId={titleId} bodyOnly={bodyOnly} {...ARENA_PAGE_COPY.contact}>
      <EditorialIndex chapters={[{ id: 'contact-direct', label: 'Direct' }, { id: 'contact-enquiry', label: 'Enquiry' }]} />

      <EditorialChapter id="contact-direct" number="01" kicker="Direct" title="Start a conversation" deck="One team. A direct line.">
        <a className="arena-page__direct-email" href={`mailto:${email}`}>
          {email.includes('@') ? <>{email.slice(0, email.indexOf('@'))}@<wbr />{email.slice(email.indexOf('@') + 1)}</> : email}
        </a>
        <dl className="arena-page__contact-channels">
          {channels.filter((c) => c.label !== 'Email').map((c) => (
            <div key={c.label} className="arena-page__ledger-row">
              <dt className="arena-page__meta">{c.label}</dt>
              <dd>{c.href ? <a href={c.href}>{c.value}</a> : c.value}</dd>
            </div>
          ))}
        </dl>
        <div className="arena-page__contact-partners">
          {PARTNER_TYPES.map((p, index) => (
            <div key={p.label} className="arena-page__ledger-row">
              <span className="arena-page__ledger-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h3 className="arena-page__contact-partner-title">{p.label}</h3>
                <p className="body-text">{withCatalogueCounts(p.description, s)}</p>
              </div>
            </div>
          ))}
        </div>
      </EditorialChapter>

      <EditorialChapter id="contact-enquiry" number="02" kicker="Enquiry" title="Tell us what you need" className="arena-page__contact-form">
          {status === 'success' ? (
            <div key="ok" aria-live="polite"
              className="arena-page__contact-success">
              Enquiry received — we’ll reply within one business day. You can also email{' '}
              <a href={`mailto:${email}`}>{email}</a> directly.
              <button type="button" className="arena-page__action" onClick={() => setStatus('idle')}>
                Send another
              </button>
            </div>
          ) : (
            <form key="form"
              onSubmit={handleSubmit} noValidate className="arena-page__enquiry-fields">
              <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)}
                aria-hidden="true" tabIndex={-1} autoComplete="off"
                style={{ position: 'absolute', left: -10000, width: 1, height: 1, overflow: 'hidden' }} />
              <div className={`arena-page__floating-field${fields.name ? ' is-filled' : ''}`}>
                <input id="contact-name" className="field" type="text" name="name" value={fields.name} onChange={(e) => update('name', e.target.value)}
                  placeholder=" " autoComplete="name" maxLength={200} disabled={status === 'submitting'} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'err-name' : undefined} />
                <label htmlFor="contact-name" className="field-label">Name</label>
                <span className="arena-page__field-line" aria-hidden="true" />
                <FieldError id="err-name" msg={errors.name} />
              </div>

              <div className={`arena-page__floating-field${fields.company ? ' is-filled' : ''}`}>
                <input id="contact-company" className="field" type="text" name="company" value={fields.company} onChange={(e) => update('company', e.target.value)}
                  placeholder=" " autoComplete="organization" maxLength={200} disabled={status === 'submitting'} />
                <label htmlFor="contact-company" className="field-label">Company</label>
                <span className="arena-page__field-line" aria-hidden="true" />
              </div>

              <div className={`arena-page__floating-field${fields.email ? ' is-filled' : ''}`}>
                <input id="contact-email" className="field" type="email" inputMode="email" spellCheck={false} name="email" value={fields.email} onChange={(e) => update('email', e.target.value)}
                  placeholder=" " autoComplete="email" maxLength={320} disabled={status === 'submitting'} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'err-email' : undefined} />
                <label htmlFor="contact-email" className="field-label">Work email</label>
                <span className="arena-page__field-line" aria-hidden="true" />
                <FieldError id="err-email" msg={errors.email} />
              </div>

              <div className="arena-page__floating-field is-filled">
                <select id="contact-enquiryType" className="field" name="enquiryType" value={fields.enquiryType} onChange={(e) => update('enquiryType', e.target.value as EnquiryType)}
                  disabled={status === 'submitting'} aria-invalid={!!errors.enquiryType} aria-describedby={errors.enquiryType ? 'err-enquiry' : undefined}>
                  <option value="" disabled>Select one…</option>
                  {ENQUIRY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <label htmlFor="contact-enquiryType" className="field-label">Enquiry type</label>
                <span className="arena-page__field-line" aria-hidden="true" />
                <FieldError id="err-enquiry" msg={errors.enquiryType} />
              </div>

              <div className={`arena-page__floating-field arena-page__floating-field--wide${fields.message ? ' is-filled' : ''}`}>
                <textarea id="contact-message" className="field" name="message" value={fields.message} onChange={(e) => update('message', e.target.value)}
                  placeholder=" " rows={4} maxLength={5000} disabled={status === 'submitting'}
                  aria-invalid={!!errors.message} aria-describedby={[errors.message && 'err-message', fields.message.length > 4000 && 'contact-message-count'].filter(Boolean).join(' ') || undefined} />
                <label htmlFor="contact-message" className="field-label">Message</label>
                <span className="arena-page__field-line" aria-hidden="true" />
                <FieldError id="err-message" msg={errors.message} />
                {fields.message.length > 4000 && (
                  <span id="contact-message-count" className="readout" aria-live="polite" style={{ display: 'block', marginTop: 4 }}>
                    {fields.message.length} / 5000
                  </span>
                )}
              </div>

              {status === 'error' && (
                <p role="alert" className="field-error">
                  {submitError}
                </p>
              )}

              {(status === 'mailto' || (status === 'error' && canUseMailto)) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p role="status" className="body-text">
                    {status === 'mailto' ? 'Your email app should have opened — if not, copy your message.' : 'You can send your saved message using your email app.'}{' '}
                    Email <a href={`mailto:${email}`} style={{ overflowWrap: 'anywhere' }}>{email}</a>.
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button type="button" className="arena-page__action" onClick={openMailto} style={{ flex: '1 1 140px' }}>
                      {status === 'mailto' ? 'Open email app again' : 'Use email app'} <span className="arena-page__action-arrow" aria-hidden="true">↗</span>
                    </button>
                    <button type="button" className="arena-page__action" onClick={copyMessage} style={{ flex: '1 1 140px' }}>Copy message</button>
                  </div>
                  {copyStatus !== 'idle' && (
                    <p role="status" className="body-text">
                      {copyStatus === 'copied' ? 'Message copied, including the studio address.' : 'Couldn’t copy — select and copy your message from the form above.'}
                    </p>
                  )}
                </div>
              )}

              <button type="submit" className="arena-page__action" disabled={status === 'submitting'} aria-busy={status === 'submitting'} style={{ width: '100%' }}>
                {status === 'submitting' ? (
                  <>
                    <span className="animate-spin" aria-hidden="true" style={{ width: 14, height: 14, border: '2px solid var(--color-line)', borderTopColor: 'var(--color-ice-200)' }} />
                    Sending…
                  </>
                ) : <span>Send Enquiry</span>}
              </button>
            </form>
          )}
      </EditorialChapter>
    </ArenaPageContent>
  );
}
