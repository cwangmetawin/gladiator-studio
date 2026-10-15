// How the 3D emblem looks: every number that sets how bright its steel, its light and its glow are, in one place
// (they were scattered through installArena and steelMaterial). The values were tuned against the prototype's
// still (proto-a/still-1440.png) in a browser, over two rounds of side-by-side frames: change them only by looking at a frame.

export interface Look {
  /** Image contrast after ACES tone mapping. */
  readonly contrast: number;
  /** Image exposure at rest; the arrival flash raises it (ignition.ts). */
  readonly exposure: number;
  /** How strongly the baked studio environment lights the metal. */
  readonly environment: number;
  /** The warm key light's intensity, and the holo-blue rim light that follows the pointer (plus its extra during the arrival flash). */
  readonly key: number;
  readonly rim: number;
  readonly rimFlash: number;
  /** Multiplier on the glow rim's settled strength (ignition.ts SETTLED.halo) and on the arrival's. */
  readonly halo: number;
  /** How fast the brightest part of the glow rim runs to white (0: it stays holo blue). */
  readonly haloWhite: number;
  /** The soft glow plane behind the emblem: at rest, extra during the arrival flash, extra while an arc runs. */
  readonly aura: number;
  readonly auraFlash: number;
  readonly auraArc: number;
  /** How much of the steel nebula's brightness the home keeps (1: exactly the age gate's sky). The prototype's desktop sky is darker, so the bright emblem stands out; its phone sky is not. */
  readonly skyGain: number;
  readonly skyGainPhone: number;
  /** The metal's colour (its reflectivity tint). */
  readonly albedo: readonly [number, number, number];
}

export const LOOK: Look = {
  contrast: 1.32,
  exposure: 1.2,
  environment: 1.2,
  key: 1.9,
  rim: 22,
  rimFlash: 10,
  halo: 2.6,
  haloWhite: 1.4,
  aura: 0.3,
  auraFlash: 0.35,
  auraArc: 0.1,
  skyGain: 0.7,
  skyGainPhone: 1,
  albedo: [0.88, 0.92, 0.98],
};
