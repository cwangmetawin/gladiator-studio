import { approach } from '@/shared/utils/frameTime';
import { emblemAnchor } from '@/shared/brand/emblemAnchor';
import { homeReveal } from '@/shared/brand/homeReveal';
import { ARENA_FILES, loadEmblemAsset, mapUrl } from './arenaAssets';
import { arenaQuality } from './arenaQuality';
import { createArcScheduler } from './arcSchedule';
import { createArcs } from './arcs';
import { emblemSlot } from './emblemSlot';
import { createEmblemNodes } from './emblemMesh';
import { SETTLED, SETTLED_S, arrival, glide, type Arrival } from './ignition';
import { FOV_DESKTOP, FOV_PHONE, blendFraming, boxShares, emblemRect, framingFor, projectedBox, type Framing, type Rect } from './framing';
import { REST_POSE, emblemRotation, followPose, pointerPose, shouldSway, swayPose, type PointerPose } from './pointerFollow';
import { createAuraMaterial, createRibbonMaterial, HOLO } from './ribbonShaders';
import { installSteelSky, stepGrade } from './steelSky';
import { createSteelMaterials } from './steelMaterial';
import { LOOK } from './arenaLook';
import type { ArenaModule, BabylonModule, Engine, Scene } from './arenaTypes';

// The 3D emblem: a second Scene on the starfield's engine and canvas (one WebGL context). It is drawn
// after the starfield scene, on top of it, clearing only depth, with its own camera, lights, PBR studio
// environment and tone mapping, so nothing in the starfield scene (its camera, the constellation doors,
// the energy post pass) knows it exists. The steel sky (steelSky.ts) is the one thing it adds to the
// starfield scene, as a layer.

export type ArenaStatus = 'loading' | 'ready' | 'unavailable';

export interface ArenaContext {
  readonly canvas: HTMLCanvasElement;
  /** The starfield scene this one is drawn over. */
  readonly starScene: Scene;
  /** The sky root: it carries data-arena (status) and data-emblem-box (the emblem's box, for probes). */
  readonly root: HTMLElement | null;
  readonly phone: boolean;
  readonly reducedMotion: () => boolean;
  /** False while a panel (or the catalogue) has the home hidden: the emblem fades out with the hub. */
  readonly hubVisible: () => boolean;
  /** Called once, when every texture and shader the emblem needs is ready, so a loop that is not running can draw it. */
  readonly onReady: () => void;
  /** Called once, after the first frame with the emblem in it has been drawn. */
  readonly onFirstFrame: () => void;
}

export interface Arena {
  /** Advance the emblem and draw it. dt is seconds (0 for a static frame). */
  render(dt: number): void;
  dispose(): void;
}

const FADE_RATE = 18; // 1/s: about the hub's 160-180 ms fade
const HIDDEN = 0.003;
/** The probe attributes (pose) are refreshed this often, not every frame: a DOM write per frame is not free. */
const FLAG_EVERY_MS = 250;
/** Only the first few arcs leave a performance mark (for the timing probe); the timeline must not grow for ever. */
const ARC_MARKS = 12;
const BOB_UNITS = 0.018;
const REDUCED_ARRIVAL: Arrival = Object.freeze({ ...SETTLED, progress: -1, currentOn: false });

function setFlag(root: HTMLElement | null, name: string, value: string): void {
  if (root && root.dataset[name] !== value) root.dataset[name] = value;
}

const numbers = (values: readonly number[], digits: number): string => values.map(value => value.toFixed(digits)).join(',');

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
  processing.contrast = LOOK.contrast;
  processing.exposure = LOOK.exposure;

  const environment = new A.CubeTexture(ARENA_FILES.env, scene);
  scene.environmentTexture = environment;
  scene.environmentIntensity = LOOK.environment;

  // The sky goes first so the vignette layer is the first thing this scene draws.
  const sky = installSteelSky(B, ctx.starScene, scene);

  const texture = (file: string) => {
    const t = new B.Texture(mapUrl(file), scene, false, false, B.Texture.TRILINEAR_SAMPLINGMODE);
    t.wrapU = B.Texture.CLAMP_ADDRESSMODE; t.wrapV = B.Texture.CLAMP_ADDRESSMODE;
    t.anisotropicFilteringLevel = quality.anisotropy;
    return t;
  };
  const steel = createSteelMaterials(A, B, scene, { normal: texture(asset.maps.normal.file), rough: texture(asset.maps.rough.file) });
  const haloMaterial = createRibbonMaterial(B, scene, 'emblemHaloMaterial', 0.02 / (0.02 + 0.11));
  haloMaterial.setFloat('uWhite', LOOK.haloWhite);
  const currentMaterial = createRibbonMaterial(B, scene, 'emblemCurrentMaterial', 0.5);
  const nodes = createEmblemNodes(B, scene, asset, { cap: steel.cap, side: steel.side, halo: haloMaterial, current: currentMaterial });

  const auraMaterial = createAuraMaterial(B, scene);
  const aura = B.MeshBuilder.CreatePlane('emblemAura', { width: asset.width * 1.3, height: asset.height * 3.4 }, scene);
  aura.parent = nodes.pivot;
  aura.position.z = 0.9;
  aura.material = auraMaterial;
  aura.alphaIndex = -1;
  aura.isPickable = false;

  const key = new B.DirectionalLight('emblemKey', new B.Vector3(0.45, -0.55, 0.7), scene);
  key.diffuse = new B.Color3(1, 0.96, 0.92); key.specular = key.diffuse; key.intensity = LOOK.key;
  const rim = new B.PointLight('emblemRim', new B.Vector3(-3, 2, -1.6), scene);
  rim.diffuse = new B.Color3(...HOLO); rim.specular = rim.diffuse; rim.intensity = LOOK.rim;
  const arcLight = new B.PointLight('emblemArcLight', new B.Vector3(0, 0, -0.4), scene);
  arcLight.diffuse = new B.Color3(0.65, 0.86, 1); arcLight.specular = arcLight.diffuse; arcLight.intensity = 0;
  arcLight.parent = nodes.pivot;

  const arcs = createArcs(B, scene, asset.arcs, asset.placement, nodes.pivot, arcLight, Math.random);
  const scheduler = createArcScheduler(Math.random);

  // ── framing: the slot on the page, and the gate's rectangle the emblem starts from ──────────────────
  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
  let slotFraming: Framing = framingFor(emblemRect({ x: 0, y: 0, ...viewport() }, asset, 0.8), viewport(), asset.width, fov);
  let gateFraming: Framing | null = null;
  let seenViewport = viewport();

  function refreshFraming(): void {
    const slot = emblemSlot.getSnapshot();
    seenViewport = viewport();
    const vp = slot?.viewport ?? seenViewport;
    if (slot) slotFraming = framingFor(emblemRect(slot.slot, asset, slot.fraction), vp, asset.width, fov);
    // The gate draws its 2D emblem over the full emblem box; the 3D asset spans the same box.
    const anchor = emblemAnchor.getSnapshot();
    if (anchor) gateFraming = framingFor(anchor, seenViewport, asset.width, fov);
    const box: Rect = projectedBox(asset.cap.positions, slotFraming, vp, fov);
    const shares = boxShares(box, vp, slot?.stage ?? { x: 0, y: 0, ...vp });
    setFlag(ctx.root, 'emblemBox', numbers([box.x, box.y, box.width, box.height], 1));
    setFlag(ctx.root, 'emblemShare', numbers([shares.width, shares.viewportArea, shares.stageArea], 3));
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
  let grade = 1;
  let ready = false;
  let lateReady = false;
  let firstFrameAt: number | null = null;
  let arcsFired = 0;
  let flaggedAt = -Infinity;
  let clock = 0; // seconds of animated time, for the sway and the rim's shimmer
  const pointer = new B.Vector3();

  scene.executeWhenReady(() => { ready = true; performance.mark('arena:ready'); ctx.onReady(); });
  // Hidden materials (the arcs) would compile on first use and hitch: compile them now, in the background.
  void Promise.all(arcs.parts.map(part => part.mesh.material?.forceCompilationAsync(part.mesh).catch(() => null) ?? null)).then(() => { lateReady = true; });

  /** Seconds since the opening began: from the home's release, or from the first frame if that was later (no gate to wait under). -1: not begun. */
  function openingSeconds(now: number): number {
    const released = homeReveal.getSnapshot();
    if (released === null || firstFrameAt === null) return -1;
    return (now - Math.max(released, firstFrameAt)) / 1000;
  }

  function render(dt: number): void {
    const reduced = ctx.reducedMotion();
    const now = performance.now();
    const vp = viewport();
    if (vp.width !== seenViewport.width || vp.height !== seenViewport.height) refreshFraming();
    clock += dt;

    // The sky follows the hub whether or not the emblem itself is drawn.
    const hub = ctx.hubVisible();
    const instant = reduced || firstFrameAt === null;
    grade = stepGrade(grade, hub ? 1 : 0, dt, instant);
    sky.setGrade(grade);
    const wantVisible = hub ? 1 : 0;
    visibility = instant ? wantVisible : approach(visibility, wantVisible, FADE_RATE, dt);
    const hidden = wantVisible === 0 && visibility < HIDDEN;
    if (hidden) visibility = 0;
    nodes.root.setEnabled(!hidden);
    if (hidden && grade === 0) return; // nothing of the arena scene shows: draw nothing

    const seconds = reduced ? SETTLED_S + 1 : openingSeconds(now);

    // pose
    const sway = !quality.pointer || shouldSway(false, now, lastMoveAt);
    pose = reduced ? REST_POSE : followPose(pose, sway ? swayPose(clock) : target, sway, dt);
    const rotation = emblemRotation(pose, 1);
    nodes.pivot.rotation.y = rotation.yaw;
    nodes.pivot.rotation.x = rotation.pitch;
    if (now - flaggedAt >= FLAG_EVERY_MS) {
      flaggedAt = now;
      const degrees = 180 / Math.PI;
      setFlag(ctx.root, 'emblemPose', numbers([rotation.yaw * degrees, rotation.pitch * degrees], 1));
    }

    // framing: from the gate's rectangle to the slot over the glide (not at all when there was no gate or with reduced motion)
    const gliding = reduced || gateFraming === null ? 1 : seconds < 0 ? 0 : glide(seconds);
    const framing = gateFraming !== null && gliding < 1 ? blendFraming(gateFraming, slotFraming, gliding) : slotFraming;
    camera.position.z = -framing.distance;
    nodes.root.position.set(framing.offsetX, framing.offsetY + (reduced ? 0 : Math.sin(clock * 0.8) * BOB_UNITS), 0);

    // light and glow
    const a = reduced ? REDUCED_ARRIVAL : arrival(seconds);
    processing.exposure = a.exposure * LOOK.exposure;
    rim.position.set(framing.offsetX + pose.x * 5.2, framing.offsetY - pose.y * 2, -1.5);
    rim.intensity = (LOOK.rim + LOOK.rimFlash * a.flash) * visibility;
    key.intensity = LOOK.key * visibility;
    scene.environmentIntensity = LOOK.environment * visibility;
    environment.rotationY = pose.x * 0.22;
    steel.all.forEach(material => { material.alpha = visibility; });
    pointer.set(pose.x * 5, -pose.y * 1.6, 0);
    const halo = (a.halo * LOOK.halo + (arcs.isActive() ? 0.25 : 0)) * visibility;
    for (const material of [haloMaterial, currentMaterial]) { material.setVector3('uPointer', pointer); material.setFloat('uTime', clock); material.setFloat('uFade', visibility); }
    haloMaterial.setFloat('uHalo', halo);
    currentMaterial.setFloat('uProgress', a.progress);
    currentMaterial.setFloat('uCurrent', a.currentOn ? 1 : 0);
    nodes.current.isVisible = a.currentOn && visibility > 0;
    auraMaterial.setFloat('uStrength', (LOOK.aura + LOOK.auraFlash * a.flash + (arcs.isActive() ? LOOK.auraArc : 0)) * visibility);

    // arcs: one at a time, 2.6-4.2 s apart, once the opening is under way (never in a static frame)
    if (!reduced && seconds >= 0 && lateReady && visibility > 0.5) {
      const feather = scheduler.poll(seconds * 1000);
      if (feather !== null) {
        arcs.fire(feather, now);
        if (arcsFired++ < ARC_MARKS) performance.mark('arena:arc');
      }
    }
    arcs.update(now, visibility);

    scene.render();
    if (ready && firstFrameAt === null) {
      firstFrameAt = now;
      performance.mark('arena:first-frame');
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
      sky.dispose();
      scene.dispose();
    },
  };
}
