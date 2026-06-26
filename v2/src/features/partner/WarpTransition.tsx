import { useEffect, useRef } from 'react';

// Holographic warp into the Client Area — the same star-streak language as the
// homepage WarpIntro, shortened, with a holo-cyan flash. Pure Canvas 2D, so it
// opens NO WebGL context (no conflict with the homepage/orbit Babylon scenes).
// Reduced-motion skips straight through.

export interface WarpTransitionProps {
  readonly onComplete: () => void;
}

const STAR_COUNT = 440;
const TOTAL = 1900;
const WARP_FULL = 640;     // stars ramp to full warp speed
const FLASH_START = 1120;  // holo flash builds
const FLASH_PEAK = 1560;
const FADE_END = 1900;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);
const easeIn = (t: number) => t * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

interface Star { x: number; y: number; z: number; prevZ: number }

export function WarpTransition({ onComplete }: WarpTransitionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onCompleteRef.current(); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0, startT = 0, done = false;
    const mk = (): Star => { const z = Math.random(); return { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z, prevZ: z }; };
    const stars: Star[] = Array.from({ length: STAR_COUNT }, mk);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const project = (nx: number, ny: number, z: number, cx: number, cy: number) => {
      const dz = Math.max(z, 0.001);
      return { sx: cx + (nx / dz) * cx, sy: cy + (ny / dz) * cy };
    };

    const frame = (ts: number) => {
      if (startT === 0) startT = ts;
      const t = ts - startT;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr, h = canvas.height / dpr;
      const cx = w / 2, cy = h / 2;

      const warpT = clamp(t / WARP_FULL, 0, 1);
      const speed = lerp(0.004, 0.042, easeIn(warpT));
      const trail = lerp(0.85, 0.16, easeIn(warpT)); // motion-blur trail
      ctx.fillStyle = `rgba(5,6,9,${trail})`;
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        if (!s) continue;
        const prevZ = s.z;
        const nz = s.z - speed;
        const margin = Math.max(w, h) * 0.6;
        if (nz <= 0) { stars[i] = mk(); stars[i]!.z = 1; stars[i]!.prevZ = 1; continue; }
        const cur = project(s.x, s.y, nz, cx, cy);
        const prev = project(s.x, s.y, prevZ, cx, cy);
        if (cur.sx < -margin || cur.sx > w + margin || cur.sy < -margin || cur.sy > h + margin) { stars[i] = mk(); stars[i]!.z = 1; stars[i]!.prevZ = 1; continue; }
        const prox = 1 - nz;
        const alpha = clamp(lerp(0.14, 1, easeOut(prox)), 0, 1);
        const lw = lerp(0.5, 2.6, easeOut(prox));
        const cyan = clamp(lerp(1, 0, prox * 1.5), 0, 1); // holo cyan far → white near
        const r = Math.round(lerp(255, 128, cyan));
        const g = Math.round(lerp(255, 216, cyan));
        ctx.beginPath();
        ctx.moveTo(prev.sx, prev.sy);
        ctx.lineTo(cur.sx, cur.sy);
        ctx.strokeStyle = `rgba(${r},${g},255,${alpha})`;
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.stroke();
        stars[i] = { x: s.x, y: s.y, z: nz, prevZ };
      }

      const flashT = clamp((t - FLASH_START) / (FLASH_PEAK - FLASH_START), 0, 1);
      if (flashT > 0) {
        const a = easeIn(flashT);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.82);
        grad.addColorStop(0, `rgba(234,248,255,${a})`);
        grad.addColorStop(0.35, `rgba(128,216,255,${a * 0.85})`);
        grad.addColorStop(0.7, `rgba(79,195,247,${a * 0.45})`);
        grad.addColorStop(1, 'rgba(5,6,9,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      if (t >= FADE_END && !done) { done = true; onCompleteRef.current(); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <style>{`@keyframes warp-fade { 0% { opacity: 0; } 14% { opacity: 1; } 82% { opacity: 1; } 100% { opacity: 0; } }`}</style>
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 90000, background: '#050609', pointerEvents: 'none', animation: `warp-fade ${TOTAL}ms ease-out forwards` }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />
      </div>
    </>
  );
}
