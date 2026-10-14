import { useEffect, useRef, useCallback, useState } from 'react';
import { sceneReadiness } from '@/features/starfield/sceneReadiness';
import { frameDeltaSeconds, perSecond } from '@/shared/utils/frameTime';
import { cappedDevicePixelRatio } from '@/shared/utils/renderResolution';
import { BRAND_SKY } from '@/shared/brand/brandSky';
import { advanceIntro, initialIntro, nextIntroDeadline, INTRO_MIN_MS, INTRO_FLASH_MS, INTRO_EXIT_MS,
  INTRO_REDUCED_FADE_MS } from '@/shared/motion/introTiming';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface WarpStar {
  x: number;     // NDC [-1, 1] from center
  y: number;     // NDC [-1, 1] from center
  z: number;     // depth [0, 1] — decreases toward viewer
  prevZ: number; // previous z for streak calculation
}

export interface WarpIntroProps {
  readonly onComplete: () => void;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const STAR_COUNT = 400;
const PHASE_WARP_FULL = 1000;

// ─── Utility helpers ───────────────────────────────────────────────────────────

function randomNDC(): number {
  return (Math.random() * 2 - 1);
}

function createStar(): WarpStar {
  const z = Math.random();
  return { x: randomNDC(), y: randomNDC(), z, prevZ: z };
}

function createStarField(): WarpStar[] {
  return Array.from({ length: STAR_COUNT }, createStar);
}

/** Map NDC [-1,1] + depth z to canvas pixel coords */
function project(
  ndcX: number,
  ndcY: number,
  z: number,
  cx: number,
  cy: number,
): { sx: number; sy: number } {
  // As z → 0, the perspective divisor shrinks → star flies outward fast
  const fov = 1.0;
  const dz = Math.max(z, 0.001);
  const sx = cx + (ndcX / (dz * fov)) * cx;
  const sy = cy + (ndcY / (dz * fov)) * cy;
  return { sx, sy };
}

/** Clamp a number between lo and hi */
function clamp(val: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, val));
}

/** Linear interpolation */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/** Ease-in quad */
function easeIn(t: number): number {
  return t * t;
}

/** Ease-out quad */
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

// ─── WarpIntro component ───────────────────────────────────────────────────────

export function WarpIntro({ onComplete }: WarpIntroProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<WarpStar[]>([]);
  if (starsRef.current.length === 0) starsRef.current = createStarField();
  const rafRef = useRef<number>(0);
  const previousFrameRef = useRef(0);
  const timingRef = useRef(initialIntro(0, false));
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const [exiting, setExiting] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const animate = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const timing = timingRef.current;
    if (timing.complete || timing.reduced) return;
    const elapsed = timestamp - timing.startedAt;
    const dt = frameDeltaSeconds(previousFrameRef.current ? timestamp - previousFrameRef.current : 1000 / 60);
    previousFrameRef.current = timestamp;
    const dpr = cappedDevicePixelRatio(window.devicePixelRatio || 1);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const cx = w / 2;
    const cy = h / 2;

    // ── Phase progress ────────────────────────────────────────────────────────
    const ramp = clamp(elapsed / PHASE_WARP_FULL, 0, 1);
    // Long loads settle into a calm hold; no flash or opacity fade before readiness.
    const hold = clamp((elapsed - INTRO_MIN_MS) / 250, 0, 1);
    const warpT = timing.exitAt === null ? lerp(ramp, 0.4, hold) : 1;
    const exitElapsed = timing.exitAt === null ? 0 : Math.max(0, timestamp - timing.exitAt);
    const flashT = clamp(exitElapsed / INTRO_FLASH_MS, 0, 1);
    const fadeT = clamp((exitElapsed - INTRO_FLASH_MS) / (INTRO_EXIT_MS - INTRO_FLASH_MS), 0, 1);

    // How fast stars zoom toward viewer (increases with warp phase)
    const speed = perSecond(lerp(0.003, 0.032, easeIn(warpT))) * dt;

    // ── Clear frame ───────────────────────────────────────────────────────────
    // Fade the last frame towards transparent, so the stars leave motion-blur trails over the
    // brand sky behind the canvas (the age gate dissolves into it; a black fill made every
    // warp frame near-black). Faster fade early (crisp points), slower at full warp (streaks).
    const trailOpacity = lerp(0.85, 0.15, easeIn(warpT));
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0, 0, 0, ${trailOpacity})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    // ── Update and draw stars ─────────────────────────────────────────────────
    const stars = starsRef.current;
    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];
      if (!star) continue;

      // Save previous z before advancing
      const prevZ = star.z;

      // Advance star toward viewer
      const newZ = star.z - speed;

      if (newZ <= 0) {
        // Star has passed viewer — respawn at back
        const respawned: WarpStar = createStar();
        respawned.z = 1;
        respawned.prevZ = 1;
        stars[i] = respawned;
        continue;
      }

      // Project current and previous positions
      const curr = project(star.x, star.y, newZ, cx, cy);
      const prev = project(star.x, star.y, prevZ, cx, cy);

      // Cull stars that have escaped the visible area
      const margin = Math.max(w, h) * 0.6;
      if (
        curr.sx < -margin || curr.sx > w + margin ||
        curr.sy < -margin || curr.sy > h + margin
      ) {
        const respawned: WarpStar = createStar();
        respawned.z = 1;
        respawned.prevZ = 1;
        stars[i] = respawned;
        continue;
      }

      // Brightness: brighter as star comes closer (z → 0)
      const proximity = 1 - newZ; // 0 (far) → 1 (close)
      const alpha = clamp(lerp(0.15, 1.0, easeOut(proximity)), 0, 1);

      // Line width: 1px far → 3px close
      const lineWidth = lerp(0.5, 3.0, easeOut(proximity));

      // Color: cyan-tinted at distance → pure white when close
      const cyanAmount = clamp(lerp(1, 0, proximity * 1.5), 0, 1);
      const r = Math.round(lerp(255, 79, cyanAmount));
      const g = Math.round(lerp(255, 195, cyanAmount));
      const b = 255;

      ctx.beginPath();
      ctx.moveTo(prev.sx, prev.sy);
      ctx.lineTo(curr.sx, curr.sy);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Update star in place with new immutable-style update
      stars[i] = { x: star.x, y: star.y, z: newZ, prevZ };
    }

    // ── Flash overlay ─────────────────────────────────────────────────────────
    if (flashT > 0) {
      const flashAlpha = easeIn(flashT);

      // Radial gradient: white center → cyan edge → transparent
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.8);
      grad.addColorStop(0, `rgba(255, 255, 255, ${flashAlpha})`);
      grad.addColorStop(0.3, `rgba(200, 240, 255, ${flashAlpha * 0.85})`);
      grad.addColorStop(0.65, `rgba(79, 195, 247, ${flashAlpha * 0.5})`);
      grad.addColorStop(1, `rgba(0, 10, 30, 0)`);

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // ── Gladiator logo at center during flash peak ────────────────────────────
    // Logo appears via CSS opacity on the overlay div — canvas only handles stars + flash

    // ── Fade-out overlay ──────────────────────────────────────────────────────
    if (fadeT > 0) {
      // The outer React div handles the CSS opacity fade via state
      // Additional white-to-transparent overlay for hard flash cut
      const fadeAlpha = easeOut(fadeT);
      ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha * 0.15})`;
      ctx.fillRect(0, 0, w, h);
    }

    rafRef.current = requestAnimationFrame(animate);
  }, []);

  // ── Canvas resize handler ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const dpr = cappedDevicePixelRatio(window.devicePixelRatio || 1);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // ── Readiness and safety own completion; drawing owns only the visual loop. ──
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    timingRef.current = initialIntro(performance.now(), preference.matches);
    previousFrameRef.current = 0;
    setExiting(false);
    let timer: number | undefined;
    const sync = (now = performance.now()): void => {
      const before = timingRef.current;
      const ready = sceneReadiness.getSnapshot();
      const next = advanceIntro(before, now, ready);
      timingRef.current = next;
      if (before.exitAt === null && next.exitAt !== null) setExiting(true);
      window.clearTimeout(timer);
      if (next.complete) {
        if (!before.complete) {
          cancelAnimationFrame(rafRef.current);
          onCompleteRef.current();
        }
        return;
      }
      const deadline = nextIntroDeadline(next, ready);
      if (deadline !== null) timer = window.setTimeout(() => sync(Math.max(deadline, performance.now())), Math.max(0, deadline - performance.now()));
    };
    const onReady = (): void => sync();
    const onPreference = (): void => {
      timingRef.current = { ...timingRef.current, reduced: preference.matches };
      setReduced(preference.matches);
      cancelAnimationFrame(rafRef.current);
      previousFrameRef.current = 0;
      if (!preference.matches && !timingRef.current.complete) rafRef.current = requestAnimationFrame(animate);
      sync();
    };
    const unsubscribe = sceneReadiness.subscribe(onReady);
    preference.addEventListener('change', onPreference);
    if (!preference.matches) rafRef.current = requestAnimationFrame(animate);
    sync();
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(rafRef.current);
      preference.removeEventListener('change', onPreference);
      unsubscribe();
    };
  }, [animate]);

  return (
    <>
      <style>{`
        @keyframes warp-container-fade {
          0%, 36% { opacity: 1; }
          100% { opacity: 0; }
        }

        @keyframes warp-reduced-fade { from { opacity: 1; } to { opacity: 0; } }

        @keyframes warp-logo-appear {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.85); }
          36%  { opacity: 1; transform: translate(-50%, -50%) scale(1.05); filter: drop-shadow(0 0 40px rgba(79,195,247,0.9)) brightness(2); }
          72%  { opacity: 1; transform: translate(-50%, -50%) scale(1.0);  filter: drop-shadow(0 0 20px rgba(79,195,247,0.6)) brightness(1.5); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(0.95); filter: none; }
        }
      `}</style>

      {/* Full-screen warp container */}
      <div
        aria-hidden="true"
        data-warp-intro=""
        data-intro-phase={exiting ? 'exiting' : 'holding'}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 90000,
          ...BRAND_SKY,
          animation: exiting ? `${reduced ? 'warp-reduced-fade' : 'warp-container-fade'} ${reduced ? INTRO_REDUCED_FADE_MS : INTRO_EXIT_MS}ms ease-out forwards` : undefined,
          pointerEvents: 'none',
        }}
      >
        {/* Star canvas */}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            display: reduced ? 'none' : 'block',
          }}
        />

        {/* Gladiator logo — appears during flash moment */}
        <img
          src="/gladiator-logo.svg"
          alt=""
          width={935}
          height={535}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 'clamp(140px, 22vw, 260px)',
            height: 'auto',
            opacity: reduced ? 1 : 0,
            transform: 'translate(-50%, -50%)',
            filter: reduced ? 'brightness(0) invert(1) drop-shadow(0 0 20px rgba(79,195,247,0.6))' : undefined,
            animation: exiting && !reduced ? `warp-logo-appear ${INTRO_EXIT_MS}ms ease-out forwards` : undefined,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      </div>
    </>
  );
}
