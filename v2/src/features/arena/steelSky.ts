import { SKY_TINT, SKY_VIGNETTE, skyVoid } from '@/shared/brand/brandSky';
import { approach } from '@/shared/utils/frameTime';
import { LOOK } from './arenaLook';
import type { BabylonModule, Scene } from './arenaTypes';

// The sky the first screen sits on. At home the starfield's colourful nebula is turned steel blue and pressed
// into the void with a vignette, the same recipe as the age gate's CSS sky (shared/brand/brandSky), so the gate
// dissolves into the 3D scene without the sky changing colour. Two pieces, both plain Babylon layers:
//   - a graded copy of the nebula (a 2D canvas applies the same `color` blend the gate's CSS does), drawn in the
//     starfield scene right above the colourful one, so the stars, planets and constellation doors above it
//     are untouched, and the door tint that gameSkyRenderer writes to the nebula layer applies to it too;
//   - the vignette, drawn in the arena scene before the emblem, over everything the starfield scene drew.
// `setGrade(0)` shows the colourful nebula again (while a panel is open, as in phase 3). The planets and the sun
// glow are not this module's: the starfield scene keeps them out of the picture at home by itself.

type Layer = InstanceType<BabylonModule['Layer']>;
type DynamicTexture = InstanceType<BabylonModule['DynamicTexture']>;

export interface SteelSky {
  /** 0..1: how much of the sky is steel. Cheap; call it every frame. */
  setGrade(grade: number): void;
  dispose(): void;
}

export const NEBULA_URL = '/nebula.webp';
const VIGNETTE_SIZE = { width: 512, height: 288 } as const;

interface Context2D {
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): { addColorStop(offset: number, colour: string): void };
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillStyle: unknown;
}

/**
 * Paints the vignette (the void colour, opaque at the edges) into a context of the given size: the same
 * ellipse as the gate's CSS gradient, drawn as a unit circle under a scale so its radii are fractions of
 * the canvas.
 */
export function drawVignette(ctx: Context2D, width: number, height: number): void {
  const { cx, cy, rx, ry, stops } = SKY_VIGNETTE;
  ctx.clearRect(0, 0, width, height);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [at, alpha] of stops) gradient.addColorStop(at, skyVoid(alpha));
  ctx.setTransform(width * rx, 0, 0, height * ry, width * cx, height * cy);
  ctx.fillStyle = gradient;
  ctx.fillRect(-4, -4, 8, 8); // far larger than the canvas in canvas pixels; the gradient pads with its last stop
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

async function gradedNebula(): Promise<HTMLCanvasElement> {
  const image = new Image();
  image.decoding = 'async';
  image.src = NEBULA_URL;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('steelSky: no 2D canvas');
  ctx.drawImage(image, 0, 0);
  ctx.globalCompositeOperation = 'color';
  ctx.fillStyle = SKY_TINT;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasTexture(B: BabylonModule, scene: Scene, name: string, canvas: HTMLCanvasElement): DynamicTexture {
  const texture = new B.DynamicTexture(name, canvas, scene, false, B.Texture.BILINEAR_SAMPLINGMODE);
  texture.wrapU = B.Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = B.Texture.CLAMP_ADDRESSMODE;
  texture.update();
  return texture;
}

function backgroundLayer(B: BabylonModule, scene: Scene, name: string, texture: DynamicTexture): Layer {
  const layer = new B.Layer(name, null, scene, true);
  layer.texture = texture;
  layer.color.a = 0;
  return layer;
}

/**
 * Adds the steel sky to the two scenes. The starfield scene must already hold its colourful nebula layer
 * (named 'nebulaBg'); the graded copy follows that layer's tint and its slow drift each frame.
 */
export function installSteelSky(B: BabylonModule, starScene: Scene, arenaScene: Scene): SteelSky {
  let grade = 0;
  let steel: { readonly layer: Layer; readonly texture: DynamicTexture } | null = null;
  let disposed = false;

  const vignetteCanvas = document.createElement('canvas');
  vignetteCanvas.width = VIGNETTE_SIZE.width;
  vignetteCanvas.height = VIGNETTE_SIZE.height;
  const vignetteContext = vignetteCanvas.getContext('2d');
  if (vignetteContext) drawVignette(vignetteContext, VIGNETTE_SIZE.width, VIGNETTE_SIZE.height);
  const vignetteTexture = canvasTexture(B, arenaScene, 'arenaVignetteTexture', vignetteCanvas);
  const vignette = backgroundLayer(B, arenaScene, 'arenaVignette', vignetteTexture);

  const nebula = starScene.layers.find(layer => layer.name === 'nebulaBg') ?? null;
  const follow = starScene.onBeforeRenderObservable.add(() => {
    if (!steel || !nebula) return;
    // The colourful layer's tint (and the drift its texture carries) is the steel layer's too.
    steel.layer.color.set(nebula.color.r * LOOK.skyGain, nebula.color.g * LOOK.skyGain, nebula.color.b * LOOK.skyGain, grade);
    const from = nebula.texture as InstanceType<BabylonModule['Texture']> | null;
    if (from) {
      steel.texture.uScale = from.uScale; steel.texture.vScale = from.vScale;
      steel.texture.uOffset = from.uOffset; steel.texture.vOffset = from.vOffset;
    }
  });

  gradedNebula().then(canvas => {
    if (disposed) return;
    const texture = canvasTexture(B, starScene, 'nebulaSteelTexture', canvas);
    steel = { layer: backgroundLayer(B, starScene, 'nebulaSteel', texture), texture };
  }).catch((error: unknown) => {
    // The colourful nebula simply stays: a missing grade is not worth a broken home.
    console.warn('[steelSky] the steel nebula could not be built:', error);
  });

  return {
    setGrade(next: number): void {
      grade = Math.min(1, Math.max(0, next));
      vignette.color.a = grade;
    },
    dispose(): void {
      disposed = true;
      starScene.onBeforeRenderObservable.remove(follow);
      steel?.layer.dispose();
      steel?.texture.dispose();
      vignette.dispose();
      vignetteTexture.dispose();
    },
  };
}

/** One step of the grade towards its target (1 at home, 0 while a panel is open); snaps when motion is reduced. */
export const GRADE_RATE = 5; // 1/s: about 0.5 s to turn the sky
export function stepGrade(current: number, target: number, dt: number, instant: boolean): number {
  if (instant) return target;
  const next = approach(current, target, GRADE_RATE, dt);
  return Math.abs(next - target) < 0.003 ? target : next;
}
