/** Keep whitespace tokens: joining the animated spans must reproduce the source exactly. */
export function splitWords(text: string): string[] {
  return text.split(/(\s+)/u).filter(Boolean);
}

/** Catalogue percentages keep the same one-decimal precision as their static presentation. */
export function formatCount(value: number, decimals = 0, suffix = ''): string {
  return value.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
}

export function valueAtProgress(value: number, progress: number, reducedMotion = false): number {
  if (reducedMotion || progress >= 1) return value;
  const bounded = Math.max(0, Math.min(1, progress));
  return value * (1 - (1 - bounded) ** 3);
}

const DECODE_GLYPHS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Deterministic noise avoids random work and never changes spacing or the final credential. */
export function decodeFrame(value: string, progress: number, reducedMotion = false): string {
  if (reducedMotion || progress >= 1) return value;
  const bounded = Math.max(0, Math.min(0.999, progress));
  const settled = Math.floor(value.length * bounded);
  return Array.from(value, (character, index) => {
    if (index < settled || /\s/u.test(character)) return character;
    const position = (index * 7 + Math.floor(bounded * 24)) % DECODE_GLYPHS.length;
    const glyph = DECODE_GLYPHS[position] ?? '0';
    return glyph === character ? (DECODE_GLYPHS[(position + 1) % DECODE_GLYPHS.length] ?? '1') : glyph;
  }).join('');
}
