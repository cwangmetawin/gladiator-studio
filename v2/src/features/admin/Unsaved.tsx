import { createContext, useContext, useRef, useEffect, useCallback, type ReactNode } from 'react';

interface UnsavedApi {
  /** Editors call this to flag/clear unsaved changes for a key (e.g. a section). */
  readonly setDirty: (key: string, dirty: boolean) => void;
  /** True if anything is currently unsaved. */
  readonly hasUnsaved: () => boolean;
  /** Forget all dirty flags (e.g. after the user chooses to discard & leave). */
  readonly clear: () => void;
}

const Ctx = createContext<UnsavedApi>({ setDirty: () => {}, hasUnsaved: () => false, clear: () => {} });

/** Tracks unsaved edits across the admin and warns before the tab is closed. */
export function UnsavedProvider({ children }: { readonly children: ReactNode }) {
  const dirty = useRef<Record<string, boolean>>({});
  const hasUnsaved = useCallback(() => Object.values(dirty.current).some(Boolean), []);
  const setDirty = useCallback((key: string, val: boolean) => { dirty.current[key] = val; }, []);
  const clear = useCallback(() => { dirty.current = {}; }, []);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsaved()) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsaved]);

  return <Ctx.Provider value={{ setDirty, hasUnsaved, clear }}>{children}</Ctx.Provider>;
}

export const useUnsaved = (): UnsavedApi => useContext(Ctx);
