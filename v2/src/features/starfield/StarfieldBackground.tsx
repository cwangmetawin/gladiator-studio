import { useEffect, useRef } from 'react';
import { sceneEvents } from '@/shared/utils/sceneEvents';
import { soundEngine } from '@/shared/utils/soundEngine';

// ─── Dynamic Babylon.js import type alias ─────────────────────────────────────
type BabylonModule = typeof import('@babylonjs/core');

// ─── Mobile detection ─────────────────────────────────────────────────────────
const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth <= 767;

// ─── Constants (scaled for mobile) ────────────────────────────────────────────
const STAR_COUNT = IS_MOBILE ? 2000 : 6000;
const SKY_RADIUS = 120;
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
const CAMERA_RADIUS = IS_MOBILE ? 22 : 18;
const CAMERA_AUTO_ROTATE = IS_MOBILE ? 0.00008 : 0.00015; // slower rotation on mobile
const CAMERA_LERP_SPEED = 0.02;

// Per-panel camera fly-to targets (alpha, beta, radius for ArcRotateCamera)
const MOBILE_ZOOM = IS_MOBILE ? 4 : 0; // extra distance on mobile
const CAMERA_TARGETS: Record<string, { readonly alpha: number; readonly beta: number; readonly radius: number }> = {
  'none':    { alpha: CAMERA_ALPHA,  beta: CAMERA_BETA, radius: (IS_MOBILE ? 22 : 18) },
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

// ─── Satellite system ─────────────────────────────────────────────────────────

const SAT_TRAIL_POINTS = 80;

interface SatelliteConfig {
  readonly orbitRadius: number;
  readonly speed: number;
  readonly inclination: number;
  readonly phase: number;
  readonly size: number;
  readonly color: InstanceType<BabylonModule['Color3']>;
  readonly trailWidth: number;
}

interface SatelliteInstance {
  readonly node: InstanceType<BabylonModule['TransformNode']>;
  readonly body: InstanceType<BabylonModule['Mesh']>;
  readonly trailMesh: InstanceType<BabylonModule['Mesh']>;
  readonly config: SatelliteConfig;
  angle: number;
  readonly history: InstanceType<BabylonModule['Vector3']>[];
}

interface SatelliteSystem {
  readonly update: () => void;
}

function buildSatellites(
  BABYLON: BabylonModule,
  scene: InstanceType<BabylonModule['Scene']>,
): SatelliteSystem {
  const configs: SatelliteConfig[] = [
    {
      orbitRadius: EARTH_RADIUS + 0.8,
      speed: 0.012,
      inclination: 0.4,
      phase: 0,
      size: 0.06,
      color: BABYLON.Color3.FromHexString('#4fc3f7'),
      trailWidth: 0.035,
    },
    {
      orbitRadius: EARTH_RADIUS + 0.9,
      speed: -0.010,
      inclination: 0.6,
      phase: Math.PI * 0.7,
      size: 0.05,
      color: new BABYLON.Color3(0.3, 0.7, 1.0),
      trailWidth: 0.03,
    },
    {
      orbitRadius: EARTH_RADIUS + 1.5,
      speed: 0.007,
      inclination: 0.25,
      phase: Math.PI * 1.3,
      size: 0.08,
      color: BABYLON.Color3.FromHexString('#ffd54f'),
      trailWidth: 0.045,
    },
    {
      orbitRadius: EARTH_RADIUS + 2.2,
      speed: 0.004,
      inclination: 0.8,
      phase: Math.PI * 0.4,
      size: 0.07,
      color: BABYLON.Color3.FromHexString('#b39ddb'),
      trailWidth: 0.04,
    },
    {
      orbitRadius: EARTH_RADIUS + 1.2,
      speed: 0.009,
      inclination: 1.3,
      phase: Math.PI * 1.8,
      size: 0.055,
      color: new BABYLON.Color3(1.0, 0.6, 0.3),
      trailWidth: 0.032,
    },
  ];

  const satellites: SatelliteInstance[] = [];

  for (let idx = 0; idx < configs.length; idx++) {
    const config = configs[idx];
    if (!config) continue;

    // Orbit pivot node — tilted for inclination
    const node = new BABYLON.TransformNode('satOrbit_' + idx, scene);
    node.rotation.x = config.inclination;
    node.rotation.z = config.phase * 0.3;

    // Satellite body
    const body = BABYLON.MeshBuilder.CreateSphere(
      'satBody_' + idx,
      { diameter: config.size, segments: 6 },
      scene,
    );
    body.parent = node;

    const mat = new BABYLON.StandardMaterial('satMat_' + idx, scene);
    mat.emissiveColor = BABYLON.Color3.Lerp(config.color, BABYLON.Color3.White(), 0.5);
    mat.disableLighting = true;
    mat.alpha = 0.9;
    body.material = mat;
    body.metadata = { glowEnabled: true };

    // Solar panel wings
    const pw = config.size * 2.5;
    const ph = config.size * 0.15;
    const pd = config.size * 1.2;

    const leftPanel = BABYLON.MeshBuilder.CreateBox(
      'satPL_' + idx,
      { width: pw, height: ph, depth: pd },
      scene,
    );
    leftPanel.position.x = -pw * 0.6;
    leftPanel.parent = body;

    const rightPanel = BABYLON.MeshBuilder.CreateBox(
      'satPR_' + idx,
      { width: pw, height: ph, depth: pd },
      scene,
    );
    rightPanel.position.x = pw * 0.6;
    rightPanel.parent = body;

    const panelMat = new BABYLON.StandardMaterial('satPanelMat_' + idx, scene);
    panelMat.emissiveColor = config.color.scale(0.4);
    panelMat.disableLighting = true;
    panelMat.alpha = 0.7;
    leftPanel.material = panelMat;
    rightPanel.material = panelMat;

    // Trail ribbon mesh (updatable)
    const trailMesh = new BABYLON.Mesh('satTrail_' + idx, scene);
    const trailMat = new BABYLON.StandardMaterial('satTrailMat_' + idx, scene);
    trailMat.emissiveColor = config.color;
    trailMat.diffuseColor = BABYLON.Color3.Black();
    trailMat.specularColor = BABYLON.Color3.Black();
    trailMat.disableLighting = true;
    trailMat.alpha = 0.6;
    trailMat.backFaceCulling = false;
    trailMesh.material = trailMat;
    trailMesh.metadata = { glowEnabled: true };

    // Pre-fill history: position body along past orbit to warm up the trail
    const history: InstanceType<BabylonModule['Vector3']>[] = [];
    for (let i = 0; i < SAT_TRAIL_POINTS; i++) {
      const a = config.phase - config.speed * i;
      body.position.set(
        Math.cos(a) * config.orbitRadius,
        0,
        Math.sin(a) * config.orbitRadius,
      );
      body.computeWorldMatrix(true);
      history.push(body.getAbsolutePosition().clone());
    }

    // Reset body to starting position
    body.position.set(
      Math.cos(config.phase) * config.orbitRadius,
      0,
      Math.sin(config.phase) * config.orbitRadius,
    );

    satellites.push({ node, body, trailMesh, config, angle: config.phase, history });
  }

  function updateTrailMesh(sat: SatelliteInstance): void {
    const pts = sat.history;
    if (pts.length < 3) return;

    const count = pts.length;
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const c = sat.config.color;
    const w = sat.config.trailWidth;

    for (let i = 0; i < count; i++) {
      const t = i / (count - 1); // 0 = head, 1 = tail
      const fade = 1.0 - t;
      const width = w * (1.0 - t * 0.8); // taper toward tail

      const p = pts[i];
      if (!p) continue;

      let tangent: InstanceType<BabylonModule['Vector3']>;
      if (i === 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        tangent = pts[0]!.subtract(pts[1]!);
      } else if (i === count - 1) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        tangent = pts[i - 1]!.subtract(pts[i]!);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        tangent = pts[i - 1]!.subtract(pts[i + 1]!);
      }
      tangent.normalize();

      const radial = p.clone().normalize();
      const perp = BABYLON.Vector3.Cross(tangent, radial).normalize().scale(width);

      const left = p.add(perp);
      const right = p.subtract(perp);

      positions.push(left.x, left.y, left.z);
      positions.push(right.x, right.y, right.z);

      const alpha = fade * 0.7;
      colors.push(c.r, c.g, c.b, alpha);
      colors.push(c.r, c.g, c.b, alpha);

      if (i > 0) {
        const base = (i - 1) * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }
    }

    const vertexData = new BABYLON.VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.colors = colors;
    vertexData.applyToMesh(sat.trailMesh, true);
    sat.trailMesh.hasVertexAlpha = true;
  }

  function update(): void {
    for (const sat of satellites) {
      sat.angle += sat.config.speed;

      const r = sat.config.orbitRadius;
      sat.body.position.set(
        Math.cos(sat.angle) * r,
        0,
        Math.sin(sat.angle) * r,
      );
      sat.body.rotation.y = -sat.angle + Math.PI / 2;

      // Capture world position for trail
      sat.body.computeWorldMatrix(true);
      const worldPos = sat.body.getAbsolutePosition().clone();
      sat.history.unshift(worldPos);
      if (sat.history.length > SAT_TRAIL_POINTS) sat.history.pop();

      updateTrailMesh(sat);
    }
  }

  return { update };
}

// ─── Flyby ship system ────────────────────────────────────────────────────────

interface FlybyShip {
  readonly root: InstanceType<BabylonModule['TransformNode']>;
  progress: number;
  readonly duration: number;
  readonly start: InstanceType<BabylonModule['Vector3']>;
  readonly control: InstanceType<BabylonModule['Vector3']>;
  readonly end: InstanceType<BabylonModule['Vector3']>;
}

interface FlybySystem {
  readonly update: () => void;
}

function buildFlybyShips(
  BABYLON: BabylonModule,
  scene: InstanceType<BabylonModule['Scene']>,
): FlybySystem {
  const ships: FlybyShip[] = [];

  function createShip(): InstanceType<BabylonModule['TransformNode']> {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    const root = new BABYLON.TransformNode('ship_' + id, scene);

    // Hull — sleek elongated cone, taller than before
    const hull = BABYLON.MeshBuilder.CreateCylinder(
      'hull_' + id,
      { height: 1.2, diameterTop: 0.03, diameterBottom: 0.18, tessellation: 8 },
      scene,
    );
    hull.parent = root;
    hull.rotation.x = Math.PI / 2;
    const hullMat = new BABYLON.StandardMaterial('hullMat_' + id, scene);
    hullMat.emissiveColor = new BABYLON.Color3(0.3, 0.5, 0.7);
    hullMat.disableLighting = true;
    hullMat.alpha = 0.9;
    hull.material = hullMat;

    // Cockpit — small sphere at the nose
    const cockpit = BABYLON.MeshBuilder.CreateSphere(
      'cockpit_' + id,
      { diameter: 0.09, segments: 6 },
      scene,
    );
    cockpit.parent = root;
    cockpit.position.z = 0.62;
    const cockpitMat = new BABYLON.StandardMaterial('cockpitMat_' + id, scene);
    cockpitMat.emissiveColor = new BABYLON.Color3(0.6, 0.85, 1.0);
    cockpitMat.disableLighting = true;
    cockpitMat.alpha = 0.95;
    cockpit.material = cockpitMat;
    cockpit.metadata = { glowEnabled: true };

    // Wings — two angled flat boxes, one each side
    const wingShape = { width: 0.55, height: 0.04, depth: 0.22 };
    const leftWing = BABYLON.MeshBuilder.CreateBox('wingL_' + id, wingShape, scene);
    leftWing.parent = root;
    leftWing.position.set(-0.3, 0, 0.0);
    leftWing.rotation.z = 0.35; // angled slightly upward
    const wingMat = new BABYLON.StandardMaterial('wingMat_' + id, scene);
    wingMat.emissiveColor = new BABYLON.Color3(0.2, 0.4, 0.6);
    wingMat.disableLighting = true;
    wingMat.alpha = 0.8;
    leftWing.material = wingMat;

    const rightWing = BABYLON.MeshBuilder.CreateBox('wingR_' + id, wingShape, scene);
    rightWing.parent = root;
    rightWing.position.set(0.3, 0, 0.0);
    rightWing.rotation.z = -0.35;
    rightWing.material = wingMat;

    // Central engine glow
    const engine = BABYLON.MeshBuilder.CreateSphere(
      'engine_' + id,
      { diameter: 0.1, segments: 6 },
      scene,
    );
    engine.parent = root;
    engine.position.z = -0.62;
    const engMat = new BABYLON.StandardMaterial('engMat_' + id, scene);
    engMat.emissiveColor = new BABYLON.Color3(0.4, 0.8, 1.0);
    engMat.disableLighting = true;
    engine.material = engMat;
    engine.metadata = { glowEnabled: true };

    // Wing-tip engine glows
    const leftTipEng = BABYLON.MeshBuilder.CreateSphere(
      'engTipL_' + id,
      { diameter: 0.06, segments: 4 },
      scene,
    );
    leftTipEng.parent = root;
    leftTipEng.position.set(-0.52, 0, -0.18);
    const tipEngMat = new BABYLON.StandardMaterial('engTipMat_' + id, scene);
    tipEngMat.emissiveColor = new BABYLON.Color3(0.3, 0.7, 1.0);
    tipEngMat.disableLighting = true;
    leftTipEng.material = tipEngMat;
    leftTipEng.metadata = { glowEnabled: true };

    const rightTipEng = BABYLON.MeshBuilder.CreateSphere(
      'engTipR_' + id,
      { diameter: 0.06, segments: 4 },
      scene,
    );
    rightTipEng.parent = root;
    rightTipEng.position.set(0.52, 0, -0.18);
    rightTipEng.material = tipEngMat;
    rightTipEng.metadata = { glowEnabled: true };

    // Trail — longer and slightly wider than before
    const trail = BABYLON.MeshBuilder.CreateCylinder(
      'trail_' + id,
      { height: 3.0, diameterTop: 0.0, diameterBottom: 0.05, tessellation: 6 },
      scene,
    );
    trail.parent = root;
    trail.rotation.x = Math.PI / 2;
    trail.position.z = -2.1;
    const trailMat = new BABYLON.StandardMaterial('trailMat_' + id, scene);
    trailMat.emissiveColor = new BABYLON.Color3(0.3, 0.6, 1.0);
    trailMat.disableLighting = true;
    trailMat.alpha = 0.35;
    trailMat.backFaceCulling = false;
    trail.material = trailMat;

    return root;
  }

  function spawnShip(): void {
    const side = Math.random() > 0.5 ? 1 : -1;
    const height = (Math.random() - 0.5) * 20;

    const start = new BABYLON.Vector3(
      side * (25 + Math.random() * 15),
      height,
      -10 + Math.random() * 20,
    );
    const control = new BABYLON.Vector3(
      (Math.random() - 0.5) * 10,
      height + (Math.random() - 0.5) * 8,
      Math.random() * 15,
    );
    const end = new BABYLON.Vector3(
      -side * (25 + Math.random() * 15),
      height + (Math.random() - 0.5) * 10,
      -10 + Math.random() * 20,
    );

    const root = createShip();
    root.position.copyFrom(start);

    ships.push({
      root,
      progress: 0,
      duration: 6 + Math.random() * 8,
      start,
      control,
      end,
    });
  }

  // Stagger the first three ships so they don't all appear simultaneously
  for (let i = 0; i < 3; i++) {
    setTimeout(() => { spawnShip(); }, i * 2000);
  }

  let nextSpawn = performance.now() + 5000;

  function update(): void {
    const now = performance.now();
    const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.05);

    if (now >= nextSpawn && ships.length < 4) {
      spawnShip();
      nextSpawn = now + 3000 + Math.random() * 5000;
    }

    for (let i = ships.length - 1; i >= 0; i--) {
      const ship = ships[i];
      if (!ship) continue;
      ship.progress += dt / ship.duration;

      if (ship.progress >= 1) {
        ship.root.dispose();
        ships.splice(i, 1);
        continue;
      }

      // Quadratic Bézier position
      const t = ship.progress;
      const t1 = 1 - t;
      const px = t1 * t1 * ship.start.x + 2 * t1 * t * ship.control.x + t * t * ship.end.x;
      const py = t1 * t1 * ship.start.y + 2 * t1 * t * ship.control.y + t * t * ship.end.y;
      const pz = t1 * t1 * ship.start.z + 2 * t1 * t * ship.control.z + t * t * ship.end.z;
      ship.root.position.set(px, py, pz);

      // Orient toward the next point on the curve
      const nt = Math.min(1, t + 0.02);
      const nt1 = 1 - nt;
      const nx = nt1 * nt1 * ship.start.x + 2 * nt1 * nt * ship.control.x + nt * nt * ship.end.x;
      const ny = nt1 * nt1 * ship.start.y + 2 * nt1 * nt * ship.control.y + nt * nt * ship.end.y;
      const nz = nt1 * nt1 * ship.start.z + 2 * nt1 * nt * ship.control.z + nt * nt * ship.end.z;
      ship.root.lookAt(new BABYLON.Vector3(nx, ny, nz));
    }
  }

  return { update };
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

  // ── Starfield ──────────────────────────────────────────────────────────────
  const starMesh = buildStarField(BABYLON, scene);

  // ── Earth + clouds ─────────────────────────────────────────────────────────
  const { sphere: earthSphere, cloudSphere } = buildEarth(BABYLON, scene);

  // ── Atmosphere shader ──────────────────────────────────────────────────────
  const atmosphereMaterial = buildAtmosphere(BABYLON, scene);
  const atmosphereMesh = scene.getMeshByName('atmosphere') as InstanceType<BabylonModule['Mesh']> | null;

  // ── Orbital ring ───────────────────────────────────────────────────────────
  const orbitalRing = buildOrbitalRing(BABYLON, scene);

  // ── Distant planets + nebulas ──────────────────────────────────────────────
  const planets = buildDistantPlanets(BABYLON, scene);

  // ── Flyby ship system ──────────────────────────────────────────────────────
  const flybySystem = buildFlybyShips(BABYLON, scene);

  // ── Orbiting satellites with ribbon trails ─────────────────────────────────
  const satelliteSystem = buildSatellites(BABYLON, scene);

  // ── Effects container — rotates with earth so beams stick to surface ───────
  const effectsContainer = new BABYLON.TransformNode('effectsContainer', scene);

  // ── Earth entry animation — start at near-zero scale ──────────────────────
  earthSphere.scaling.setAll(0.01);
  cloudSphere.scaling.setAll(0.01);
  if (atmosphereMesh) atmosphereMesh.scaling.setAll(0.01);
  effectsContainer.scaling.setAll(0.01);

  // ── Win beam system ────────────────────────────────────────────────────────
  // Color constants (mirrors feeder Earth.ts COLOR3_* values)
  const COLOR_CYAN   = new BABYLON.Color3(0.31, 0.76, 0.97);  // normal wins
  const COLOR_GOLD   = new BABYLON.Color3(1.00, 0.84, 0.30);  // big wins ≥ 1000
  const COLOR_AMBER  = new BABYLON.Color3(1.00, 0.65, 0.10);  // mega  ≥ 5000
  const COLOR_RED    = new BABYLON.Color3(1.00, 0.25, 0.20);  // epic  ≥ 25000
  const COLOR_WHITE  = BABYLON.Color3.White();

  /**
   * Convert lat/lng degrees to a Babylon Vector3 on the earth sphere surface.
   * Mirrors the latLngToVector3 helper used in feeder Earth.ts exactly.
   */
  function latLngToSurface(lat: number, lng: number): InstanceType<BabylonModule['Vector3']> {
    const phi   = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    return new BABYLON.Vector3(
      -(EARTH_RADIUS * Math.sin(phi) * Math.cos(theta)),
        EARTH_RADIUS * Math.cos(phi),
        EARTH_RADIUS * Math.sin(phi) * Math.sin(theta),
    );
  }

  /** Align mesh local-Y to point along the given surface normal. */
  function alignToNormal(
    mesh: InstanceType<BabylonModule['Mesh']>,
    normal: InstanceType<BabylonModule['Vector3']>,
  ): void {
    const up    = new BABYLON.Vector3(0, 1, 0);
    const angle = Math.acos(BABYLON.Vector3.Dot(up, normal));
    const axis  = BABYLON.Vector3.Cross(up, normal).normalize();
    if (axis.length() > 0.001) {
      mesh.rotationQuaternion = null;
      mesh.rotate(axis, angle);
    }
  }

  // Active beam meshes — disposed in the render loop via expiry timestamp.
  // Mirrors feeder Earth.ts activeBeams pattern exactly.
  const MAX_ACTIVE_BEAMS = 12;
  const activeBeams: InstanceType<BabylonModule['Mesh']>[] = [];

  /**
   * Fire a light beam at the given geographic position.
   * Uses feeder Earth.ts expiry-based disposal (no Babylon Animation system).
   * Materials have static alpha values so beams are immediately visible.
   * needDepthPrePass + forceDepthWrite set directly on the material instance
   * (not via cast) to guarantee depth-buffer correctness.
   */
  function fireBeam(lat: number, lng: number, amount: number): void {
    // Cap active beams to prevent unbounded growth during rapid wins
    while (activeBeams.length > MAX_ACTIVE_BEAMS) {
      const oldest = activeBeams.shift();
      if (oldest) oldest.dispose();
    }

    const surfacePoint = latLngToSurface(lat, lng);
    const normal       = surfacePoint.clone().normalize();
    const ts           = Date.now();

    // Tier thresholds per user spec:
    // $100 gold, $1000 amber, $2000 red, $5000/$10000/$100000 escalating
    let beamHeight: number;
    let beamWidth:  number;
    let color:      InstanceType<BabylonModule['Color3']>;
    let durationMs: number;

    if (amount >= 100000) {
      beamHeight = 18.0; beamWidth = 0.8;  color = COLOR_RED;   durationMs = 10000;
    } else if (amount >= 10000) {
      beamHeight = 14.0; beamWidth = 0.6;  color = COLOR_RED;   durationMs = 8000;
    } else if (amount >= 5000) {
      beamHeight = 11.0; beamWidth = 0.45; color = COLOR_RED;   durationMs = 7000;
    } else if (amount >= 2000) {
      beamHeight = 8.0;  beamWidth = 0.35; color = COLOR_RED;   durationMs = 5000;
    } else if (amount >= 1000) {
      beamHeight = 6.0;  beamWidth = 0.25; color = COLOR_AMBER; durationMs = 4000;
    } else {
      // $100+ — gold beam (minimum for beam to fire)
      beamHeight = 4.0;  beamWidth = 0.15; color = COLOR_GOLD;  durationMs = 3000;
    }

    const expiry   = ts + durationMs;
    const isBigWin = amount >= 1000;

    // Helper: build a beam material with correct depth flags set directly on
    // the material instance (not via cast) so the setter is actually invoked.
    function makeBeamMat(
      name: string,
      emissive: InstanceType<BabylonModule['Color3']>,
      alpha: number,
    ): InstanceType<BabylonModule['StandardMaterial']> {
      const mat = new BABYLON.StandardMaterial(name, scene);
      mat.emissiveColor   = emissive;
      mat.disableLighting = true;
      mat.alpha           = alpha;
      mat.backFaceCulling = false;
      // Direct assignment invokes Babylon's property setters (Object.assign bypasses them!)
      (mat as unknown as { needDepthPrePass: boolean }).needDepthPrePass = true;
      (mat as unknown as { forceDepthWrite: boolean }).forceDepthWrite = true;
      return mat;
    }

    // ── Core beam (bright white/gold inner cylinder) ─────────────────────────
    const coreBeam = BABYLON.MeshBuilder.CreateCylinder(
      'beamCore_' + ts,
      { height: beamHeight, diameterTop: 0, diameterBottom: beamWidth * 0.6, tessellation: 12 },
      scene,
    );
    coreBeam.position = surfacePoint.add(normal.scale(beamHeight / 2));
    alignToNormal(coreBeam, normal);
    coreBeam.material = makeBeamMat(
      'beamCoreMat_' + ts,
      isBigWin ? new BABYLON.Color3(1, 0.95, 0.7) : COLOR_WHITE,
      0.95,
    );
    coreBeam.metadata = { expiry, glowEnabled: false };
    coreBeam.parent   = effectsContainer;
    activeBeams.push(coreBeam);

    // ── Outer glow beam (coloured, wider, more transparent) ──────────────────
    const outerBeam = BABYLON.MeshBuilder.CreateCylinder(
      'beamOuter_' + ts,
      { height: beamHeight * 1.02, diameterTop: 0, diameterBottom: beamWidth * 2.0, tessellation: 12 },
      scene,
    );
    outerBeam.position = surfacePoint.add(normal.scale(beamHeight / 2));
    alignToNormal(outerBeam, normal);
    outerBeam.material = makeBeamMat(
      'beamOuterMat_' + ts,
      isBigWin ? new BABYLON.Color3(1, 0.75, 0.1) : color,
      isBigWin ? 0.26 : 0.35,
    );
    outerBeam.metadata = { expiry, glowEnabled: false };
    outerBeam.parent   = effectsContainer;
    activeBeams.push(outerBeam);

    // ── Wide haze beam (atmospheric scatter) ─────────────────────────────────
    const hazeBeam = BABYLON.MeshBuilder.CreateCylinder(
      'beamHaze_' + ts,
      { height: beamHeight * 0.9, diameterTop: beamWidth * 0.3, diameterBottom: beamWidth * 2.5, tessellation: 12 },
      scene,
    );
    hazeBeam.position = surfacePoint.add(normal.scale(beamHeight * 0.45));
    alignToNormal(hazeBeam, normal);
    hazeBeam.material = makeBeamMat(
      'beamHazeMat_' + ts,
      isBigWin ? COLOR_GOLD : color,
      isBigWin ? 0.08 : 0.12,
    );
    hazeBeam.metadata = { expiry, glowEnabled: false };
    hazeBeam.parent   = effectsContainer;
    activeBeams.push(hazeBeam);

    // ── Impact sphere at base ─────────────────────────────────────────────────
    const impactSphere = BABYLON.MeshBuilder.CreateSphere(
      'beamImpact_' + ts,
      { diameter: beamWidth * 1.5, segments: 8 },
      scene,
    );
    impactSphere.position = surfacePoint.add(normal.scale(0.03));
    impactSphere.material = makeBeamMat(
      'beamImpactMat_' + ts,
      BABYLON.Color3.Lerp(color, COLOR_WHITE, 0.6),
      0.9,
    );
    impactSphere.metadata = { expiry, glowEnabled: false };
    impactSphere.parent   = effectsContainer;
    activeBeams.push(impactSphere as unknown as InstanceType<BabylonModule['Mesh']>);
  }

  // ── Ring ripple for normal wins — copied from feeder Earth.ts createSurfaceWaveRing
  function fireRing(lat: number, lng: number, amount: number): void {
    const surfacePoint = latLngToSurface(lat, lng);
    const normal = surfacePoint.clone().normalize();

    const ring = BABYLON.MeshBuilder.CreateTorus('surfaceWaveRing_' + Date.now(), {
      diameter: 0.22,
      thickness: 0.012,
      tessellation: 56,
    }, scene);
    ring.position = surfacePoint.add(normal.scale(0.02));
    alignToNormal(ring, normal);
    ring.parent = effectsContainer;

    const ringMat = new BABYLON.StandardMaterial('surfaceWaveRingMat_' + Date.now(), scene);
    ringMat.emissiveColor = BABYLON.Color3.Lerp(COLOR_CYAN, COLOR_WHITE, 0.2);
    ringMat.disableLighting = true;
    ringMat.alpha = 0;
    ringMat.backFaceCulling = false;
    ring.material = ringMat;

    // Scale from small → big, alpha fade in → out (exact feeder values)
    const intensity = Math.min(Math.max(amount / 50, 0.6), 2.2);
    const maxScale = 1.8 + intensity * 0.8;
    const totalFrames = 44;

    const scaleAnim = new BABYLON.Animation('surfaceWaveScale', 'scaling', 30,
      BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    scaleAnim.setKeys([
      { frame: 0, value: new BABYLON.Vector3(0.22, 0.22, 0.22) },
      { frame: 8, value: new BABYLON.Vector3(0.95, 0.95, 0.95) },
      { frame: 24, value: new BABYLON.Vector3(maxScale * 0.72, maxScale * 0.72, maxScale * 0.72) },
      { frame: totalFrames, value: new BABYLON.Vector3(maxScale, maxScale, maxScale) },
    ]);

    const fadeAnim = new BABYLON.Animation('surfaceWaveFade', 'material.alpha', 30,
      BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    fadeAnim.setKeys([
      { frame: 0, value: 0 },
      { frame: 4, value: 0.72 },
      { frame: 16, value: 0.42 },
      { frame: totalFrames, value: 0 },
    ]);

    ring.animations = [scaleAnim, fadeAnim];
    scene.beginAnimation(ring, 0, totalFrames, false, 1, () => {
      ring.dispose();
      ringMat.dispose();
    });
  }

  // Subscribe to BIG+ wins ($1000+) — full beam
  let lastWinSoundAt = 0;
  const unsubscribeWins = sceneEvents.onWin(({ lat, lng, amount }) => {
    fireBeam(lat, lng, amount);
    const now = Date.now();
    if (now - lastWinSoundAt > 2500) { lastWinSoundAt = now; soundEngine.alert(); }
  });

  // Subscribe to normal wins — expanding ring ripple (feeder surfaceWaveRing)
  const unsubscribeRings = sceneEvents.onRing(({ lat, lng, amount }) => {
    fireRing(lat, lng, amount);
  });

  // ── Camera lerp state — mutated by the camera target subscription ──────────
  let cameraTargetAlpha  = CAMERA_ALPHA;
  let cameraTargetBeta   = CAMERA_BETA;
  let cameraTargetRadius = CAMERA_RADIUS;
  let cameraHasPanel     = false;

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
    cameraTargetRadius = target.radius;
    cameraHasPanel     = panelId !== 'none';

    // Offset earth to center of non-panel space (panel is ~45vw, desktop only)
    if (IS_MOBILE) {
      // Mobile: panels are fullscreen, no X offset needed
      targetScreenOffsetX = 0;
    } else {
      const LEFT_CHECK = new Set(['games', 'about', 'team', 'journey']);
      if (panelId === 'none') {
        targetScreenOffsetX = 0;
      } else if (LEFT_CHECK.has(panelId)) {
        targetScreenOffsetX = 8;  // earth shifts right when left panel open
      } else {
        targetScreenOffsetX = -8; // earth shifts left when right panel open
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
  let trailFrameCount = 0;
  let entryFrame = 0;
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

    // Stars slow rotation
    if (starMesh) {
      starMesh.rotation.y += 0.00003;
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

    // Expire and dispose beam meshes — feeder-style expiry loop, no Animation system
    const now = Date.now();
    for (let i = activeBeams.length - 1; i >= 0; i--) {
      const beam = activeBeams[i];
      if (!beam) continue;
      if (!beam.metadata?.expiry || now > beam.metadata.expiry) {
        beam.dispose();
        activeBeams.splice(i, 1);
      }
    }

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

    // Ice moon orbits earth
    const t = performance.now() * 0.00005;
    planets.iceMoon.position.x = 12 * Math.cos(t);
    planets.iceMoon.position.z = 12 * Math.sin(t);

    // Nebulas slow drift rotation
    planets.nebula1.rotation.y += 0.00005;
    planets.nebula2.rotation.y -= 0.00004;

    // Camera auto-rotation — only when no panel is active
    if (!cameraHasPanel) {
      camera.alpha += CAMERA_AUTO_ROTATE;
    }

    // Smooth camera lerp to target position
    camera.alpha  += (cameraTargetAlpha  - camera.alpha)  * CAMERA_LERP_SPEED;
    camera.beta   += (cameraTargetBeta   - camera.beta)   * CAMERA_LERP_SPEED;
    camera.radius += (cameraTargetRadius - camera.radius) * CAMERA_LERP_SPEED;

    // Screen offset — shifts earth to center of non-panel space
    const currentOffsetX = camera.targetScreenOffset.x;
    camera.targetScreenOffset.x = currentOffsetX + (targetScreenOffsetX - currentOffsetX) * 0.04;

    // Flyby ships
    flybySystem.update();

    // Orbiting satellites — throttle trail mesh rebuild to every 3 frames
    trailFrameCount++;
    if (trailFrameCount % 3 === 0) {
      satelliteSystem.update();
    }

    // Camera target fixed at origin (no mouse parallax)
  });

  return scene;
}

// ─── React component ──────────────────────────────────────────────────────────

export default function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

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

      cleanupRef.current = () => {
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
      }}
    />
  );
}
