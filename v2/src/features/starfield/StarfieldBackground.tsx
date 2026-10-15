import { useEffect, useRef, useState } from 'react';
import { sceneEvents } from '@/shared/utils/sceneEvents';
import { approach, approachRate, perSecond, secondsFromFrames, tweenProgress } from '@/shared/utils/frameTime';
import { createRenderLoop, shouldRunRenderLoop } from './renderLoop';
import { createStarTwinkle, type StarTwinkleData } from './starTwinkle';
import { fadeBodies } from './skyBodies';
import { transitionStore } from '@/shared/motion/transitionStore';
import { journeyMotion } from '@/features/journey/journeyMotion';
import { createCameraNarrative, panelCameraPose } from './cameraNarrative';
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
// Camera constants — push further back on mobile, center earth behind logo
const CAMERA_ALPHA = -Math.PI / 2;
const CAMERA_BETA = IS_MOBILE ? Math.PI / 2 : Math.PI / 2.5; // mobile: straight-on view, earth centered
const CAMERA_RADIUS = IS_MOBILE ? 36 : 30;
const CAMERA_FAST_RATE = approachRate(0.06);
const CAMERA_OFFSET_RATE = approachRate(0.04);
/** The planets and the sun glow leave this much faster than they come (see showBodies). */
const BODY_OUT_RATE = CAMERA_FAST_RATE * 3;
const PANEL_LIGHT_DURATION = secondsFromFrames(30);

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

// ─── Distant planets builder ─────────────────────────────────────────────────

interface PlanetMeshes {
  readonly mars: InstanceType<BabylonModule['Mesh']>;
  readonly gasGiant: InstanceType<BabylonModule['Mesh']>;
  readonly gasRing: InstanceType<BabylonModule['Mesh']>;
  readonly iceMoon: InstanceType<BabylonModule['Mesh']>;
  readonly nebula1: InstanceType<BabylonModule['Mesh']>;
  readonly nebula2: InstanceType<BabylonModule['Mesh']>;
}

function buildDistantPlanets(
  BABYLON: BabylonModule,
  scene: InstanceType<BabylonModule['Scene']>,
): PlanetMeshes {
  // Planet 1 — Small reddish Mars-like planet (far away, upper right)
  const mars = BABYLON.MeshBuilder.CreateSphere('mars', { diameter: 1.5, segments: 32 }, scene);
  mars.position = new BABYLON.Vector3(35, 12, -20);
  const marsMat = new BABYLON.StandardMaterial('marsMat', scene);
  marsMat.diffuseColor = new BABYLON.Color3(0.7, 0.3, 0.15);
  marsMat.emissiveColor = new BABYLON.Color3(0.03, 0.01, 0.005);
  marsMat.specularColor = BABYLON.Color3.Black();
  mars.material = marsMat;

  // Mars procedural surface texture
  const marsTexSize = 128;
  const marsTex = new BABYLON.DynamicTexture('marsSurfaceTex', marsTexSize, scene, true);
  const mCtx = marsTex.getContext();
  mCtx.fillStyle = '#8B4513';
  mCtx.fillRect(0, 0, marsTexSize, marsTexSize);
  for (let i = 0; i < 20; i++) {
    const cx = Math.random() * marsTexSize;
    const cy = Math.random() * marsTexSize;
    const r = 3 + Math.random() * 12;
    mCtx.beginPath();
    mCtx.arc(cx, cy, r, 0, Math.PI * 2);
    mCtx.fillStyle = `rgba(60,25,10,${0.3 + Math.random() * 0.4})`;
    mCtx.fill();
  }
  mCtx.beginPath();
  mCtx.arc(marsTexSize / 2, 5, 20, 0, Math.PI * 2);
  mCtx.fillStyle = 'rgba(200,200,220,0.3)';
  mCtx.fill();
  marsTex.update();
  marsMat.diffuseTexture = marsTex;

  // Planet 2 — Gas giant (far left, below)
  const gasGiant = BABYLON.MeshBuilder.CreateSphere('gasGiant', { diameter: 4, segments: 32 }, scene);
  gasGiant.position = new BABYLON.Vector3(-45, -8, -35);
  const gasMat = new BABYLON.StandardMaterial('gasMat', scene);
  gasMat.diffuseColor = new BABYLON.Color3(0.4, 0.35, 0.55);
  gasMat.emissiveColor = new BABYLON.Color3(0.02, 0.015, 0.03);
  gasMat.specularColor = BABYLON.Color3.Black();
  gasGiant.material = gasMat;

  // Gas giant procedural band texture (Jupiter/Saturn-like)
  const gasTexSize = 256;
  const gasTex = new BABYLON.DynamicTexture('gasSurfaceTex', gasTexSize, scene, true);
  const gCtx = gasTex.getContext() as CanvasRenderingContext2D;
  const bandColors = ['#5C4033', '#6B4F3A', '#4A3828', '#7B5F4F', '#3D2B1F', '#6B5042', '#4A3828'];
  const bandHeight = gasTexSize / bandColors.length;
  bandColors.forEach((color, i) => {
    gCtx.fillStyle = color;
    gCtx.fillRect(0, i * bandHeight, gasTexSize, bandHeight + 1);
  });
  gCtx.beginPath();
  gCtx.ellipse(gasTexSize * 0.6, gasTexSize * 0.4, 20, 12, 0, 0, Math.PI * 2);
  gCtx.fillStyle = 'rgba(180,100,60,0.6)';
  gCtx.fill();
  gasTex.update();
  gasMat.diffuseTexture = gasTex;

  // Gas giant ring — wider, more Saturn-like
  const ring = BABYLON.MeshBuilder.CreateTorus(
    'gasRing',
    { diameter: 8.0, thickness: 0.08, tessellation: 64 },
    scene,
  );
  ring.parent = gasGiant;
  ring.rotation.x = Math.PI / 3;
  const ringMat = new BABYLON.StandardMaterial('gasRingMat', scene);
  ringMat.diffuseColor = new BABYLON.Color3(0.5, 0.45, 0.6);
  ringMat.emissiveColor = new BABYLON.Color3(0.03, 0.02, 0.04);
  ringMat.alpha = 0.5;
  ringMat.backFaceCulling = false;
  ring.material = ringMat;

  // Planet 3 — Tiny ice blue moon (near earth, orbiting)
  const iceMoon = BABYLON.MeshBuilder.CreateSphere('iceMoon', { diameter: 0.6, segments: 16 }, scene);
  iceMoon.position = new BABYLON.Vector3(12, 3, 5);
  const iceMat = new BABYLON.StandardMaterial('iceMat', scene);
  iceMat.diffuseColor = new BABYLON.Color3(0.5, 0.7, 0.9);
  iceMat.emissiveColor = new BABYLON.Color3(0.02, 0.03, 0.05);
  iceMat.specularColor = BABYLON.Color3.Black();
  iceMoon.material = iceMat;

  // Procedural moon texture with craters
  const moonTexSize = 64;
  const moonTex = new BABYLON.DynamicTexture('moonTex', moonTexSize, scene, true);
  const moonCtx = moonTex.getContext();
  // Base grey surface
  moonCtx.fillStyle = '#9BA8B4';
  moonCtx.fillRect(0, 0, moonTexSize, moonTexSize);
  // Craters
  for (let i = 0; i < 30; i++) {
    const cx = Math.random() * moonTexSize;
    const cy = Math.random() * moonTexSize;
    const r = 1 + Math.random() * 5;
    moonCtx.beginPath();
    moonCtx.arc(cx, cy, r, 0, Math.PI * 2);
    moonCtx.fillStyle = `rgba(60,70,80,${0.3 + Math.random() * 0.5})`;
    moonCtx.fill();
    // Crater rim highlight
    moonCtx.beginPath();
    moonCtx.arc(cx - 0.5, cy - 0.5, r * 0.8, 0, Math.PI * 2);
    moonCtx.strokeStyle = `rgba(180,190,200,${0.2 + Math.random() * 0.2})`;
    moonCtx.lineWidth = 0.5;
    moonCtx.stroke();
  }
  moonTex.update();
  iceMat.diffuseTexture = moonTex;
  iceMat.diffuseColor = new BABYLON.Color3(0.7, 0.75, 0.8);
  iceMat.emissiveColor = new BABYLON.Color3(0.02, 0.02, 0.03);

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

  return { mars, gasGiant, gasRing: ring, iceMoon, nebula1, nebula2 };
}

// ─── Solar-system nav planets — one per section, flown into on click ──────────

interface NavPlanet {
  readonly panelId: string;
  readonly mesh: InstanceType<BabylonModule['Mesh']>;
  readonly position: InstanceType<BabylonModule['Vector3']>;
  readonly viewRadius: number;
  readonly spin: number;
  readonly ring?: InstanceType<BabylonModule['Mesh']>;
}

interface PlanetDef {
  readonly id: string; readonly d: number; readonly r: number; readonly ang: number; readonly y: number;
  readonly tex?: string;           // equirectangular surface map under /textures
  readonly earth?: boolean;        // use the real Earth photographic texture stack
  readonly ring?: boolean;         // Saturn-style equatorial ring
  readonly tint: readonly [number, number, number]; // fallback colour if the texture is missing
}

// Recognisable solar-system bodies — each is a section the camera flies into on click.
const PLANET_DEFS: readonly PlanetDef[] = [
  { id: 'journey', d: 6.5, r: 30, ang: 8,   y: -6, tex: 'planet_jupiter.webp', tint: [0.80, 0.66, 0.46] },
  { id: 'games',   d: 5.0, r: 37, ang: 212, y: 5,  tex: 'planet_saturn.webp',  ring: true, tint: [0.85, 0.75, 0.52] },
  { id: 'about',   d: 4.2, r: 20, ang: 56,  y: 6,  earth: true,               tint: [0.20, 0.42, 0.70] },
  { id: 'team',    d: 3.2, r: 16, ang: 142, y: -3, tex: 'planet_mars.webp',    tint: [0.72, 0.34, 0.20] },
  { id: 'live',    d: 4.0, r: 42, ang: 255, y: 8,  tex: 'planet_neptune.webp', tint: [0.20, 0.38, 0.80] },
  { id: 'careers', d: 3.8, r: 24, ang: 322, y: 3,  tex: 'planet_venus.webp',   tint: [0.85, 0.72, 0.45] },
  { id: 'contact', d: 2.6, r: 13, ang: 286, y: -5, tex: 'planet_moon.webp',    tint: [0.70, 0.72, 0.78] },
];

// A flat, translucent ring sheet: hundreds of fine concentric bands with edge
// fades and a dark Cassini-style gap. Drawn once, mapped onto a tilted plane.
function ringTexture(
  BABYLON: BabylonModule,
  scene: InstanceType<BabylonModule['Scene']>,
  id: string,
): InstanceType<BabylonModule['DynamicTexture']> {
  const S = 1024;
  const tex = new BABYLON.DynamicTexture('ringTex_' + id, S, scene, true);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.clearRect(0, 0, S, S);
  const cx = S / 2, cy = S / 2;
  const inner = S * 0.235; // clears the planet silhouette at plane size = d·2.4
  const outer = S * 0.49;
  c.lineWidth = 1.4;
  for (let rr = inner; rr <= outer; rr += 1) {
    const t = (rr - inner) / (outer - inner);
    let a = 0.9;
    a *= Math.min(1, t / 0.06);          // fade in at the inner edge
    a *= Math.min(1, (1 - t) / 0.10);    // fade out at the outer edge
    if (t > 0.52 && t < 0.60) a *= 0.12; // Cassini division
    if (t > 0.30 && t < 0.33) a *= 0.45; // minor gaps
    if (t > 0.78 && t < 0.80) a *= 0.55;
    a *= 0.55 + 0.45 * Math.abs(Math.sin(rr * 0.6)); // fine ringlet banding
    const shade = 178 + 42 * Math.sin(rr * 0.25);
    c.strokeStyle = `rgba(${Math.round(shade)}, ${Math.round(shade * 0.9)}, ${Math.round(shade * 0.72)}, ${a.toFixed(3)})`;
    c.beginPath();
    c.arc(cx, cy, rr, 0, Math.PI * 2);
    c.stroke();
  }
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

function buildSolarSystem(
  BABYLON: BabylonModule,
  scene: InstanceType<BabylonModule['Scene']>,
): NavPlanet[] {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const tx = (file: string) => new BABYLON.Texture(`${origin}/textures/${file}`, scene);

  return PLANET_DEFS.map((def) => {
    const rad = (def.ang * Math.PI) / 180;
    const position = new BABYLON.Vector3(Math.cos(rad) * def.r, def.y, Math.sin(rad) * def.r);
    const mesh = BABYLON.MeshBuilder.CreateSphere('nav_' + def.id, { diameter: def.d, segments: 48 }, scene);
    mesh.position = position;

    const mat = new BABYLON.StandardMaterial('navMat_' + def.id, scene);
    // Fallback colour shows through if the texture file is unavailable.
    mat.diffuseColor = new BABYLON.Color3(def.tint[0], def.tint[1], def.tint[2]);
    mat.specularColor = new BABYLON.Color3(0.06, 0.06, 0.08);
    mat.specularPower = 48;

    if (def.earth) {
      // Real Earth: day surface + bump relief + ocean specular + night city lights.
      mat.diffuseColor = BABYLON.Color3.White();
      mat.diffuseTexture = tx('earth_day.webp');
      const bump = tx('earth_bump.webp'); bump.level = 0.35; mat.bumpTexture = bump;
      mat.specularTexture = tx('earth_specular.webp');
      mat.specularColor = new BABYLON.Color3(0.25, 0.25, 0.25);
      mat.emissiveTexture = tx('earth_night_2k.webp');
      mat.emissiveColor = new BABYLON.Color3(0.42, 0.38, 0.28);
    } else if (def.tex) {
      const surface = tx(def.tex);
      mat.diffuseColor = BABYLON.Color3.White();
      mat.diffuseTexture = surface;
      // Re-use the surface as a dim self-illumination so the night side keeps its detail.
      mat.emissiveTexture = surface;
      mat.emissiveColor = new BABYLON.Color3(0.18, 0.18, 0.2);
    }
    mesh.material = mat;

    let ringMesh: InstanceType<BabylonModule['Mesh']> | undefined;
    if (def.ring) {
      // A flat translucent banded sheet on a tilted plane — reads as a real ring,
      // not a geometric donut. Standalone (not parented) so the planet's axial
      // spin can't make the symmetric ring precess.
      const ring = BABYLON.MeshBuilder.CreatePlane('navRing_' + def.id, { size: def.d * 2.4 }, scene);
      ring.position = position.clone();
      ring.rotation.x = Math.PI / 2 - 0.42; // lie ~flat, tilt ~24° toward the camera
      const rtex = ringTexture(BABYLON, scene, def.id);
      const rmat = new BABYLON.StandardMaterial('navRingMat_' + def.id, scene);
      rmat.diffuseColor = new BABYLON.Color3(0.80, 0.72, 0.55);
      rmat.diffuseTexture = rtex;
      rmat.useAlphaFromDiffuseTexture = true;
      rmat.emissiveTexture = rtex;            // self-lit so the ring reads on the night side
      rmat.emissiveColor = new BABYLON.Color3(0.42, 0.37, 0.28);
      rmat.specularColor = BABYLON.Color3.Black();
      rmat.backFaceCulling = false;
      rmat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
      ring.material = rmat;
      ringMesh = ring;
    }

    return { panelId: def.id, mesh, position, viewRadius: def.d * 2.4 + (def.ring ? 6 : 1.5), spin: perSecond(0.0007 + Math.random() * 0.0006), ring: ringMesh };
  });
}

// ─── Main scene factory ───────────────────────────────────────────────────────

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
  // On mobile, shift camera view upward so earth sits behind the hero logo (upper-center)
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

  // Sun key light — BEHIND earth. Direction (−0.3, −0.2, 1) means light goes INTO screen.
  // Camera at −Z sees the SHADOW side of earth = dark night side with city lights.
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

  // ── Distant planets + nebulas ──────────────────────────────────────────────
  const planets = buildDistantPlanets(BABYLON, scene);

  // ── Solar-system nav planets (one per section) ─────────────────────────────
  const navPlanets = buildSolarSystem(BABYLON, scene);
  const PLANET_BY_PANEL = new Map(navPlanets.map((p) => [p.panelId, p] as const));

  // ── Soft sun-core glow at the system's heart — additive billboard sprite,
  //    NOT glow-layer driven, so it stays a gentle halo (no bloom blob) ────────
  const sunTex = new BABYLON.DynamicTexture('sunGlowTex', 256, scene, true);
  const sctx = sunTex.getContext() as CanvasRenderingContext2D;
  const sunGrad = sctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  sunGrad.addColorStop(0, 'rgba(255,228,170,0.85)');
  sunGrad.addColorStop(0.22, 'rgba(255,196,110,0.45)');
  sunGrad.addColorStop(0.55, 'rgba(255,160,70,0.12)');
  sunGrad.addColorStop(1, 'rgba(255,150,60,0)');
  sctx.fillStyle = sunGrad;
  sctx.fillRect(0, 0, 256, 256);
  sunTex.update();
  sunTex.hasAlpha = true;

  const sunGlow = BABYLON.MeshBuilder.CreatePlane('sunCore', { size: 10 }, scene);
  sunGlow.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
  const sunMat = new BABYLON.StandardMaterial('sunCoreMat', scene);
  sunMat.disableLighting = true;
  sunMat.emissiveColor = BABYLON.Color3.White();
  sunMat.diffuseTexture = sunTex;
  sunMat.diffuseTexture.hasAlpha = true;
  sunMat.useAlphaFromDiffuseTexture = true;
  sunMat.alphaMode = BABYLON.Constants.ALPHA_ADD;
  sunMat.backFaceCulling = false;
  sunGlow.material = sunMat;

  // The adapter snapshots the real Babylon pose whenever the shared request changes.
  let focalPanelId = 'none';
  let cameraHasPanel = false;
  const homePose = { alpha: CAMERA_ALPHA, beta: CAMERA_BETA, radius: CAMERA_RADIUS, x: 0, y: 0, z: 0, screenX: 0 };
  const cameraNarrative = createCameraNarrative({
    read: () => ({ alpha: camera.alpha, beta: camera.beta, radius: camera.radius,
      x: camera.target.x, y: camera.target.y, z: camera.target.z, screenX: camera.targetScreenOffset.x }),
    write: pose => {
      camera.alpha = pose.alpha;
      camera.beta = pose.beta;
      camera.radius = pose.radius;
      camera.target.set(pose.x, pose.y, pose.z);
      camera.targetScreenOffset.x = pose.screenX;
    },
    target: panel => {
      const planet = PLANET_BY_PANEL.get(panel);
      return panelCameraPose(panel, homePose, planet ? {
        x: planet.position.x, y: planet.position.y, z: planet.position.z, radius: planet.viewRadius,
      } : undefined);
    },
    journey: journeyMotion.getSnapshot,
    isPhone: () => window.innerWidth <= 767,
  });

  // ── Panel glow colors — one per panelId ─────────────────────────────────────
  const PANEL_GLOW_COLORS: Record<string, string> = {
    games:   '#ffd54f',
    about:   '#4fc3f7',
    team:    '#ef5350',
    journey: '#b39ddb',
    live:    '#66bb6a',
    careers: '#ff8a65',
    contact: '#90a4ae',
  };

  // ── Active holographic frame — disposed on each panel change ────────────────
  // Active panel light — colored point light only, no ugly frame meshes
  let activePanelLight: InstanceType<BabylonModule['PointLight']> | null = null;
  let panelLightElapsed = 0;

  let cameraRevision = -1;
  const syncCameraTarget = () => {
    const state = transitionStore.getSnapshot();
    if (cameraRevision === state.revision) return;
    cameraRevision = state.revision;
    cameraNarrative.sync(state);
    if (state.mode === 'phone' || window.innerWidth <= 767) return;
    const panelId = state.target === 'games' ? 'cosmos' : state.target;
    focalPanelId = panelId;
    cameraHasPanel = panelId !== 'none';

    // ── Clean up previous light ──────────────────────────────────────────────
    if (activePanelLight) {
      activePanelLight.dispose();
      activePanelLight = null;
    }

    if (panelId === 'none') return;

    // ── Colored point light that illuminates the scene ───────────────────────
    const LEFT_PANELS = new Set(['games', 'about', 'team', 'journey']);
    const isLeft = LEFT_PANELS.has(panelId);
    const glowHex = PANEL_GLOW_COLORS[panelId] ?? '#4fc3f7';
    const lightColor = BABYLON.Color3.FromHexString(glowHex);

    const light = new BABYLON.PointLight(
      'panelGlow_' + Date.now(),
      new BABYLON.Vector3(isLeft ? -6 : 6, 2, 4),
      scene,
    );
    light.diffuse = lightColor;
    light.specular = lightColor;
    light.intensity = state.mode === 'reduced' ? 0.4 : 0;
    light.range = 20;
    activePanelLight = light;
    panelLightElapsed = 0;

    if (state.mode === 'reduced') return;

    // ── Particle burst at camera direction ────────────────────────────────────
    const ps = new BABYLON.ParticleSystem('panelBurst_' + Date.now(), 80, scene);
    ps.emitter = new BABYLON.Vector3(isLeft ? -4 : 4, 0, 3);
    ps.minEmitBox = new BABYLON.Vector3(-2, -2, -1);
    ps.maxEmitBox = new BABYLON.Vector3(2, 2, 1);
    ps.color1 = new BABYLON.Color4(lightColor.r, lightColor.g, lightColor.b, 0.8);
    ps.color2 = new BABYLON.Color4(lightColor.r * 0.7, lightColor.g * 0.7, lightColor.b * 0.7, 0.5);
    ps.colorDead = new BABYLON.Color4(0, 0, 0, 0);
    ps.minSize = 0.03;
    ps.maxSize = 0.12;
    ps.minLifeTime = 0.3;
    ps.maxLifeTime = 0.6;
    ps.emitRate = 300;
    ps.minEmitPower = 3;
    ps.maxEmitPower = 8;
    ps.updateSpeed = 0.02;
    ps.targetStopDuration = 0.4;
    ps.disposeOnStop = true;
    ps.start();
  };
  const unsubscribeCameraTarget = transitionStore.subscribe(syncCameraTarget);
  syncCameraTarget();

  // ── Planets and sun glow: out of the picture at home, in for a panel's camera flight ──────────────────────
  // (Phones never fly a camera, so they never show them: their panels cover the scene.) Each nav planet is its
  // own group (with its ring), so only the focal one comes in; the distant bodies and the sun glow come in together.
  const navGroups = navPlanets.map(p => ({ planet: p, meshes: p.ring ? [p.mesh, p.ring] : [p.mesh] }));
  const distantBodies = [planets.mars, planets.gasGiant, planets.gasRing, planets.iceMoon];
  // They come in at the camera's pace and go out three times as fast, so nothing lingers once the emblem is back.
  const fadeGroup = (meshes: readonly InstanceType<BabylonModule['Mesh']>[], shown: boolean, dt: number, instant: boolean): void => {
    fadeBodies(meshes, shown ? 1 : 0, shown ? CAMERA_FAST_RATE : BODY_OUT_RATE, dt, instant);
  };
  const showBodies = (dt: number, instant: boolean): void => {
    for (const { planet, meshes } of navGroups) fadeGroup(meshes, cameraHasPanel && planet.panelId === focalPanelId, dt, instant);
    fadeGroup(distantBodies, cameraHasPanel, dt, instant);
    fadeGroup([sunGlow], cameraHasPanel, dt, instant);
  };
  showBodies(0, true); // the very first frame is already the home picture

  // ── Blackhole effect state ────────────────────────────────────────────────
  let blackholeActive = false;
  let wasBlackhole = false;
  let blackholeProgress = 0; // 0 = normal, 1 = full blackhole
  const BLACKHOLE_SPEED = perSecond(0.015); // ~1.1s to full effect

  const unsubscribeBlackhole = sceneEvents.onBlackhole((active) => {
    blackholeActive = active;
  });

  scene.onDisposeObservable.addOnce(() => { unsubscribeCameraTarget(); unsubscribeBlackhole(); });

  // ── Render loop ────────────────────────────────────────────────────────────
  let nebulaTime = 0;
  let moonOrbitAngle = performance.now() * 0.00005;
  scene.registerBeforeRender(() => {
    const dt = getDeltaSeconds();
    // ── Blackhole effect — camera zooms in, scene darkens, stars compress ───
    if (blackholeActive && blackholeProgress < 1) {
      blackholeProgress = Math.min(1, blackholeProgress + BLACKHOLE_SPEED * dt);
    } else if (!blackholeActive && blackholeProgress > 0) {
      blackholeProgress = Math.max(0, blackholeProgress - BLACKHOLE_SPEED * 0.7 * dt);
    }
    if (blackholeProgress > 0.001) {
      wasBlackhole = true;
      const t = blackholeProgress;
      // Ease-in: slow start then explosive acceleration
      const eased = t * t;
      const extreme = t * t * t;

      // ── DEEP SPACE DEPARTURE — camera flies away from earth into the void ──

      // Camera pulls BACK — radius explodes outward into deep space
      const targetRadius = 18 + extreme * 200; // 18 → 218
      camera.radius = approach(camera.radius, targetRadius, CAMERA_FAST_RATE, dt);
      // FOV narrows slightly — tunnel vision into the void
      camera.fov = 0.8 - eased * 0.3;

      // Stars stretch as we accelerate through them
      if (starMesh) {
        const stretch = 1 + extreme * 5;
        starMesh.scaling.set(stretch, stretch, stretch);
        // Stars fade — we're leaving them behind
        starMesh.visibility = Math.max(0, 1 - extreme * 1.5);
      }

      // Earth gets tiny — we're flying away from it
      // (earth stays at origin, camera moves away)

      // Scene goes pitch black — deep space void
      const dark = Math.max(0, 1 - eased * 2);
      scene.clearColor = new BABYLON.Color4(
        0.02 * dark,
        0.02 * dark,
        0.04 * dark,
        1,
      );

      // Brief blue flash at 30-50% — passing through atmosphere
      if (t > 0.2 && t < 0.5) {
        const flash = Math.sin((t - 0.2) / 0.3 * Math.PI);
        scene.clearColor = new BABYLON.Color4(
          flash * 0.03,
          flash * 0.06,
          flash * 0.15,
          1,
        );
      }

    } else if (blackholeProgress <= 0.001 && camera.fov < 0.79) {
      // ── RETURN from deep space — fly back to earth ──
      camera.fov = approach(camera.fov, 0.8, CAMERA_OFFSET_RATE, dt);
      scene.clearColor = new BABYLON.Color4(0.02, 0.02, 0.04, 1);
      if (starMesh) { starMesh.scaling.setAll(1); starMesh.visibility = 1; }
    }

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

    // Distant planet rotations
    planets.mars.rotation.y += perSecond(0.0003) * dt;
    planets.gasGiant.rotation.y += perSecond(0.00015) * dt;
    planets.iceMoon.rotation.y += perSecond(0.0008) * dt;

    // Solar-system nav planets spin. Only the framed planet is in the picture, and only while a panel's camera
    // flight has it (no others crowding the close-up; none at home, where the emblem has the stage).
    for (const p of navPlanets) p.mesh.rotation.y += p.spin * dt;
    showBodies(dt, transitionStore.getSnapshot().mode === 'reduced');

    // Ice moon orbits earth
    moonOrbitAngle += 0.05 * dt;
    planets.iceMoon.position.x = 12 * Math.cos(moonOrbitAngle);
    planets.iceMoon.position.z = 12 * Math.sin(moonOrbitAngle);

    // Nebulas slow drift rotation
    planets.nebula1.rotation.y += perSecond(0.00005) * dt;
    planets.nebula2.rotation.y -= perSecond(0.00004) * dt;

    // The timed flight shares React's clock. Journey alone uses a reversible scrub.
    if (!blackholeActive && blackholeProgress <= 0.001) {
      if (wasBlackhole) {
        cameraNarrative.resume(transitionStore.getSnapshot(), performance.now());
        wasBlackhole = false;
      }
      cameraNarrative.update(transitionStore.getSnapshot(), performance.now(), dt);
    }

    // Fade the current panel light over the original 30/60 = 0.5 seconds.
    if (activePanelLight && panelLightElapsed < PANEL_LIGHT_DURATION) {
      panelLightElapsed = Math.min(PANEL_LIGHT_DURATION, panelLightElapsed + dt);
      activePanelLight.intensity = 0.4 * tweenProgress(panelLightElapsed, PANEL_LIGHT_DURATION);
    }

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
