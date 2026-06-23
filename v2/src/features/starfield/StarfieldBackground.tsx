import { useEffect, useRef, useState } from 'react';
import { sceneEvents } from '@/shared/utils/sceneEvents';
import { soundEngine } from '@/shared/utils/soundEngine';

// ─── Dynamic Babylon.js import type alias ─────────────────────────────────────
type BabylonModule = typeof import('@babylonjs/core');

// ─── Mobile detection ─────────────────────────────────────────────────────────
const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth <= 767;

// ─── Constants (scaled for mobile) ────────────────────────────────────────────
const STAR_COUNT = IS_MOBILE ? 1800 : 3000;
const SKY_RADIUS = 220;
const EARTH_RADIUS = IS_MOBILE ? 3.5 : 5;
const EARTH_SEGMENTS = IS_MOBILE ? 32 : 64;
const EARTH_ROTATION_SPEED = 0.0002;
const ATMOSPHERE_SCALE = 1.025;

// Orbital ring constants
const RING_RADIUS = IS_MOBILE ? 5.5 : 7.5;
const RING_TILT_DEG = 23.4;
const RING_TILT_RAD = (RING_TILT_DEG * Math.PI) / 180;
const RING_ROTATION_SPEED = 0.0008;

// Camera constants — push further back on mobile, center earth behind logo
const CAMERA_ALPHA = -Math.PI / 2;
const CAMERA_BETA = IS_MOBILE ? Math.PI / 2 : Math.PI / 2.5; // mobile: straight-on view, earth centered
const CAMERA_RADIUS = IS_MOBILE ? 36 : 30;
const CAMERA_AUTO_ROTATE = IS_MOBILE ? 0.00035 : 0.00060; // idle drift through the cosmos
const CAMERA_PANEL_DRIFT  = 0.00040; // gentle orbit kept alive while a planet is framed
const CAMERA_LERP_SPEED = 0.02;

// Per-panel camera fly-to targets (alpha, beta, radius for ArcRotateCamera)
const MOBILE_ZOOM = IS_MOBILE ? 4 : 0; // extra distance on mobile
const CAMERA_TARGETS: Record<string, { readonly alpha: number; readonly beta: number; readonly radius: number }> = {
  'none':    { alpha: CAMERA_ALPHA,  beta: CAMERA_BETA, radius: (IS_MOBILE ? 36 : 30) },
  'games':   { alpha: -0.5,          beta: Math.PI / 3,   radius: 14 + MOBILE_ZOOM },
  'about':   { alpha: 0.8,           beta: Math.PI / 2.2, radius: 16 + MOBILE_ZOOM },
  'team':    { alpha: -1.2,          beta: Math.PI / 2.8, radius: 15 + MOBILE_ZOOM },
  'journey': { alpha: 1.5,           beta: Math.PI / 3.5, radius: 20 + MOBILE_ZOOM },
  'live':    { alpha: 0,             beta: Math.PI / 4,   radius: 12 + MOBILE_ZOOM },
  'careers': { alpha: -0.8,          beta: Math.PI / 2,   radius: 22 + MOBILE_ZOOM },
  'contact': { alpha: 0.3,           beta: Math.PI / 1.8, radius: 16 + MOBILE_ZOOM },
};

// Atmosphere inline shaders
const ATMOSPHERE_VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 worldViewProjection;
uniform mat4 world;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
void main() {
  gl_Position = worldViewProjection * vec4(position, 1.0);
  vWorldNormal = normalize((world * vec4(normal, 0.0)).xyz);
  vWorldPos = (world * vec4(position, 1.0)).xyz;
}
`;

const ATMOSPHERE_FRAGMENT_SHADER = `
precision highp float;
uniform vec3 eyePosition;
uniform vec3 glowColor;
uniform float glowIntensity;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
void main() {
  vec3 viewDir = normalize(eyePosition - vWorldPos);
  float NdotV = max(dot(vWorldNormal, viewDir), 0.0);
  if (NdotV > 0.45) discard;
  float rim = 1.0 - NdotV;
  float edge = pow(rim, 3.5) * glowIntensity;
  float mask = smoothstep(0.55, 1.0, rim);
  float total = edge * mask;
  gl_FragColor = vec4(glowColor * total, total * 0.4);
}
`;

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
  vertexData.colors = colors;

  const indices: number[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    indices.push(i);
  }
  vertexData.indices = indices;
  vertexData.applyToMesh(starMesh);

  const mat = new BABYLON.StandardMaterial('starMat', scene);
  mat.disableLighting = true;
  mat.emissiveColor = BABYLON.Color3.White();
  mat.diffuseColor = BABYLON.Color3.Black();
  mat.specularColor = BABYLON.Color3.Black();
  mat.pointsCloud = true;
  mat.pointSize = 2.5;
  starMesh.material = mat;
  starMesh.hasVertexAlpha = true;
  starMesh.metadata = { baseAlpha, twPhase, twSpeed, colors: Float32Array.from(colors) };

  return starMesh;
}

// ─── Earth sphere builder ─────────────────────────────────────────────────────

interface EarthMeshes {
  readonly sphere: InstanceType<BabylonModule['Mesh']>;
  readonly cloudSphere: InstanceType<BabylonModule['Mesh']>;
}

function buildEarth(
  BABYLON: BabylonModule,
  scene: InstanceType<BabylonModule['Scene']>,
): EarthMeshes {
  const sphere = BABYLON.MeshBuilder.CreateSphere(
    'earth',
    { diameter: EARTH_RADIUS * 2, segments: EARTH_SEGMENTS },
    scene,
  );

  const earthMat = new BABYLON.StandardMaterial('earthMaterial', scene);

  const dayTexture = new BABYLON.Texture(`${window.location.origin}/textures/earth_day.jpg`, scene);
  earthMat.diffuseTexture = dayTexture;

  const nightTexture = new BABYLON.Texture(`${window.location.origin}/textures/earth_night_2k.jpg`, scene);
  earthMat.emissiveTexture = nightTexture;
  earthMat.emissiveColor = new BABYLON.Color3(0.08, 0.06, 0.03);

  const bumpTexture = new BABYLON.Texture(`${window.location.origin}/textures/earth_topology.png`, scene);
  earthMat.bumpTexture = bumpTexture;
  earthMat.bumpTexture.level = 0.5;

  earthMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.35);
  earthMat.specularPower = 24;

  sphere.material = earthMat;
  sphere.rotation.x = Math.PI;

  const cloudSphere = BABYLON.MeshBuilder.CreateSphere(
    'clouds',
    { diameter: EARTH_RADIUS * 2.02, segments: 48 },
    scene,
  );

  const cloudMat = new BABYLON.StandardMaterial('cloudMaterial', scene);
  const cloudTexture = new BABYLON.Texture(`${window.location.origin}/textures/earth_clouds.png`, scene);
  cloudTexture.hasAlpha = true;

  cloudMat.diffuseTexture = cloudTexture;
  cloudMat.opacityTexture = cloudTexture;
  cloudMat.specularColor = BABYLON.Color3.Black();
  cloudMat.backFaceCulling = true;
  cloudMat.alpha = 0.04;
  cloudSphere.material = cloudMat;
  cloudSphere.rotation.x = Math.PI;

  return { sphere, cloudSphere };
}

// ─── Atmosphere builder ───────────────────────────────────────────────────────

function buildAtmosphere(
  BABYLON: BabylonModule,
  scene: InstanceType<BabylonModule['Scene']>,
): InstanceType<BabylonModule['ShaderMaterial']> {
  const diameter = EARTH_RADIUS * 2 * ATMOSPHERE_SCALE;

  const mesh = BABYLON.MeshBuilder.CreateSphere(
    'atmosphere',
    { diameter, segments: 48 },
    scene,
  );

  BABYLON.Effect.ShadersStore['atmosphereVertexShader'] = ATMOSPHERE_VERTEX_SHADER;
  BABYLON.Effect.ShadersStore['atmosphereFragmentShader'] = ATMOSPHERE_FRAGMENT_SHADER;

  const material = new BABYLON.ShaderMaterial(
    'atmosphereMaterial',
    scene,
    { vertex: 'atmosphere', fragment: 'atmosphere' },
    {
      attributes: ['position', 'normal'],
      uniforms: ['worldViewProjection', 'world', 'eyePosition', 'glowColor', 'glowIntensity'],
      needAlphaBlending: true,
    },
  );

  material.setColor3('glowColor', new BABYLON.Color3(0.15, 0.25, 0.8));
  material.setFloat('glowIntensity', 0.8);
  material.backFaceCulling = true;
  material.alphaMode = BABYLON.Constants.ALPHA_ADD;

  mesh.material = material;

  return material;
}

// ─── Orbital ring builder ─────────────────────────────────────────────────────

interface OrbitalRingResult {
  readonly container: InstanceType<BabylonModule['TransformNode']>;
  readonly bands: ReadonlyArray<{
    readonly mesh: InstanceType<BabylonModule['Mesh']>;
    readonly material: InstanceType<BabylonModule['StandardMaterial']>;
    readonly rotationOffset: number;
  }>;
  readonly energyNodes: ReadonlyArray<{
    readonly mesh: InstanceType<BabylonModule['Mesh']>;
    angle: number;
    readonly speed: number;
    readonly radius: number;
  }>;
}

function buildOrbitalRing(
  BABYLON: BabylonModule,
  scene: InstanceType<BabylonModule['Scene']>,
): OrbitalRingResult {
  const container = new BABYLON.TransformNode('orbitalRingContainer', scene);
  container.rotation.x = RING_TILT_RAD;

  const bandConfigs = [
    { radius: RING_RADIUS,        tube: 0.018, alpha: 0.15,  speedMul:  1.0, color: '#4da6ff' },
    { radius: RING_RADIUS - 0.25, tube: 0.006, alpha: 0.08,  speedMul:  1.3, color: '#60b0ff' },
    { radius: RING_RADIUS + 0.25, tube: 0.006, alpha: 0.08,  speedMul:  0.7, color: '#7b8cff' },
    { radius: RING_RADIUS,        tube: 0.12,  alpha: 0.025, speedMul:  1.0, color: '#3388dd' },
    { radius: RING_RADIUS + 0.6,  tube: 0.004, alpha: 0.05,  speedMul: -0.5, color: '#9966ff' },
  ] as const;

  const bands: Array<{
    mesh: InstanceType<BabylonModule['Mesh']>;
    material: InstanceType<BabylonModule['StandardMaterial']>;
    rotationOffset: number;
  }> = [];

  for (let i = 0; i < bandConfigs.length; i++) {
    const cfg = bandConfigs[i];
    if (!cfg) continue;
    const mesh = BABYLON.MeshBuilder.CreateTorus(
      'ringBand_' + i,
      { diameter: cfg.radius * 2, thickness: cfg.tube * 2, tessellation: 128 },
      scene,
    );
    mesh.parent = container;

    const mat = new BABYLON.StandardMaterial('ringBandMat_' + i, scene);
    mat.emissiveColor = BABYLON.Color3.FromHexString(cfg.color);
    mat.diffuseColor = BABYLON.Color3.Black();
    mat.specularColor = BABYLON.Color3.Black();
    mat.disableLighting = true;
    mat.alpha = cfg.alpha;
    mat.backFaceCulling = false;
    mesh.material = mat;

    bands.push({ mesh, material: mat, rotationOffset: cfg.speedMul });
  }

  const nodeCount = 12;
  const energyNodes: Array<{
    mesh: InstanceType<BabylonModule['Mesh']>;
    angle: number;
    speed: number;
    radius: number;
  }> = [];

  for (let i = 0; i < nodeCount; i++) {
    const angle = (i / nodeCount) * Math.PI * 2;
    const radius = RING_RADIUS + (Math.random() - 0.5) * 0.4;
    const speed = RING_ROTATION_SPEED * (1.5 + Math.random() * 1.5) * (Math.random() > 0.5 ? 1 : -1);
    const size = 0.03 + Math.random() * 0.04;

    const mesh = BABYLON.MeshBuilder.CreateSphere(
      'energyNode_' + i,
      { diameter: size, segments: 6 },
      scene,
    );
    mesh.parent = container;

    const mat = new BABYLON.StandardMaterial('energyNodeMat_' + i, scene);
    mat.emissiveColor = BABYLON.Color3.Lerp(
      BABYLON.Color3.FromHexString('#4da6ff'),
      BABYLON.Color3.White(),
      0.6,
    );
    mat.disableLighting = true;
    mat.alpha = 0.8;
    mesh.material = mat;

    mesh.position.set(
      Math.cos(angle) * radius,
      0,
      Math.sin(angle) * radius,
    );

    energyNodes.push({ mesh, angle, speed, radius });
  }

  return { container, bands, energyNodes };
}

// ─── Distant planets builder ─────────────────────────────────────────────────

interface PlanetMeshes {
  readonly mars: InstanceType<BabylonModule['Mesh']>;
  readonly gasGiant: InstanceType<BabylonModule['Mesh']>;
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

  return { mars, gasGiant, iceMoon, nebula1, nebula2 };
}

// ─── Solar-system nav planets — one per section, flown into on click ──────────

interface NavPlanet {
  readonly panelId: string;
  readonly mesh: InstanceType<BabylonModule['Mesh']>;
  readonly position: InstanceType<BabylonModule['Vector3']>;
  readonly viewRadius: number;
  readonly spin: number;
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
  { id: 'journey', d: 6.5, r: 30, ang: 8,   y: -6, tex: 'planet_jupiter.jpg', tint: [0.80, 0.66, 0.46] },
  { id: 'games',   d: 5.0, r: 37, ang: 212, y: 5,  tex: 'planet_saturn.jpg',  ring: true, tint: [0.85, 0.75, 0.52] },
  { id: 'about',   d: 4.2, r: 20, ang: 56,  y: 6,  earth: true,               tint: [0.20, 0.42, 0.70] },
  { id: 'team',    d: 3.2, r: 16, ang: 142, y: -3, tex: 'planet_mars.jpg',    tint: [0.72, 0.34, 0.20] },
  { id: 'live',    d: 4.0, r: 42, ang: 255, y: 8,  tex: 'planet_neptune.png', tint: [0.20, 0.38, 0.80] },
  { id: 'careers', d: 3.8, r: 24, ang: 322, y: 3,  tex: 'planet_venus.jpg',   tint: [0.85, 0.72, 0.45] },
  { id: 'contact', d: 2.6, r: 13, ang: 286, y: -5, tex: 'planet_moon.png',    tint: [0.70, 0.72, 0.78] },
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
      mat.diffuseTexture = tx('earth_day.jpg');
      const bump = tx('earth_bump.png'); bump.level = 0.35; mat.bumpTexture = bump;
      mat.specularTexture = tx('earth_specular.png');
      mat.specularColor = new BABYLON.Color3(0.25, 0.25, 0.25);
      mat.emissiveTexture = tx('earth_night_2k.jpg');
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
    }

    return { panelId: def.id, mesh, position, viewRadius: def.d * 2.4 + (def.ring ? 6 : 1.5), spin: 0.0007 + Math.random() * 0.0006 };
  });
}

// ─── Main scene factory ───────────────────────────────────────────────────────

function buildScene(
  BABYLON: BabylonModule,
  engine: InstanceType<BabylonModule['Engine']>,
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

  // ── GlowLayer — exact feeder ───────────────────────────────────────────────
  const glowLayer = new BABYLON.GlowLayer('earthGlow', scene, {
    blurKernelSize: 16,
    mainTextureRatio: 0.25,
  });
  glowLayer.intensity = 0.4;
  // ONLY glow meshes with metadata.glowEnabled — prevents bleeding light across scene
  glowLayer.customEmissiveColorSelector = (
    mesh: InstanceType<BabylonModule['AbstractMesh']>,
    _subMesh: InstanceType<BabylonModule['SubMesh']>,
    _material: InstanceType<BabylonModule['Material']>,
    result: InstanceType<BabylonModule['Color4']>,
  ) => {
    if ((mesh.metadata as Record<string, unknown> | null)?.glowEnabled) {
      const mat = mesh.material as InstanceType<BabylonModule['StandardMaterial']> | null;
      if (mat && 'emissiveColor' in mat) {
        const alpha = mat.alpha ?? 1.0;
        result.set(mat.emissiveColor.r, mat.emissiveColor.g, mat.emissiveColor.b, alpha * 0.5);
      } else {
        result.set(0, 0, 0, 0);
      }
    } else {
      result.set(0, 0, 0, 0);
    }
  };

  // ── Deep-space nebula backdrop — baked astrophotography panorama ────────────
  const nebulaBg = new BABYLON.Layer('nebulaBg', `${window.location.origin}/nebula.png`, scene, true);
  nebulaBg.color = new BABYLON.Color4(0.6, 0.6, 0.66, 1); // dim so foreground UI reads

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

  // ── Earth + clouds — retired: built but hidden (superseded by the gold
  //    gladiator galactic core). Refs kept so the render loop stays safe. ─────
  const { sphere: earthSphere, cloudSphere } = buildEarth(BABYLON, scene);
  earthSphere.setEnabled(false);
  cloudSphere.setEnabled(false);

  // ── Atmosphere shader — hidden with the earth ──────────────────────────────
  const atmosphereMaterial = buildAtmosphere(BABYLON, scene);
  const atmosphereMesh = scene.getMeshByName('atmosphere') as InstanceType<BabylonModule['Mesh']> | null;
  if (atmosphereMesh) atmosphereMesh.setEnabled(false);

  // ── Orbital ring — hidden with the earth ───────────────────────────────────
  const orbitalRing = buildOrbitalRing(BABYLON, scene);
  for (const band of orbitalRing.bands) band.mesh.setEnabled(false);
  for (const node of orbitalRing.energyNodes) node.mesh.setEnabled(false);


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

  // ── Effects container — rotates with earth so beams stick to surface ───────
  const effectsContainer = new BABYLON.TransformNode('effectsContainer', scene);

  // ── Earth entry animation — start at near-zero scale ──────────────────────
  earthSphere.scaling.setAll(0.01);
  cloudSphere.scaling.setAll(0.01);
  if (atmosphereMesh) atmosphereMesh.scaling.setAll(0.01);
  effectsContainer.scaling.setAll(0.01);

  // ── Live-win sparkles ───────────────────────────────────────────────────────
  // Every live win used to fire a beam on the Earth; now each one is born as a
  // twinkling star somewhere out in the cosmos, then fades. Bigger wins burn
  // brighter, larger and longer (cyan → gold → red).
  const SPARKLE_CYAN = new BABYLON.Color3(0.55, 0.85, 1.0);
  const SPARKLE_GOLD = new BABYLON.Color3(1.0, 0.85, 0.45);
  const SPARKLE_RED  = new BABYLON.Color3(1.0, 0.45, 0.4);

  // One shared 4-point star-flare texture for every sparkle (drawn once).
  const sparkleTex = new BABYLON.DynamicTexture('sparkleTex', 128, scene, true);
  {
    const c = sparkleTex.getContext() as CanvasRenderingContext2D;
    const cx = 64, cy = 64;
    c.clearRect(0, 0, 128, 128);
    const core = c.createRadialGradient(cx, cy, 0, cx, cy, 60);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(0.18, 'rgba(255,255,255,0.82)');
    core.addColorStop(0.5, 'rgba(255,255,255,0.16)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = core; c.beginPath(); c.arc(cx, cy, 60, 0, Math.PI * 2); c.fill();
    c.globalCompositeOperation = 'lighter';
    const hg = c.createLinearGradient(cx - 60, 0, cx + 60, 0);
    hg.addColorStop(0, 'rgba(255,255,255,0)'); hg.addColorStop(0.5, 'rgba(255,255,255,0.9)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = hg; c.fillRect(cx - 60, cy - 2, 120, 4);
    const vg = c.createLinearGradient(0, cy - 60, 0, cy + 60);
    vg.addColorStop(0, 'rgba(255,255,255,0)'); vg.addColorStop(0.5, 'rgba(255,255,255,0.9)'); vg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = vg; c.fillRect(cx - 2, cy - 60, 4, 120);
    sparkleTex.update();
  }
  sparkleTex.hasAlpha = true;

  interface Sparkle {
    readonly mesh: InstanceType<BabylonModule['Mesh']>;
    readonly mat: InstanceType<BabylonModule['StandardMaterial']>;
    readonly born: number;
    readonly life: number;
    readonly size: number;
    readonly twinkle: number;
  }
  const sparkles: Sparkle[] = [];
  const MAX_SPARKLES = 28;
  let sparkleSeq = 0;

  function fireSparkle(amount: number): void {
    while (sparkles.length > MAX_SPARKLES) {
      const old = sparkles.shift();
      if (old) { old.mesh.dispose(); old.mat.dispose(); }
    }
    let color = SPARKLE_CYAN, size = 1.6, life = 1800;
    if (amount >= 25000)     { color = SPARKLE_RED;  size = 5.0; life = 3600; }
    else if (amount >= 5000) { color = SPARKLE_GOLD; size = 3.6; life = 3200; }
    else if (amount >= 1000) { color = SPARKLE_GOLD; size = 2.6; life = 2600; }

    // Random point on a shell well beyond the planet orbits, biased flatter in Y.
    const u = Math.random() * 2 - 1;
    const t = Math.random() * Math.PI * 2;
    const r = 55 + Math.random() * 70;
    const s = Math.sqrt(1 - u * u);
    const id = sparkleSeq++;

    const mesh = BABYLON.MeshBuilder.CreatePlane('sparkle_' + id, { size: 1 }, scene);
    mesh.position = new BABYLON.Vector3(s * Math.cos(t) * r, u * r * 0.6, s * Math.sin(t) * r);
    mesh.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    mesh.scaling.setAll(0.01);
    const mat = new BABYLON.StandardMaterial('sparkleMat_' + id, scene);
    mat.disableLighting = true;
    mat.emissiveColor = color;
    mat.diffuseTexture = sparkleTex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.alphaMode = BABYLON.Constants.ALPHA_ADD;
    mat.backFaceCulling = false;
    mat.alpha = 0;
    mesh.material = mat;

    sparkles.push({ mesh, mat, born: Date.now(), life, size, twinkle: 6 + Math.random() * 6 });
  }

  function updateSparkles(): void {
    if (sparkles.length === 0) return;
    const now = Date.now();
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const sp = sparkles[i];
      if (!sp) continue;
      const p = (now - sp.born) / sp.life;
      if (p >= 1) { sp.mesh.dispose(); sp.mat.dispose(); sparkles.splice(i, 1); continue; }
      const grow = p < 0.25 ? p / 0.25 : 1;            // pop in over the first quarter
      const fade = p < 0.25 ? 1 : 1 - (p - 0.25) / 0.75; // then ease out
      const flick = 0.68 + 0.32 * Math.sin(((now - sp.born) / 1000) * sp.twinkle);
      sp.mesh.scaling.setAll(sp.size * (0.4 + 0.6 * grow));
      sp.mat.alpha = fade * flick;
    }
  }

  let lastWinSoundAt = 0;
  const unsubscribeWins = sceneEvents.onWin(({ amount }) => {
    fireSparkle(amount);
    const now = Date.now();
    if (now - lastWinSoundAt > 2500) { lastWinSoundAt = now; soundEngine.alert(); }
  });
  const unsubscribeRings = sceneEvents.onRing(({ amount }) => {
    fireSparkle(amount);
  });

  // ── Camera lerp state — mutated by the camera target subscription ──────────
  let cameraTargetAlpha  = CAMERA_ALPHA;
  let cameraTargetBeta   = CAMERA_BETA;
  let cameraTargetRadius = CAMERA_RADIUS;
  let cameraHasPanel     = false;
  let cameraTargetPos    = BABYLON.Vector3.Zero(); // orbit pivot — flies to the active planet

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

  // Camera screen offset target — shifts earth to non-panel center
  let targetScreenOffsetX = 0;

  const unsubscribeCameraTarget = sceneEvents.onCameraTarget(({ panelId }) => {
    // ── Camera target lerp ───────────────────────────────────────────────────
    const target = CAMERA_TARGETS[panelId] ?? CAMERA_TARGETS['none'] ?? { alpha: CAMERA_ALPHA, beta: Math.PI / 2.5, radius: CAMERA_RADIUS };
    cameraTargetAlpha  = target.alpha;
    cameraTargetBeta   = target.beta;
    // Fly the camera INTO the section's planet; overview returns to the core.
    const planet = PLANET_BY_PANEL.get(panelId);
    cameraTargetPos    = planet ? planet.position : BABYLON.Vector3.Zero();
    cameraTargetRadius = planet ? planet.viewRadius : target.radius;
    cameraHasPanel     = panelId !== 'none';

    // Offset earth to center of non-panel space (panel is ~45vw, desktop only)
    if (IS_MOBILE) {
      // Mobile: panels are fullscreen, no X offset needed
      targetScreenOffsetX = 0;
    } else {
      // Shift the framed planet into the centre of the free (non-panel) half.
      // Offset must scale with the view radius — the screen shift it produces is
      // offset / (2·radius·tan(fov/2)·aspect), so a fixed value drifts off-screen
      // at close-up radii. ~0.30·radius lands the planet ~72% across the viewport.
      const LEFT_CHECK = new Set(['games', 'about', 'team', 'journey']);
      const shift = cameraTargetRadius * 0.30;
      if (panelId === 'none') {
        targetScreenOffsetX = 0;
      } else if (LEFT_CHECK.has(panelId)) {
        targetScreenOffsetX = shift;   // planet sits in the right free space
      } else {
        targetScreenOffsetX = -shift;  // planet sits in the left free space
      }
    }

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
    light.intensity = 0;
    light.range = 20;
    activePanelLight = light;

    // Fade light in over 30 frames
    let elapsed = 0;
    const obs = scene.onBeforeRenderObservable.add(() => {
      elapsed++;
      const t = Math.min(elapsed / 30, 1);
      light.intensity = 0.4 * t;
      if (elapsed >= 30) scene.onBeforeRenderObservable.remove(obs);
    });

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
  });

  // ── Blackhole effect state ────────────────────────────────────────────────
  let blackholeActive = false;
  let blackholeProgress = 0; // 0 = normal, 1 = full blackhole
  const BLACKHOLE_SPEED = 0.015; // ~67 frames (~1.1s) to full effect

  const unsubscribeBlackhole = sceneEvents.onBlackhole((active) => {
    blackholeActive = active;
  });

  scene.onDisposeObservable.addOnce(() => { unsubscribeWins(); unsubscribeRings(); unsubscribeCameraTarget(); unsubscribeBlackhole(); });

  // ── Render loop ────────────────────────────────────────────────────────────
  let entryFrame = 0;
  let twinkleClock = 0;
  let nebulaTime = 0;
  const ENTRY_DURATION = 120;
  scene.registerBeforeRender(() => {
    // ── Blackhole effect — camera zooms in, scene darkens, stars compress ───
    if (blackholeActive && blackholeProgress < 1) {
      blackholeProgress = Math.min(1, blackholeProgress + BLACKHOLE_SPEED);
    } else if (!blackholeActive && blackholeProgress > 0) {
      blackholeProgress = Math.max(0, blackholeProgress - BLACKHOLE_SPEED * 0.7);
    }
    if (blackholeProgress > 0.001) {
      const t = blackholeProgress;
      // Ease-in: slow start then explosive acceleration
      const eased = t * t;
      const extreme = t * t * t;

      // ── DEEP SPACE DEPARTURE — camera flies away from earth into the void ──

      // Camera pulls BACK — radius explodes outward into deep space
      const targetRadius = 18 + extreme * 200; // 18 → 218
      camera.radius += (targetRadius - camera.radius) * 0.06;
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

      // GlowLayer fades as we leave
      if (glowLayer) glowLayer.intensity = Math.max(0, 0.4 * (1 - eased));
      // Atmosphere disappears
      if (atmosphereMaterial) {
        (atmosphereMaterial as unknown as { alpha: number }).alpha = Math.max(0, 1 - t * 3);
      }
    } else if (blackholeProgress <= 0.001 && (camera.fov < 0.79 || camera.radius > 20)) {
      // ── RETURN from deep space — fly back to earth ──
      camera.fov += (0.8 - camera.fov) * 0.04;
      camera.radius += (cameraTargetRadius - camera.radius) * 0.03;
      scene.clearColor = new BABYLON.Color4(0.02, 0.02, 0.04, 1);
      if (starMesh) { starMesh.scaling.setAll(1); starMesh.visibility = 1; }
      if (glowLayer) glowLayer.intensity += (0.4 - glowLayer.intensity) * 0.05;
    }

    // Nebula slow drift — pan the baked backdrop within its inset headroom so the
    // cosmos keeps breathing. Amplitudes stay under (1 - scale)/2 to never bare an edge.
    const nebTex = nebulaBg.texture as InstanceType<BabylonModule['Texture']> | null;
    if (nebTex) {
      nebulaTime += scene.getEngine().getDeltaTime() * 0.001;
      nebTex.uScale = nebUScale;
      nebTex.vScale = nebVScale;
      nebTex.uOffset = (1 - nebUScale) / 2 + 0.025 * Math.sin(nebulaTime * 0.05);
      nebTex.vOffset = (1 - nebVScale) / 2 + 0.020 * Math.cos(nebulaTime * 0.04);
    }

    // Stars: gentle drift + per-star twinkle (buffer update throttled to every 2nd frame)
    if (starMesh) {
      starMesh.rotation.y += 0.00010;
      twinkleClock++;
      const md = starMesh.metadata as
        | { baseAlpha: Float32Array; twPhase: Float32Array; twSpeed: Float32Array; colors: Float32Array }
        | undefined;
      if (md && (twinkleClock & 1) === 0) {
        const { baseAlpha, twPhase, twSpeed, colors } = md;
        const tms = twinkleClock * 0.05;
        for (let i = 0; i < baseAlpha.length; i++) {
          const tw = 0.5 + 0.5 * Math.sin(twPhase[i]! + tms * twSpeed[i]!);
          colors[i * 4 + 3] = baseAlpha[i]! * (0.35 + 0.65 * tw);
        }
        starMesh.updateVerticesData('color', colors);
      }
    }

    // Earth entry animation — spin-zoom from tiny to full scale over ENTRY_DURATION frames
    if (entryFrame < ENTRY_DURATION) {
      entryFrame++;
      const t = entryFrame / ENTRY_DURATION;
      // Cubic ease-out: fast growth at start, decelerates toward end
      const eased = 1 - Math.pow(1 - t, 3);

      earthSphere.scaling.setAll(eased);
      cloudSphere.scaling.setAll(eased * 1.01);
      if (atmosphereMesh) atmosphereMesh.scaling.setAll(eased * 1.025);
      effectsContainer.scaling.setAll(eased);

      // Extra spin that starts fast and slows as scale approaches 1
      const extraSpin = (1 - eased) * 0.05;
      earthSphere.rotation.y += extraSpin;
      cloudSphere.rotation.y += extraSpin;
    }

    // Earth + clouds
    earthSphere.rotation.y += EARTH_ROTATION_SPEED;
    cloudSphere.rotation.y += EARTH_ROTATION_SPEED * 1.15;
    // Sync effects container rotation with earth Y — mirrors feeder Earth.ts update()
    effectsContainer.rotation.y = earthSphere.rotation.y;

    // Atmosphere eye position
    if (scene.activeCamera) {
      const camPos = scene.activeCamera.position;
      atmosphereMaterial.setVector3('eyePosition', camPos);
    }

    // Orbital ring bands
    for (const band of orbitalRing.bands) {
      band.mesh.rotation.y += RING_ROTATION_SPEED * band.rotationOffset;
    }

    // Energy nodes
    for (const node of orbitalRing.energyNodes) {
      node.angle += node.speed;
      node.mesh.position.set(
        Math.cos(node.angle) * node.radius,
        0,
        Math.sin(node.angle) * node.radius,
      );
    }

    // Distant planet rotations
    planets.mars.rotation.y += 0.0003;
    planets.gasGiant.rotation.y += 0.00015;
    planets.iceMoon.rotation.y += 0.0008;

    // Solar-system nav planets spin
    for (const p of navPlanets) p.mesh.rotation.y += p.spin;

    // Ice moon orbits earth
    const t = performance.now() * 0.00005;
    planets.iceMoon.position.x = 12 * Math.cos(t);
    planets.iceMoon.position.z = 12 * Math.sin(t);

    // Nebulas slow drift rotation
    planets.nebula1.rotation.y += 0.00005;
    planets.nebula2.rotation.y -= 0.00004;

    // Continuous orbital drift so the cosmos never freezes — a faster free
    // wander on the overview, a gentle keep-alive orbit while a planet is framed.
    cameraTargetAlpha += cameraHasPanel ? CAMERA_PANEL_DRIFT : CAMERA_AUTO_ROTATE;

    // Smooth camera lerp to target position
    camera.alpha  += (cameraTargetAlpha  - camera.alpha)  * CAMERA_LERP_SPEED;
    camera.beta   += (cameraTargetBeta   - camera.beta)   * CAMERA_LERP_SPEED;
    camera.radius += (cameraTargetRadius - camera.radius) * CAMERA_LERP_SPEED;

    // Fly the orbit pivot toward the active planet (or back to the core)
    const ct = camera.target;
    ct.x += (cameraTargetPos.x - ct.x) * CAMERA_LERP_SPEED;
    ct.y += (cameraTargetPos.y - ct.y) * CAMERA_LERP_SPEED;
    ct.z += (cameraTargetPos.z - ct.z) * CAMERA_LERP_SPEED;

    // Screen offset — shifts earth to center of non-panel space
    const currentOffsetX = camera.targetScreenOffset.x;
    camera.targetScreenOffset.x = currentOffsetX + (targetScreenOffsetX - currentOffsetX) * 0.04;

    // Live-win sparkles — twinkle and fade among the stars
    updateSparkles();

    // Camera target fixed at origin (no mouse parallax)
  });

  return scene;
}

// ─── React component ──────────────────────────────────────────────────────────

export default function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;

    import('@babylonjs/core').then((BABYLON) => {
      if (disposed) return;

      const engine = new BABYLON.Engine(canvas, true, {
        antialias: true,
        powerPreference: 'high-performance',
        // Keep the last frame painted so the reduced-motion / hidden-tab static
        // frame survives page compositing instead of clearing to black.
        preserveDrawingBuffer: true,
      });
      if (IS_MOBILE) engine.setHardwareScalingLevel(1.5);

      const scene = buildScene(BABYLON, engine);

      // Honor prefers-reduced-motion and pause on hidden tabs. A single static
      // frame keeps the backdrop visible while stopping the continuous RAF loop
      // (per-frame satellite trail rebuilds, flyby spawns, camera lerps) — the
      // dominant GPU/battery cost the CSS reduced-motion blanket cannot touch.
      const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      const renderStatic = (): void => {
        // Force entry-animated bodies to final scale so the single frozen frame
        // shows the full earth (the scale-up tween cannot run when frozen).
        for (const name of ['earth', 'clouds', 'atmosphere']) {
          const mesh = scene.getMeshByName(name);
          if (mesh) mesh.scaling.setAll(1);
        }
        const fx = scene.getTransformNodeByName('effectsContainer');
        if (fx) fx.scaling.setAll(1);
        scene.render();
      };
      const startLoop = (): void => {
        engine.stopRenderLoop();
        if (disposed) return;
        if (motionQuery.matches || document.hidden) {
          renderStatic();
        } else {
          engine.runRenderLoop(() => { if (!disposed) scene.render(); });
        }
      };
      startLoop();
      motionQuery.addEventListener('change', startLoop);
      document.addEventListener('visibilitychange', startLoop);

      function handleResize(): void {
        engine.resize();
      }
      window.addEventListener('resize', handleResize);

      // Fade the cosmos in once the scene's meshes + textures are ready, instead
      // of hard-cutting the backdrop in the instant Babylon finishes loading.
      const reveal = (): void => { if (!disposed) setRevealed(true); };
      scene.executeWhenReady(reveal);
      const revealTimer = window.setTimeout(reveal, 2200); // safety net for slow textures

      cleanupRef.current = () => {
        window.clearTimeout(revealTimer);
        window.removeEventListener('resize', handleResize);
        motionQuery.removeEventListener('change', startLoop);
        document.removeEventListener('visibilitychange', startLoop);
        engine.stopRenderLoop();
        scene.dispose();
        engine.dispose();
      };
    }).catch((err: unknown) => {
      console.warn('[StarfieldBackground] Babylon.js failed to load:', err);
    });

    return () => {
      disposed = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        display: 'block',
        opacity: revealed ? 1 : 0,
        transition: 'opacity 1.4s ease-out',
      }}
    />
  );
}
