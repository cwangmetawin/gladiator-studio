interface RevealOptions {
  reducedMotion: boolean;
  onState: (state: 'pending' | 'visible') => void;
  observe?: (onVisible: () => void) => () => void;
  schedule?: (callback: () => void, delay: number) => unknown;
  cancel?: (id: unknown) => void;
  safetyMs?: number;
}

/** Construction is inert; only a mounted effect may opt visible content into a reveal. */
export function createRevealLifecycle({ reducedMotion, onState, observe,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = id => clearTimeout(id as ReturnType<typeof setTimeout>),
  safetyMs = 1600,
}: RevealOptions) {
  let mounted = false, revealed = false, disposed = false;
  let timer: unknown, stopObserving: (() => void) | undefined;
  function release() {
    if (timer !== undefined) { cancel(timer); timer = undefined; }
    stopObserving?.(); stopObserving = undefined;
  }
  function reveal() {
    if (disposed || revealed) return;
    revealed = true;
    release();
    onState('visible');
  }
  function mount() {
    if (mounted || disposed) return;
    mounted = true;
    if (reducedMotion || !observe) { reveal(); return; }
    onState('pending');
    safetyMs = Math.max(1, Math.min(1800, safetyMs));
    timer = schedule(reveal, safetyMs);
    stopObserving = observe(reveal);
    if (revealed) release();
  }
  function dispose() { disposed = true; release(); }
  return { mount, reveal, dispose };
}
