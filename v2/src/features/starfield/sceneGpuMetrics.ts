type BabylonModule = typeof import('@/shared/babylon/babylonCore');
type Engine = InstanceType<BabylonModule['Engine']>;

declare global {
  interface Window { readonly __sceneGpuMs?: number }
}

/** The optional query extension and instrumentation stay unloaded without fx=measure. */
export function installSceneGpuMetrics(B: BabylonModule, engine: Engine, host: Window, measure: boolean) {
  let disposed = false;
  let running = false;
  let instrumentation: InstanceType<Awaited<ReturnType<BabylonModule['loadGpuInstrumentation']>>['EngineInstrumentation']> | null = null;
  const read = (): number | undefined => {
    const counter = instrumentation?.gpuFrameTimeCounter;
    return counter && counter.count > 0 ? counter.current / 1_000_000 : undefined;
  };
  if (measure && engine.webGLVersion === 2 && engine.getCaps().timerQuery) {
    void B.loadGpuInstrumentation().then(({ EngineInstrumentation }) => {
      if (disposed) return;
      instrumentation = new EngineInstrumentation(engine);
      instrumentation.captureGPUFrameTime = running;
      Object.defineProperty(host, '__sceneGpuMs', { get: read, configurable: true });
    }).catch(() => { /* Unsupported instrumentation leaves ordinary frame-time A/B available. */ });
  }

  return {
    setRunning(value: boolean): void {
      running = value;
      if (instrumentation) instrumentation.captureGPUFrameTime = running;
    },
    dispose(): void {
      disposed = true;
      if (instrumentation) { instrumentation.captureGPUFrameTime = false; instrumentation.dispose(); instrumentation = null; }
      if (Object.getOwnPropertyDescriptor(host, '__sceneGpuMs')?.get === read) Reflect.deleteProperty(host, '__sceneGpuMs');
    },
  };
}
