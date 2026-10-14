import { approach } from '@/shared/utils/frameTime';
import { emblemAnchor, helmetRect } from '@/shared/brand/emblemAnchor';
import { homeReveal } from '@/shared/brand/homeReveal';
import { ARC_FIRST_MS } from '@/shared/brand/emblemArcs';
import { ARENA_FILES, loadEmblemAsset, mapUrl } from './arenaAssets';
import { arenaQuality } from './arenaQuality';
import { createArcScheduler } from './arcSchedule';
import { createArcs } from './arcs';
import { emblemSlot } from './emblemSlot';
import { createEmblemNodes } from './emblemMesh';
import { SETTLED, SETTLED_S, arrival, glide } from './ignition';
import { FOV_DESKTOP, FOV_PHONE, blendFraming, boxShares, emblemRect, framingFor, projectedBox, type Framing, type Rect } from './framing';
import { REST_POSE, emblemRotation, followPose, pointerPose, swayPose, shouldSway, type PointerPose } from './pointerFollow';
import { createAuraMaterial, createRibbonMaterial, HOLO } from './ribbonShaders';
import { createSteelMaterials } from './steelMaterial';
import type { ArenaModule, BabylonModule, Engine } from './arenaTypes';

// The 3D emblem: a second Scene on the starfield's engine and canvas (one WebGL context). It is drawn
// after the starfield scene, on top of it, clearing only depth, with its own camera, lights, PBR studio
// environment and tone mapping, so nothing in the starfield scene (its camera, the constellation doors,
// the energy post pass) knows it exists.

export type ArenaStatus = 'loading' | 'ready' | 'unavailable';

export interface ArenaContext {
  readonly canvas: HTMLCanvasElement;
  /** The sky root: it carries data-arena (status) and data-emblem-box (the emblem's box, for probes). */
  readonly root: HTMLElement | null;
  readonly phone: boolean;
  readonly reducedMotion: () => boolean;
  /** False while a panel (or the catalogue) has the home hidden: the emblem fades out with the hub. */
  readonly hubVisible: () => boolean;
  /** Called once, after the first frame with the emblem in it has been drawn. */
  readonly onFirstFrame: () => void;
}

export interface Arena {
  /** Advance the emblem and draw it. dt is seconds (0 for a static frame). */
  render(dt: number): void;
  dispose(): void;
}

const FADE_RATE = 18; // 1/s: about the hub's 160-180 ms fade
/** The widest share of the slot the emblem takes: a bit more than the prototype's 84 % of its content width. */
const SLOT_FRACTION_DESKTOP = 0.86;
const SLOT_FRACTION_PHONE = 1.14;

function setFlag(root: HTMLElement | null, name: string, value: string): void {
  if (root && root.dataset[name] !== value) root.dataset[name] = value;
}

export async function installArena(B: BabylonModule, engine: Engine, ctx: ArenaContext): Promise<Arena> {
  performance.mark('arena:start');
  setFlag(ctx.root, 'arena', 'loading');
  const [A, asset] = await Promise.all([import('./arenaCore') as Promise<ArenaModule>, loadEmblemAsset()]);
  performance.mark('arena:assets');
  const quality = arenaQuality(ctx.phone, window.devicePixelRatio || 1);
  const fov = ctx.phone ? FOV_PHONE : FOV_DESKTOP;

  const scene = new B.Scene(engine);
  scene.autoClear = false;                  // the starfield scene has already painted the colour buffer
  scene.autoClearDepthAndStencil = true;    // but its depth must not hide the emblem
  scene.skipPointerMovePicking = true;
  const camera = new A.FreeCamera('arenaCamera', new B.Vector3(0, 0, -12), scene);
  camera.minZ = 0.05; camera.maxZ = 80; camera.fov = fov;
  camera.inputs.clear();

  const processing = scene.imageProcessingConfiguration;
  processing.toneMappingEnabled = true;
  processing.toneMappingType = A.ImageProcessingConfiguration.TONEMAPPING_ACES;
  processing.contrast = 1.32;
  processing.exposure = 1;

  const environment = new A.CubeTexture(ARENA_FILES.env, scene);
  scene.environmentTexture = environment;
  scene.environmentIntensity = 1;

  const texture = (file: string) => {
    const t = new B.Texture(mapUrl(file), scene, false, false, B.Texture.TRILINEAR_SAMPLINGMODE);
    t.wrapU = B.Texture.CLAMP_ADDRESSMODE; t.wrapV = B.Texture.CLAMP_ADDRESSMODE;
    t.anisotropicFilteringLevel = quality.anisotropy;
    return t;
  };
  const steel = createSteelMaterials(A, B, scene, { normal: texture(asset.maps.normal.file), rough: texture(asset.maps.rough.file) });
  const haloMaterial = createRibbonMaterial(B, scene, 'emblemHaloMaterial', 0.02 / (0.02 + 0.11));
  const currentMaterial = createRibbonMaterial(B, scene, 'emblemCurrentMaterial', 0.5);
  const nodes = createEmblemNodes(B, scene, asset, { cap: steel.cap, side: steel.side, halo: haloMaterial, current: currentMaterial });

  const aura = B.MeshBuilder.CreatePlane('emblemAura', { width: asset.width * 1.3, height: asset.height * 3.4 }, scene);
  aura.parent = nodes.pivot;
  aura.position.z = 0.9;
  aura.material = createAuraMaterial(B, scene);
  aura.alphaIndex = -1;
  aura.isPickable = false;

  const key = new B.DirectionalLight('emblemKey', new B.Vector3(0.45, -0.55, 0.7), scene);
  key.diffuse = new B.Color3(1, 0.96, 0.92); key.specular = key.diffuse; key.intensity = 1.6;
  const rim = new B.PointLight('emblemRim', new B.Vector3(-3, 2, -1.6), scene);
  rim.diffuse = new B.Color3(...HOLO); rim.specular = rim.diffuse; rim.intensity = 22;
  const arcLight = new B.PointLight('emblemArcLight', new B.Vector3(0, 0, -0.4), scene);
  arcLight.diffuse = new B.Color3(0.65, 0.86, 1); arcLight.specular = arcLight.diffuse; arcLight.intensity = 0;
  arcLight.parent = nodes.pivot;

  const random = Math.random;
  const arcs = createArcs(B, scene, asset.arcs, asset.placement, nodes.pivot, arcLight, random);
  const scheduler = createArcScheduler(random);

  // ── framing: the slot on the page, and the gate's rectangle the emblem starts from ──────────────────
  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
  let slotFraming: Framing = framingFor(emblemRect({ x: 0, y: 0, ...viewport() }, asset, 0.8), viewport(), asset.width, fov);
  let gateFraming: Framing | null = null;
  let lastBox: Rect = { x: 0, y: 0, width: 0, height: 0 };

  function refreshFraming(): void {
    const slot = emblemSlot.getSnapshot();
    const vp = slot?.viewport ?? viewport();
    if (slot) slotFraming = framingFor(emblemRect(slot.slot, asset, ctx.phone ? SLOT_FRACTION_PHONE : SLOT_FRACTION_DESKTOP), vp, asset.width, fov);
    const anchor = emblemAnchor.getSnapshot();
    if (anchor) {
      // The gate's 2D emblem is the helmet and wings in the full emblem box; the 3D asset spans the same box.
      void helmetRect;
      gateFraming = framingFor(anchor, viewport(), asset.width, fov);
    }
    lastBox = projectedBox(asset.cap.positions, slotFraming, vp, fov);
    const stage = slot?.stage ?? { x: 0, y: 0, ...vp };
    const shares = boxShares(lastBox, vp, stage);
    setFlag(ctx.root, 'emblemBox', [lastBox.x, lastBox.y, lastBox.width, lastBox.height].map(v => v.toFixed(1)).join(','));
    setFlag(ctx.root, 'emblemShare', [shares.width, shares.viewportArea, shares.stageArea].map(v => v.toFixed(3)).join(','));
  }
  refreshFraming();
  const unsubscribeSlot = emblemSlot.subscribe(refreshFraming);
  const unsubscribeAnchor = emblemAnchor.subscribe(refreshFraming);

  // ── input ────────────────────────────────────────────────────────────────────────────────────────────
  let target: PointerPose = REST_POSE;
  let pose: PointerPose = REST_POSE;
  let lastMoveAt = -Infinity;
  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    target = pointerPose(event.clientX, event.clientY, window.innerWidth, window.innerHeight);
    lastMoveAt = performance.now();
  };
  if (quality.pointer) window.addEventListener('pointermove', onPointerMove, { passive: true });

  // ── state ────────────────────────────────────────────────────────────────────────────────────────────
  let visibility = 1;
  let ready = false;
  let drewFirst = false;
  let lateReady = false;
  let clock = 0; // seconds of animated time, for the sway and the rim's shimmer
  const timer = (name: string) => performance.mark(name);

  scene.executeWhenReady(() => { ready = true; timer('arena:ready'); });
  // Hidden materials (the arcs) would compile on first use and hitch: compile them now, after the render loop runs.
  void Promise.all(arcs.parts.map(part => part.mesh.material?.forceCompilationAsync(part.mesh).catch(() => null) ?? null)).then(() => { lateReady = true; });

  function render(dt: number): void {
    const reduced = ctx.reducedMotion();
    const now = performance.now();
    const released = homeReveal.getSnapshot();
    const seconds = reduced ? SETTLED_S + 1 : released === null ? -1 : (now - released) / 1000;
    clock += dt;

    const wantVisible = ctx.hubVisible() ? 1 : 0;
    visibility = reduced || !drewFirst ? wantVisible : approach(visibility, wantVisible, FADE_RATE, dt);
    if (wantVisible === 0 && visibility < 0.003) { visibility = 0; return; }

    // pose
    const sway = !quality.pointer || shouldSway(false, now, lastMoveAt);
    pose = reduced ? REST_POSE : followPose(pose, sway ? swayPose(clock) : target, sway, dt);
    const rotation = emblemRotation(pose, 1);
    nodes.pivot.rotation.y = rotation.yaw;
    nodes.pivot.rotation.x = rotation.pitch;

    // framing: from the gate's rectangle to the slot over the glide
    const gliding = !reduced && gateFraming !== null && seconds >= 0 ? glide(seconds) : seconds < 0 && gateFraming !== null && !reduced ? 0 : 1;
    const framing = gateFraming && gliding < 1 ? blendFraming(gateFraming, slotFraming, gliding) : slotFraming;
    camera.position.z = -framing.distance;
    nodes.root.position.set(framing.offsetX, framing.offsetY + (reduced ? 0 : Math.sin(clock * 0.8) * 0.018), 0);

    // light and glow
    const a = reduced ? { ...SETTLED, progress: -1, currentOn: false } : arrival(seconds);
    processing.exposure = a.exposure;
    rim.position.set(framing.offsetX + pose.x * 5.2, framing.offsetY - pose.y * 2, -1.5);
    rim.intensity = (22 + 10 * a.flash) * visibility;
    key.intensity = 1.6 * visibility;
    scene.environmentIntensity = visibility;
    environment.rotationY = pose.x * 0.22;
    steel.all.forEach(material => { material.alpha = visibility; });
    const pointer = new B.Vector3(pose.x * 5, -pose.y * 1.6, 0);
    const halo = (a.halo + (arcs.isActive() ? 0.25 : 0)) * visibility;
    for (const material of [haloMaterial, currentMaterial]) { material.setVector3('uPointer', pointer); material.setFloat('uTime', clock); material.setFloat('uFade', visibility); }
    haloMaterial.setFloat('uHalo', halo);
    currentMaterial.setFloat('uProgress', a.progress);
    currentMaterial.setFloat('uCurrent', a.currentOn ? 1 : 0);
    nodes.current.isVisible = a.currentOn && visibility > 0;
    (aura.material as typeof haloMaterial).setFloat('uStrength', (0.22 + 0.35 * a.flash + (arcs.isActive() ? 0.1 : 0)) * visibility);

    // arcs: one at a time, 2.6-4.2 s apart, once the opening is under way (never in a static frame)
    if (!reduced && seconds >= 0 && lateReady && visibility > 0.5) {
      const feather = scheduler.poll(seconds * 1000 + ARC_FIRST_MS - ARC_FIRST_MS);
      if (feather !== null) arcs.fire(feather, now);
    }
    arcs.update(now, visibility);

    scene.render();
    if (ready && !drewFirst) {
      drewFirst = true;
      timer('arena:first-frame');
      setFlag(ctx.root, 'arena', 'ready');
      ctx.onFirstFrame();
    }
  }

  return {
    render,
    dispose() {
      unsubscribeSlot(); unsubscribeAnchor();
      window.removeEventListener('pointermove', onPointerMove);
      arcs.dispose();
      scene.dispose();
    },
  };
}
