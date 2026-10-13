export const MUTE_STORAGE_KEY = 'gladiator_sound_muted';
type MuteStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function createMuteStore(storage: () => MuteStorage | undefined = () =>
  typeof window === 'undefined' ? undefined : window.localStorage) {
  let muted = false;
  try { muted = storage()?.getItem(MUTE_STORAGE_KEY) === '1'; } catch { /* private / blocked storage */ }
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => muted,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    toggle(): boolean {
      muted = !muted;
      try { storage()?.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0'); } catch { /* retain the in-memory preference */ }
      listeners.forEach(listener => listener());
      return muted;
    },
  };
}

export const muteStore = createMuteStore();
