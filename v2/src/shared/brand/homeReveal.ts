// The hand-off from the age gate (or from nothing, for a visitor verified earlier in the session) to the
// home page. `release` is the moment the home may start its opening: the gate begins its fade, and the 3D
// emblem, the headline and the bar start their arrival from that instant. A tiny external store, like
// emblemAnchor: the gate publishes into it, the home reads it, and neither imports the other.

export function createHomeReveal(now: () => number = () => performance.now()) {
  let releasedAt: number | null = null;
  const listeners = new Set<() => void>();
  return {
    /** The performance.now() time of the release, or null before it. */
    getSnapshot: (): number | null => releasedAt,
    subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
    release(): void {
      if (releasedAt !== null) return;
      releasedAt = now();
      listeners.forEach(listener => listener());
    },
    /** A page that keeps the module alive across tests or hot reloads starts over. */
    reset(): void {
      if (releasedAt === null) return;
      releasedAt = null;
      listeners.forEach(listener => listener());
    },
  };
}

export const homeReveal = createHomeReveal();
