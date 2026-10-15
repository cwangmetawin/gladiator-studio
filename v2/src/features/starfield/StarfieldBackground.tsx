import { useEffect, useRef, useState } from 'react';
import { perSecond } from '@/shared/utils/frameTime';
import { createRenderLoop, shouldRunRenderLoop } from './renderLoop';
import { createStarTwinkle, type StarTwinkleData } from './starTwinkle';
import { transitionStore } from '@/shared/motion/transitionStore';
import { driftHomeCamera } from './cameraNarrative';
import { installGameSky } from './gameSkyRenderer';
import { skyStore } from './skyStore';
import { sceneReadiness } from './sceneReadiness';
import { loadSceneModule } from '@/shared/utils/preloadScene';
import { webglAvailable } from '@/shared/utils/webgl';
import { installSceneEffects } from './sceneEffects';
import { arenaQuality } from '@/features/arena/arenaQuality';
import type { Arena } from '@/features/arena/installArena';

// ─── Dynamic Babylon.js import type alias ─────────────────────────────────────
type BabylonModule = typeof import('@/shared/babylon/babylonCore');

// ─── Mobile detection ─────────────────────────────────────────────────────────
const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth <= 767;

// ─── Constants (scaled for mobile) ────────────────────────────────────────────
const STAR_COUNT = IS_MOBILE ? 1800 : 3000;
const SKY_RADIUS = 220;
// The homepage star camera; the arena owns its own dive track on the same engine.
const CAMERA_ALPHA = -Math.PI / 2;
const CAMERA_BETA = IS_MOBILE ? Math.PI / 2 : Math.PI / 2.5; // mobile: straight-on view
const CAMERA_RADIUS = IS_MOBILE ? 36 : 30;
// ─── Starfield builder ────────────────────────────────────────────────────────

function buildStarField(
  BABYLON: BabylonModule,
  scene: InstanceType<BabylonModule['Scene']>,
): InstanceType<BabylonModule['Mesh']> {
  const positions: number[] = [];
  const colors: number[] = [];
  const baseAlpha = new Float32Array(STAR_COUNT); // rest brightness per star
  const twPhase = new Float32Array(STAR_COUNT);   // twinkle phase offset
  const twSpeed = new Float32Array(STAR_COUNT);   // twinkle rate

  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = SKY_RADIUS + (Math.random() - 0.5) * 30;

    positions.push(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi),
    );

    const colorRoll = Math.random();
    let cr: number;
    let cg: number;
    let cb: number;
    let ca: number;

    if (colorRoll > 0.85) {
      // Blue-white stars
      cr = 0.7; cg = 0.8; cb = 1.0; ca = 0.6 + Math.random() * 0.4;
    } else if (colorRoll > 0.75) {
      // Warm yellow stars
      cr = 1.0; cg = 0.9; cb = 0.6; ca = 0.5 + Math.random() * 0.4;
    } else {
      // White stars (majority)
      const b = 0.4 + Math.random() * 0.6;
      cr = b; cg = b; cb = b; ca = b;
    }
    colors.push(cr, cg, cb, ca);
    baseAlpha[i] = ca;
    twPhase[i] = Math.random() * Math.PI * 2;
    twSpeed[i] = 0.6 + Math.random() * 2.2;
  }

  const starMesh = new BABYLON.Mesh('stars', scene);
  const vertexData = new BABYLON.VertexData();
  vertexData.positions = positions;

  const indices: number[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    indices.push(i);
  }
  vertexData.indices = indices;
  vertexData.applyToMesh(starMesh);
  const colorBuffer = Float32Array.from(colors);
  // Positions stay static; only the colour buffer needs uploads for twinkle.
  starMesh.setVerticesData('color', colorBuffer, true);

  const mat = new BABYLON.StandardMaterial('starMat', scene);
  mat.disableLighting = true;
  mat.emissiveColor = BABYLON.Color3.White();
  mat.diffuseColor = BABYLON.Color3.Black();
  mat.specularColor = BABYLON.Color3.Black();
  mat.pointsCloud = true;
  mat.pointSize = 2.5;
  starMesh.material = mat;
  starMesh.hasVertexAlpha = true;
  starMesh.metadata = { baseAlpha, twPhase, twSpeed, colors: colorBuffer } satisfies StarTwinkleData;

  return starMesh;
}

/** The original diffuse haze stays behind the homepage's stars. */
function buildHaze(BABYLON: BabylonModule, scene: InstanceType<BabylonModule['Scene']>) {
  // Nebula 1 — subtle purple haze
  const nebula1 = BABYLON.MeshBuilder.CreateSphere('nebula1', { diameter: 40, segments: 16 }, scene);
  nebula1.position = new BABYLON.Vector3(-60, 20, -80);
  const neb1Mat = new BABYLON.StandardMaterial('neb1Mat', scene);
  neb1Mat.emissiveColor = new BABYLON.Color3(0.06, 0.025, 0.09);
  neb1Mat.disableLighting = true;
  neb1Mat.alpha = 0.02;
  neb1Mat.backFaceCulling = false;
  nebula1.material = neb1Mat;
  // Nebula 2 — blue-teal haze
  const nebula2 = BABYLON.MeshBuilder.CreateSphere('nebula2', { diameter: 30, segments: 16 }, scene);
  nebula2.position = new BABYLON.Vector3(50, -15, -60);
  const neb2Mat = new BABYLON.StandardMaterial('neb2Mat', scene);
  neb2Mat.emissiveColor = new BABYLON.Color3(0.015, 0.04, 0.06);
  neb2Mat.disableLighting = true;
  neb2Mat.alpha = 0.015;
  neb2Mat.backFaceCulling = false;
  nebula2.material = neb2Mat;

  return { nebula1, nebula2 };
}

function buildScene(
  BABYLON: BabylonModule,
  engine: InstanceType<BabylonModule['Engine']>,
  getDeltaSeconds: () => number,
): InstanceType<BabylonModule['Scene']> {
  const scene = new BABYLON.Scene(engine);
  // Pure black space background
  scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);
  scene.ambientColor = new BABYLON.Color3(0.02, 0.02, 0.04);

  // ── Camera ─────────────────────────────────────────────────────────────────
  const camera = new BABYLON.ArcRotateCamera(
    'mainCamera',
    CAMERA_ALPHA,
    CAMERA_BETA,
    CAMERA_RADIUS,
    BABYLON.Vector3.Zero(),
    scene,
  );
  camera.detachControl();
  // Keep the existing phone composition behind the hero.
  if (IS_MOBILE) {
    camera.targetScreenOffset.y = 1.1;
  }

  // ── Lighting — reduced for deep space darkness ─────────────────────────────
  const hemisphericLight = new BABYLON.HemisphericLight(
    'ambientLight',
    new BABYLON.Vector3(0, 1, 0),
    scene,
  );
  // EXACT feeder values from SceneManager.createLights()
  hemisphericLight.intensity = 0.6;
  hemisphericLight.diffuse = new BABYLON.Color3(0.7, 0.75, 1.0);
  hemisphericLight.groundColor = new BABYLON.Color3(0.08, 0.08, 0.12);

  // Preserve the homepage directional lighting.
  const sunDir = new BABYLON.Vector3(-0.3, -0.2, 1).normalize();
  const sunLight = new BABYLON.DirectionalLight('sunLight', sunDir, scene);
  sunLight.intensity = 2.5;
  sunLight.diffuse = new BABYLON.Color3(1.0, 0.95, 0.85);

  // Rim/fill from behind-left — exact feeder values
  const rimDir = new BABYLON.Vector3(-0.8, 0.2, 0.6).normalize();
  const rimLight = new BABYLON.DirectionalLight('rimLight', rimDir, scene);
  rimLight.intensity = 0.5;
  rimLight.diffuse = new BABYLON.Color3(0.4, 0.5, 0.8);

  // ── Deep-space nebula backdrop — baked astrophotography panorama ────────────
  const nebulaBg = new BABYLON.Layer('nebulaBg', `${window.location.origin}/nebula.webp`, scene, true);
  // Dim so foreground UI reads. Keep in step with the CSS stand-in in
  // StarfieldCanvas (NebulaBackdrop), which shows this same image while Babylon loads.
  nebulaBg.color = new BABYLON.Color4(0.6, 0.6, 0.66, 1);

  // A fullscreen Layer stretches its texture to the viewport, warping the cosmos on
  // tall (portrait) screens — crop the *sampled* region via the texture matrix so it
  // always "covers" without distortion. A small extra inset leaves headroom so the
  // backdrop can drift slowly each frame (see the render loop) without baring an edge.
  const NEBULA_ASPECT = 1376 / 768;
  const NEBULA_INSET = 0.92;
  let nebUScale = NEBULA_INSET, nebVScale = NEBULA_INSET;
  const fitNebula = (): void => {
    const tex = nebulaBg.texture as InstanceType<BabylonModule['Texture']> | null;
    if (!tex) return;
    tex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    const eng = scene.getEngine();
    const screenAspect = eng.getRenderWidth() / Math.max(1, eng.getRenderHeight());
    if (screenAspect < NEBULA_ASPECT) {
      nebUScale = (screenAspect / NEBULA_ASPECT) * NEBULA_INSET; // crop sides
      nebVScale = NEBULA_INSET;
    } else {
      nebUScale = NEBULA_INSET;
      nebVScale = (NEBULA_ASPECT / screenAspect) * NEBULA_INSET; // crop top/bottom
    }
  };
  fitNebula();
  scene.getEngine().onResizeObservable.add(fitNebula);

  // ── Starfield — subtle parallax over the nebula backdrop ─────────────────────
  const starMesh = buildStarField(BABYLON, scene);
  const updateTwinkle = createStarTwinkle(starMesh.metadata as StarTwinkleData, (colors) => {
    starMesh.updateVerticesData('color', colors);
  });

  const haze = buildHaze(BABYLON, scene);
  let nebulaTime = 0;
  scene.registerBeforeRender(() => {
    const dt = getDeltaSeconds();
    // Nebula slow drift — pan the baked backdrop within its inset headroom so the
    // cosmos keeps breathing. Amplitudes stay under (1 - scale)/2 to never bare an edge.
    const nebTex = nebulaBg.texture as InstanceType<BabylonModule['Texture']> | null;
    if (nebTex) {
      nebulaTime += dt;
      nebTex.uScale = nebUScale;
      nebTex.vScale = nebVScale;
      nebTex.uOffset = (1 - nebUScale) / 2 + 0.025 * Math.sin(nebulaTime * 0.05);
      nebTex.vOffset = (1 - nebVScale) / 2 + 0.020 * Math.cos(nebulaTime * 0.04);
    }

    // Stars: gentle drift + time-based twinkle, uploaded at most 30 Hz.
    starMesh.rotation.y += perSecond(0.00010) * dt;
    updateTwinkle(dt);

    haze.nebula1.rotation.y += perSecond(0.00005) * dt;
    haze.nebula2.rotation.y -= perSecond(0.00004) * dt;
    camera.alpha = driftHomeCamera(camera.alpha, dt, IS_MOBILE);

    // Camera target fixed at origin (no mouse parallax)
  });

  installGameSky(BABYLON, scene, starMesh, nebulaBg, getDeltaSeconds);
  return scene;
}

/**
 * The engine, or null where there is no WebGL at all: the static sky and the flat emblem are then the first screen,
 * which is not an error to throw at the boundary (React logs a caught error to the console). Any other failure
 * still goes to the boundary.
 */
function createEngine(BABYLON: BabylonModule, canvas: HTMLCanvasElement, hardwareScaling: number): InstanceType<BabylonModule['Engine']> | null {
  try {
    const engine = new BABYLON.Engine(canvas, true, {
      antialias: true,
      powerPreference: 'high-performance',
      // Keep the last frame painted so the reduced-motion / hidden-tab static
      // frame survives page compositing instead of clearing to black.
      preserveDrawingBuffer: true,
    });
    engine.setHardwareScalingLevel(hardwareScaling);
    return engine;
  } catch (error) {
    if (!webglAvailable()) return null;
    throw error;
  }
}

// ─── React component ──────────────────────────────────────────────────────────

interface StarfieldBackgroundProps {
  readonly suspended: boolean;
}

export default function StarfieldBackground({ suspended }: StarfieldBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const suspendedRef = useRef(suspended);
  const syncLoopRef = useRef<(() => void) | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [failure, setFailure] = useState<Error | null>(null);

  useEffect(() => {
    suspendedRef.current = suspended;
    syncLoopRef.current?.();
  }, [suspended]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    sceneReadiness.resetScene();

    loadSceneModule().then((BABYLON) => {
      if (disposed) return;
      sceneReadiness.mark('module');

      // The 3D emblem shares this engine, so its quality tier sets the canvas's render scale: up to 1.5x the CSS
      // size, with MSAA, on a phone and on a desktop alike (see arenaQuality).
      const quality = arenaQuality(IS_MOBILE, window.devicePixelRatio || 1);
      const created = createEngine(BABYLON, canvas, quality.hardwareScaling);
      if (!created) { sceneReadiness.mark('home'); return; } // no 3D scene is coming: the age gate need not wait
      const engine = created; // (a function declaration below captures it: narrowing does not reach those)
      cleanupRef.current = () => engine.dispose();

      let dt = 0;
      let sceneReady = false;
      let frameReady = false;
      let arena: Arena | null = null;
      const scene = buildScene(BABYLON, engine, () => dt);

      // Keep the last frame when preferences, hidden tabs or full-screen
      // overlays stop the continuous render loop. The engine stays mounted.
      const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      const effects = installSceneEffects(BABYLON, scene, engine, canvas.closest<HTMLElement>('[data-trail]'), () => dt, () => motionQuery.matches);
      const getState = () => ({
        reducedMotion: motionQuery.matches,
        hidden: document.hidden,
        suspended: suspendedRef.current,
      });
      const loop = createRenderLoop({
        getState,
        getDeltaTime: () => engine.getDeltaTime(),
        render: (deltaSeconds) => {
          dt = deltaSeconds;
          effects.setRunning(shouldRunRenderLoop(getState()));
          scene.render();
          if (sceneReady && !frameReady) {
            frameReady = true;
            setRevealed(true);
            sceneReadiness.mark('frame');
          }
          // The 3D emblem draws over the finished starfield frame, and only over a complete one.
          if (sceneReady) arena?.render(deltaSeconds);
        },
        start: (render) => engine.runRenderLoop(render),
        stop: () => { effects.setRunning(false); engine.stopRenderLoop(); },
      });
      const { startLoop, renderStatic } = loop;
      canvas.dataset.cameraTarget = transitionStore.getSnapshot().target;
      const unsubscribeStaticTransition = transitionStore.subscribe(() => {
        canvas.dataset.cameraTarget = transitionStore.getSnapshot().target;
        if (motionQuery.matches && !suspendedRef.current && !document.hidden) renderStatic();
      });
      const unsubscribeStaticSky = skyStore.subscribe(() => {
        if (motionQuery.matches && !suspendedRef.current && !document.hidden) renderStatic();
      });
      syncLoopRef.current = startLoop;
      startLoop();
      motionQuery.addEventListener('change', startLoop);
      document.addEventListener('visibilitychange', startLoop);

      function handleResize(): void {
        engine.resize();
        // Resizing clears the drawing buffer, including a preserved frame.
        if (!shouldRunRenderLoop(getState()) && !suspendedRef.current && !document.hidden) renderStatic();
      }
      window.addEventListener('resize', handleResize);

      // The 3D emblem: a second scene on this engine, built from files warmed while the age gate was up. If it
      // cannot be built the flat emblem in the page stays and the first screen is released all the same.
      const hubRoot = canvas.closest<HTMLElement>('[data-trail]');
      import('@/features/arena/installArena').then(({ installArena }) => installArena(BABYLON, engine, {
        canvas, starScene: scene, root: hubRoot, phone: IS_MOBILE,
        reducedMotion: () => motionQuery.matches,
        hubVisible: () => transitionStore.getSnapshot().hubVisible,
        onReady: () => { if (!shouldRunRenderLoop(getState()) && !suspendedRef.current && !document.hidden) renderStatic(); },
        onFirstFrame: () => sceneReadiness.mark('home'),
      })).then((instance) => {
        if (disposed) { instance.dispose(); return; }
        arena = instance;
      }).catch((error: unknown) => {
        if (disposed) return;
        console.warn('[StarfieldBackground] the 3D emblem is unavailable:', error);
        if (hubRoot) hubRoot.dataset.arena = 'unavailable';
        sceneReadiness.mark('home');
      });

      // Only a render after executeWhenReady may release the normal-motion intro.
      scene.executeWhenReady(() => {
        if (disposed) return;
        sceneReady = true;
        sceneReadiness.mark('scene');
        // Reduced motion still paints its complete, preserved static frame.
        if (!suspendedRef.current && !document.hidden) renderStatic();
      });

      cleanupRef.current = () => {
        window.removeEventListener('resize', handleResize);
        motionQuery.removeEventListener('change', startLoop);
        document.removeEventListener('visibilitychange', startLoop);
        syncLoopRef.current = null;
        unsubscribeStaticTransition();
        unsubscribeStaticSky();
        loop.dispose();
        arena?.dispose();
        arena = null;
        scene.dispose();
        engine.dispose();
      };
    }).catch((err: unknown) => {
      if (disposed) return;
      console.warn('[StarfieldBackground] Babylon.js failed to load:', err);
      setFailure(err instanceof Error ? err : new Error('Scene initialization failed'));
    });

    return () => {
      disposed = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  if (failure) throw failure; // Preserve StarfieldCanvas's WebGL boundary / nebula.

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        width: '100%',
        height: '100dvh',
        pointerEvents: 'none',
        display: 'block',
        opacity: revealed ? 1 : 0,
        transition: 'opacity 0.2s ease-out',
      }}
    />
  );
}
