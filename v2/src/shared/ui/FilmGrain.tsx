'use client';

import { memo, useEffect, useRef } from 'react';
import { grainBufferLayout } from './grainBuffers';

// Cinematic film-grain overlay — technique adapted from a reference studio site
// (with permission): instead of randomising millions of pixels every frame, bake
// a handful of fixed noise tiles once and cycle repeating patterns. `screen` blend + a low
// opacity lifts a fine sparkle over the dark cosmos. Desktop only; off for
// reduced-motion; idles on hidden tabs.
const GRAIN_OPACITY = 0.045;
const GRAIN_DENSITY = 0.7;   // fraction of pixels lit per frame
const FPS = 24;

function FilmGrainImpl() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0, h = 0, idx = 0, raf = 0, timer = 0, resizeTimer = 0, running = false;
    const layout = grainBufferLayout(window.innerWidth, window.innerHeight);
    let frames: CanvasPattern[] = [];

    const bake = (): void => {
      if (frames.length) return;
      for (let i = 0; i < layout.frameCount; i++) {
        const tile = document.createElement('canvas');
        tile.width = layout.width;
        tile.height = layout.height;
        const tileCtx = tile.getContext('2d');
        if (!tileCtx) continue;
        const idata = tileCtx.createImageData(layout.width, layout.height);
        const buf = new Uint32Array(idata.data.buffer);
        for (let p = 0; p < buf.length; p++) {
          if (Math.random() < GRAIN_DENSITY) buf[p] = 0xffffffff; // opaque white speck
        }
        tileCtx.putImageData(idata, 0, 0);
        const pattern = ctx.createPattern(tile, 'repeat');
        if (pattern) frames.push(pattern);
      }
    };

    const tick = (): void => {
      if (!running) return;
      raf = 0;
      if (document.visibilityState !== 'hidden') {
        idx = (idx + 1) % frames.length;
        const frame = frames[idx];
        if (frame) {
          // Clear transparent specks so successive patterns never accumulate.
          ctx.clearRect(0, 0, w, h);
          ctx.save();
          ctx.translate(-Math.floor(Math.random() * layout.width), -Math.floor(Math.random() * layout.height));
          ctx.fillStyle = frame;
          ctx.fillRect(0, 0, w + layout.width, h + layout.height);
          ctx.restore();
        }
      }
      timer = window.setTimeout(() => { raf = requestAnimationFrame(tick); }, 1000 / FPS);
    };

    const stop = (): void => {
      running = false;
      window.clearTimeout(timer);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    const start = (): void => {
      if (running || document.hidden || w <= 768 || motionQuery.matches || !frames.length) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };
    const setup = (): void => {
      stop();
      const enabled = window.innerWidth > 768 && !motionQuery.matches;
      w = canvas.width = enabled ? window.innerWidth : 0;
      h = canvas.height = enabled ? window.innerHeight : 0;
      ctx.clearRect(0, 0, w, h);
      if (!enabled) return;
      bake();
      start();
    };

    const onResize = (): void => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(setup, 160);
    };
    const onVisibility = (): void => { if (document.hidden) stop(); else start(); };

    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    motionQuery.addEventListener('change', setup);
    setup();

    return () => {
      stop();
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      motionQuery.removeEventListener('change', setup);
      frames = [];
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
