import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SectionWrapper } from '@/shared/components/SectionWrapper';
import { SectionHeading, Reveal } from '@/shared/ui';
import { soundEngine } from '@/shared/utils/soundEngine';
import { CONTACT } from '@/shared/constants/urls';
import { useSection } from '@/shared/content/SiteContentContext';
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
  { label: 'Operators', description: 'Integrate 34 titles via a single API. Sandbox environment and a dedicated technical account manager included.' },
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

export function ContactSection() {
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
    <SectionWrapper id="contact">
      <SectionHeading
        as="h1"
        eyebrow="Contact"
        title="Establish contact"
        lede="We work with operators, aggregators, and platform partners. Tell us what you’re looking for and our team will respond within one business day."
      />

      {/* Partner protocols */}
      <Reveal delay={0}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PARTNER_TYPES.map((p) => (
            <div key={p.label} className="card card--hover" style={{ padding: '0.85rem 1rem' }}>
              <span className="card__label" style={{ marginBottom: '0.3rem' }}>{p.label}</span>
              <p className="body-text" style={{ fontSize: 'var(--text-xs)' }}>{p.description}</p>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Direct channels */}
      <Reveal delay={0.06}>
      {/* 2×2 in the desktop panel, one column on phones (never a 3 + 1 orphan). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 8 }}>
        {channels.map((c) => (
          <div key={c.label} className="card card--hover" style={{ padding: '0.7rem 0.85rem' }}>
            <span className="field-label" style={{ marginBottom: '0.25rem' }}>{c.label}</span>
            {c.href ? (
              <a href={c.href} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-ice-200)', wordBreak: 'break-word', textDecoration: 'none', borderBottom: '1px solid var(--color-line)' }}>{c.value}</a>
            ) : (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-ice-200)', wordBreak: 'break-word' }}>{c.value}</span>
            )}
          </div>
        ))}
      </div>
      </Reveal>

      {/* Enquiry form */}
      <Reveal delay={0.12}>
      <div className="card" style={{ padding: '1.1rem 1.25rem' }}>
        <span className="card__label">Send an enquiry</span>
        <AnimatePresence mode="wait">
          {status === 'success' ? (
            <motion.div key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-live="polite"
              style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-text-soft)', padding: '12px 0', textAlign: 'center', lineHeight: 1.6 }}>
              Enquiry received — we’ll reply within one business day. You can also email{' '}
              <a href={`mailto:${email}`} style={{ color: 'var(--color-holo-300)' }}>{email}</a> directly.
              <button type="button" onClick={() => setStatus('idle')}
                style={{ display: 'block', margin: '12px auto 0', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-holo-300)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Send another
              </button>
            </motion.div>
          ) : (
            <motion.form key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
              <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)}
                aria-hidden="true" tabIndex={-1} autoComplete="off"
                style={{ position: 'absolute', left: -10000, width: 1, height: 1, overflow: 'hidden' }} />
              <div>
                <label htmlFor="contact-name" className="field-label">Name</label>
                <input id="contact-name" className="field" type="text" name="name" value={fields.name} onChange={(e) => update('name', e.target.value)}
                  placeholder="e.g. Alex Mercer…" autoComplete="name" maxLength={200} disabled={status === 'submitting'} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'err-name' : undefined} />
                <FieldError id="err-name" msg={errors.name} />
              </div>

              <div>
                <label htmlFor="contact-company" className="field-label">Company</label>
                <input id="contact-company" className="field" type="text" name="company" value={fields.company} onChange={(e) => update('company', e.target.value)}
                  placeholder="e.g. Apex Gaming…" autoComplete="organization" maxLength={200} disabled={status === 'submitting'} />
              </div>

              <div>
                <label htmlFor="contact-email" className="field-label">Work email</label>
                <input id="contact-email" className="field" type="email" inputMode="email" spellCheck={false} name="email" value={fields.email} onChange={(e) => update('email', e.target.value)}
                  placeholder="you@company.com" autoComplete="email" maxLength={320} disabled={status === 'submitting'} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'err-email' : undefined} />
                <FieldError id="err-email" msg={errors.email} />
              </div>

              <div>
                <label htmlFor="contact-enquiryType" className="field-label">Enquiry type</label>
                <select id="contact-enquiryType" className="field" name="enquiryType" value={fields.enquiryType} onChange={(e) => update('enquiryType', e.target.value as EnquiryType)}
                  disabled={status === 'submitting'} aria-invalid={!!errors.enquiryType} aria-describedby={errors.enquiryType ? 'err-enquiry' : undefined}>
                  <option value="" disabled>Select one…</option>
                  {ENQUIRY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <FieldError id="err-enquiry" msg={errors.enquiryType} />
              </div>

              <div>
                <label htmlFor="contact-message" className="field-label">Message</label>
                <textarea id="contact-message" className="field" name="message" value={fields.message} onChange={(e) => update('message', e.target.value)}
                  placeholder="Tell us about your platform, player base, or what you need from a content partner…" rows={4} maxLength={5000} disabled={status === 'submitting'}
                  aria-invalid={!!errors.message} aria-describedby={[errors.message && 'err-message', fields.message.length > 4000 && 'contact-message-count'].filter(Boolean).join(' ') || undefined} />
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
                  <p role="status" className="body-text" style={{ fontSize: 13 }}>
                    {status === 'mailto' ? 'Your email app should have opened — if not, copy your message.' : 'You can send your saved message using your email app.'}{' '}
                    Email <a href={`mailto:${email}`} style={{ color: 'var(--color-holo-300)', overflowWrap: 'anywhere' }}>{email}</a>.
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button type="button" className="btn" onClick={openMailto} style={{ flex: '1 1 140px' }}>
                      {status === 'mailto' ? 'Open email app again' : 'Use email app'}
                    </button>
                    <button type="button" className="btn" onClick={copyMessage} style={{ flex: '1 1 140px' }}>Copy message</button>
                  </div>
                  {copyStatus !== 'idle' && (
                    <p role="status" className="body-text" style={{ fontSize: 13 }}>
                      {copyStatus === 'copied' ? 'Message copied, including the studio address.' : 'Couldn’t copy — select and copy your message from the form above.'}
                    </p>
                  )}
                </div>
              )}

              <button type="submit" className="btn btn--primary" disabled={status === 'submitting'} aria-busy={status === 'submitting'} style={{ width: '100%' }}>
                {status === 'submitting' ? (
                  <>
                    <span className="animate-spin" aria-hidden="true" style={{ width: 14, height: 14, border: '2px solid var(--color-line)', borderTopColor: 'var(--color-holo-300)', borderRadius: '50%' }} />
                    Sending…
                  </>
                ) : 'Send Enquiry'}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
      </Reveal>
    </SectionWrapper>
  );
}
