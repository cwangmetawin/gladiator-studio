interface PlanetSurfacesOptions {
  readonly planets: readonly string[];
  readonly load: (planetId: string) => void;
  readonly scheduleIdle: (callback: () => void) => () => void;
  readonly canFly: () => boolean;
}

/** Requests belong to the scene: none before hand-off, one planet per idle task, or the focal planet on demand. */
export function createPlanetSurfaces({ planets, load, scheduleIdle, canFly }: PlanetSurfacesOptions) {
  const requested = new Set<string>();
  let ready = false;
  let disposed = false;
  let focal: string | null = null;
  let cancelIdle: (() => void) | null = null;

  function request(id: string): void {
    if (requested.has(id)) return;
    requested.add(id);
    load(id);
  }

  function prefetch(): void {
    if (disposed || !ready || !canFly() || cancelIdle || !planets.some(id => !requested.has(id))) return;
    cancelIdle = scheduleIdle(() => {
      cancelIdle = null;
      if (disposed || !canFly()) return;
      const next = planets.find(id => !requested.has(id));
      if (next) request(next);
      prefetch();
    });
  }

  return {
    ready(): void {
      if (disposed) return;
      ready = true;
      if (canFly() && focal) request(focal);
      prefetch();
    },
    flight(planetId: string): void {
      if (disposed) return;
      focal = planets.includes(planetId) ? planetId : null;
      if (ready && canFly() && focal) request(focal);
      prefetch();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      cancelIdle?.();
      cancelIdle = null;
    },
  };
}

interface PlanetIdleHost {
  readonly requestIdleCallback?: (callback: () => void, options: { timeout: number }) => number;
  readonly cancelIdleCallback?: (handle: number) => void;
  readonly setTimeout: (callback: () => void, delay: number) => number;
  readonly clearTimeout: (handle: number) => void;
}

export function schedulePlanetIdle(host: PlanetIdleHost, callback: () => void): () => void {
  if (host.requestIdleCallback && host.cancelIdleCallback) {
    const handle = host.requestIdleCallback(callback, { timeout: 1000 });
    return () => host.cancelIdleCallback?.(handle);
  }
  const handle = host.setTimeout(callback, 50);
  return () => host.clearTimeout(handle);
}
