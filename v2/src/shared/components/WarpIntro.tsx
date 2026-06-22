import { useEffect, useRef, useCallback } from 'react';

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
const TOTAL_DURATION_MS = 3500;

// Phase timing (ms)
const PHASE_WARP_START = 0;
const PHASE_WARP_FULL = 1000;
const PHASE_FLASH_START = 2500;
const PHASE_FLASH_PEAK = 3000;
const PHASE_FADE_END = 3500;

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
  const starsRef = useRef<WarpStar[]>(createStarField());
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const completedRef = useRef(false);

  const animate = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (startTimeRef.current === 0) {
      startTimeRef.current = timestamp;
    }

    const elapsed = timestamp - startTimeRef.current;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const cx = w / 2;
    const cy = h / 2;

    // ── Phase progress ────────────────────────────────────────────────────────
    // warpT: 0→1 during warp ramp-up (0–1000ms)
    const warpT = clamp((elapsed - PHASE_WARP_START) / (PHASE_WARP_FULL - PHASE_WARP_START), 0, 1);
    // flashT: 0→1 during flash build (2500–3000ms)
    const flashT = clamp((elapsed - PHASE_FLASH_START) / (PHASE_FLASH_PEAK - PHASE_FLASH_START), 0, 1);
    // fadeT: 0→1 during fade-out (3000–3500ms)
    const fadeT = clamp((elapsed - PHASE_FLASH_PEAK) / (PHASE_FADE_END - PHASE_FLASH_PEAK), 0, 1);

    // How fast stars zoom toward viewer (increases with warp phase)
    const speed = lerp(0.003, 0.032, easeIn(warpT));

    // ── Clear frame ───────────────────────────────────────────────────────────
    // Use a semi-transparent black fill to create motion-blur trail effect
    // More opaque early on (crisp points), more transparent at full warp (long streaks)
    const trailOpacity = lerp(0.85, 0.15, easeIn(warpT));
    ctx.fillStyle = `rgba(0, 0, 0, ${trailOpacity})`;
    ctx.fillRect(0, 0, w, h);

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

    // ── Completion ────────────────────────────────────────────────────────────
    if (elapsed >= PHASE_FADE_END && !completedRef.current) {
      completedRef.current = true;
      onComplete();
      return;
    }

    rafRef.current = requestAnimationFrame(animate);
  }, [onComplete]);

  // ── Canvas resize handler ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // ── Start animation loop ──────────────────────────────────────────────────
  useEffect(() => {
    // Respect reduced-motion: skip the warp entirely and enter the HUD.
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onComplete();
      return;
    }
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [animate, onComplete]);

  // ── Compute overlay opacity for CSS fade (logo + container) ───────────────
  // We use a CSS animation on the wrapper via inline style driven by elapsed time.
  // Since we cannot read elapsed inside JSX easily, we use a CSS keyframe approach
  // defined inline via a <style> tag.

  return (
    <>
      <style>{`
        @keyframes warp-container-fade {
          0%   { opacity: 1; }
          72%  { opacity: 1; }   /* 2520ms — hold fully visible */
          86%  { opacity: 1; }   /* 3010ms — flash peak fully visible */
          100% { opacity: 0; }   /* 3500ms — faded out */
        }

        @keyframes warp-logo-appear {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.85); }
          70%  { opacity: 0; transform: translate(-50%, -50%) scale(0.85); }
          80%  { opacity: 1; transform: translate(-50%, -50%) scale(1.05); filter: drop-shadow(0 0 40px rgba(79,195,247,0.9)) brightness(2); }
          90%  { opacity: 1; transform: translate(-50%, -50%) scale(1.0);  filter: drop-shadow(0 0 20px rgba(79,195,247,0.6)) brightness(1.5); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(0.95); filter: none; }
        }
      `}</style>

      {/* Full-screen warp container */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 90000,
          background: '#000000',
          animation: `warp-container-fade ${TOTAL_DURATION_MS}ms ease-out forwards`,
          pointerEvents: 'none',
        }}
      >
        {/* Star canvas */}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'block',
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
            animation: `warp-logo-appear ${TOTAL_DURATION_MS}ms ease-out forwards`,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      </div>
    </>
  );
}
