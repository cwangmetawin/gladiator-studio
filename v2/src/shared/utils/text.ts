// Shared helpers for rendering editable (DB-backed) content safely.

/** Normalise a tags/bullets value to a clean string[].
 *  Accepts a real string[] (new shape) OR a legacy newline-joined string. */
export const lines = (s: unknown): string[] =>
  (Array.isArray(s) ? s : String(s ?? '').split('\n')).map((x) => String(x).trim()).filter(Boolean);

/** Split into paragraphs on blank lines. */
export const paras = (s: unknown): string[] =>
  String(s ?? '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);

// Editable links come from the DB — only ever emit http/https/mailto so a
// javascript:/data: URI can never be clicked (defence-in-depth XSS guard).
const SAFE_SCHEMES = ['http:', 'https:', 'mailto:'];
export const safeHref = (u: unknown): string => {
  const s = String(u ?? '');
  if (!s) return '#';
  try { return SAFE_SCHEMES.includes(new URL(s, window.location.origin).protocol) ? s : '#'; }
  catch { return '#'; }
};
