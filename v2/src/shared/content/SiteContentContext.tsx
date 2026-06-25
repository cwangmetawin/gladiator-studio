import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { SECTION_DEFAULTS, fetchSiteContent, type ContentMap } from '@/api/siteContent';

const Ctx = createContext<ContentMap>(SECTION_DEFAULTS);

/** Loads editable site content once and provides it to the tree (defaults first). */
export function SiteContentProvider({ children }: { readonly children: ReactNode }) {
  const [content, setContent] = useState<ContentMap>(SECTION_DEFAULTS);
  useEffect(() => {
    let alive = true;
    fetchSiteContent().then((c) => { if (alive) setContent(c); });
    return () => { alive = false; };
  }, []);
  return <Ctx.Provider value={content}>{children}</Ctx.Provider>;
}

/** Read a section's content document, merged over the supplied defaults. */
export function useSection<T extends object>(key: string, defaults: T): T {
  const c = useContext(Ctx);
  return { ...defaults, ...(c[key] ?? {}) } as T;
}
