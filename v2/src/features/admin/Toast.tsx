import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type ToastKind = 'ok' | 'err';
interface Toast { readonly id: number; readonly kind: ToastKind; readonly text: string }
interface ToastApi { readonly toast: (text: string, kind?: ToastKind) => void }

const Ctx = createContext<ToastApi>({ toast: () => {} });
let nextId = 1;

/** Lightweight toast notifications for the admin — replaces inline save messages. */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const toast = useCallback((text: string, kind: ToastKind = 'ok') => {
    const id = nextId++;
    setToasts((t) => [...t, { id, kind, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);
  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`} role="status">
            <span className="toast__icon" aria-hidden="true">{t.kind === 'ok' ? '✓' : '!'}</span>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = (): ToastApi => useContext(Ctx);
