import { useEffect, useState } from 'react';

const GLYPHS = '▓▒░<>/\\#*+=01';
const FRONTIER = 3;       // scrambling characters just ahead of the revealed text
const CHAR_MS = 22;       // reveal speed per character
const MAX_MS = 900;       // long titles reveal faster, never slower than this

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** HUD "decrypt" reveal: text resolves left→right behind a short frontier of shifting
 *  glyphs. Unrevealed characters keep their real glyph at opacity 0, so line breaks and
 *  width stay stable while it plays. The final text is exposed to AT (sr-only) from the start. */
export function DecodeText({ text, delayMs = 120 }: { readonly text: string; readonly delayMs?: number }) {
  const [revealed, setRevealed] = useState(() => (prefersReducedMotion() ? text.length : 0));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) { setRevealed(text.length); return; }
    setRevealed(0);
    const total = Math.min(MAX_MS, text.length * CHAR_MS);
    let raf = 0;
    let start = 0;
    const timer = window.setTimeout(() => {
      const step = (ts: number) => {
        if (!start) start = ts;
        const p = Math.min(1, (ts - start) / Math.max(1, total));
        setRevealed(Math.round(p * text.length));
        setTick((t) => t + 1);
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delayMs);
    return () => { window.clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [text, delayMs]);

  if (revealed >= text.length) return <>{text}</>;

  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, revealed)}
        {Array.from(text.slice(revealed)).map((ch, i) => {
          if (ch === ' ' || ch === '\n') return ch;
          if (i < FRONTIER) {
            const g = GLYPHS[(tick + i * 7 + revealed) % GLYPHS.length];
            return <span key={i} className="decode-glyph">{g}</span>;
          }
          return <span key={i} style={{ opacity: 0 }}>{ch}</span>;
        })}
      </span>
    </>
  );
}
