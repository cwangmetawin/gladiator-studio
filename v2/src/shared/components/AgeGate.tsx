import { useState, useCallback } from 'react';

const STORAGE_KEY = 'gladiator_age_verified';

export function useAgeGate(): { verified: boolean; verify: () => void; reject: () => void; showGate: boolean } {
  const [verified, setVerified] = useState(() => {
    try { return sessionStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });
  const [rejected, setRejected] = useState(false);

  const verify = useCallback(() => {
    try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch { /* noop */ }
    setVerified(true);
  }, []);

  const reject = useCallback(() => { setRejected(true); }, []);

  return { verified, verify, reject, showGate: !verified && !rejected };
}

interface AgeGateProps {
  readonly onVerify: () => void;
  readonly onReject: () => void;
  readonly rejected: boolean;
}

// Deep-space backdrop shared by both states
const BACKDROP: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 99999,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 20,
  background:
    'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(20,32,56,0.55), transparent 70%), var(--color-void-900)',
};

export function AgeGate({ onVerify, onReject, rejected }: AgeGateProps) {
  if (rejected) {
    return (
      <div style={BACKDROP}>
        <div className="glass" style={{ maxWidth: 420, width: '100%', padding: '44px 40px', textAlign: 'center' }}>
          <div
            aria-hidden="true"
            style={{
              width: 56, height: 56, margin: '0 auto 22px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--color-ember)', color: 'var(--color-ember)',
              fontFamily: 'var(--font-mono)', fontSize: 22,
            }}
          >
            ✕
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-ice-50)', margin: '0 0 14px' }}>
            Access Denied
          </h2>
          <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-text-mute)', fontSize: 13, lineHeight: 1.7, margin: 0 }}>
            You must be 18 or older to access this website. Please close this tab.
          </p>
          <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-dim)', fontSize: 10, marginTop: 22, letterSpacing: '0.04em' }}>
            Need help? Visit{' '}
            <a href="https://www.begambleaware.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-holo-300)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
              BeGambleAware.org
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={BACKDROP}>
      <div className="glass" role="dialog" aria-modal="true" aria-labelledby="age-title" style={{ maxWidth: 460, width: '100%', padding: 'clamp(32px, 5vw, 48px)', textAlign: 'center' }}>
        <img
          src="/gladiator-logo.svg"
          alt="Gladiator Studio"
          width={935} height={535}
          fetchPriority="high"
          style={{ width: 220, height: 'auto', margin: '0 auto 10px', filter: 'brightness(0) invert(1) drop-shadow(0 0 20px rgba(79,195,247,0.42))' }}
        />

        <div
          aria-hidden="true"
          style={{
            width: 52, height: 52, margin: '0 auto 18px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--color-holo-500)', color: 'var(--color-holo-300)',
            fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '0.02em',
            boxShadow: '0 0 18px rgba(79,195,247,0.25), inset 0 0 12px rgba(79,195,247,0.12)',
          }}
        >
          18+
        </div>

        <h2 id="age-title" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--color-ice-50)', margin: '0 0 12px' }}>
          Age Verification
        </h2>

        <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-text-mute)', fontSize: 13, lineHeight: 1.7, margin: '0 0 26px', maxWidth: '34ch', marginInline: 'auto' }}>
          This site features gambling-related content for users aged 18 and over. By entering, you confirm you meet the minimum age in your jurisdiction.
        </p>

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" onClick={onVerify} className="btn btn--primary" style={{ flex: 1 }}>
            I am 18 or older
          </button>
          <button type="button" onClick={onReject} className="btn" style={{ flex: 1 }}>
            Under 18
          </button>
        </div>

        <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-dim)', fontSize: 10, marginTop: 22, letterSpacing: '0.04em', lineHeight: 1.6 }}>
          Gambling can be addictive. Play responsibly.{' '}
          <a href="https://www.begambleaware.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-holo-300)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
            BeGambleAware.org
          </a>
        </p>
      </div>
    </div>
  );
}
