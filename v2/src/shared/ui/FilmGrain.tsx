'use client';

import { memo, useEffect, useRef } from 'react';

// Cinematic film-grain overlay — technique adapted from a reference studio site
// (with permission): instead of randomising millions of pixels every frame, bake
// a handful of static noise frames once and cycle them. `screen` blend + a low
// opacity lifts a fine sparkle over the dark cosmos. Desktop only; off for
// reduced-motion; idles on hidden tabs.
const GRAIN_OPACITY = 0.045;
const GRAIN_DENSITY = 0.7;   // fraction of pixels lit per frame
const FRAMES = 10;           // pre-baked noise frames
const FPS = 24;

function FilmGrainImpl() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth <= 768) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0, h = 0, idx = 0, raf = 0, timer = 0, resizeTimer = 0, running = false;
    let frames: ImageData[] = [];

    const bake = (): void => {
      frames = [];
      for (let i = 0; i < FRAMES; i++) {
        const idata = ctx.createImageData(w, h);
        const buf = new Uint32Array(idata.data.buffer);
        for (let p = 0; p < buf.length; p++) {
          if (Math.random() < GRAIN_DENSITY) buf[p] = 0xffffffff; // opaque white speck
        }
        frames.push(idata);
      }
    };

    const tick = (): void => {
      if (!running) return;
      raf = 0;
      if (document.visibilityState !== 'hidden') {
        idx = (idx + 1) % FRAMES;
        const frame = frames[idx];
        if (frame) ctx.putImageData(frame, 0, 0);
      }
      timer = window.setTimeout(() => { raf = requestAnimationFrame(tick); }, 1000 / FPS);
    };

    const stop = (): void => {
      running = false;
      window.clearTimeout(timer);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    const start = (): void => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };
    const setup = (): void => {
      stop();
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      bake();
      start();
    };

    const onResize = (): void => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(setup, 160);
    };
    const onVisibility = (): void => { document.hidden ? stop() : start(); };

    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    setup();

    return () => {
      stop();
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{
        position: 'fixed', inset: 0, width: '100vw', height: '100vh',
        zIndex: 60, pointerEvents: 'none', mixBlendMode: 'screen',
        opacity: GRAIN_OPACITY, willChange: 'opacity', transform: 'translateZ(0)',
      }}
    />
  );
}

export const FilmGrain = memo(FilmGrainImpl);
