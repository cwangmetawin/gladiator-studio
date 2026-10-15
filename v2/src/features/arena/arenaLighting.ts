import type { RGB } from './hallLayout';

/** Shared by the real floor shader and the composition raster used by the text-contrast check. */
export const ARENA_LIGHTING = {
  theme: [0.46, 0.76, 0.92] as RGB,
  ground: [0.064, 0.089, 0.112] as RGB,
  sand: [0.142, 0.164, 0.168] as RGB,
  key: [0.145, 0.128, 0.084] as RGB,
  fill: [0.033, 0.074, 0.105] as RGB,
  thin: 0.28, bold: 1.05, rim: 1.8, radial: 0.32, halo: 0.19, grain: 0.006,
} as const;
const clamp = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (lo: number, hi: number, x: number): number => { const t = clamp((x - lo) / (hi - lo)); return t * t * (3 - 2 * t); };
const mod = (x: number, y: number): number => x - y * Math.floor(x / y);

/** Coordinates are relative to ARENA_CENTER. The footprint stands in for shader derivatives, against the night sky. */
export function sampleArenaFloor(x: number, z: number, time = 0, footprint = 0.025, theme: RGB = ARENA_LIGHTING.theme): RGB {
  const radius = Math.hypot(x, z), angle = Math.atan2(z, x), aa = Math.max(footprint * 1.2, 0.0001);
  const line = (distance: number, width: number): number => 1 - smooth(width, width + aa, Math.abs(distance));
  const m = mod(radius, 1.6), m8 = mod(radius + 0.8, 8), segment = Math.PI * 2 / 32;
  const thin = line(Math.min(m, 1.6 - m), 0.009), bold = line(Math.min(m8, 8 - m8), 0.038);
  const edge = line(radius - 12, 0.055), radialDistance = (mod(angle + segment * 0.5, segment) - segment * 0.5) * radius;
  const radial = line(radialDistance, 0.013) * smooth(2, 3, radius) * (1 - Number(radius >= 12));
  const sand = 1 - smooth(11.5, 12.5, radius), fade = 1 - smooth(21, 30, radius);
  const pulse = 0.88 + 0.12 * Math.sin(radius * 0.7 - time * 0.6);
  const key = Math.exp(-((x + 4) ** 2 / 56 + (z - 3) ** 2 / 78));
  const fill = Math.exp(-((x - 8) ** 2 / 115 + (z + 6) ** 2 / 85));
  const grain = Math.sin(x * 65.2 + z * 47.7) * Math.sin(x * 23.9 - z * 82.1) * ARENA_LIGHTING.grain * sand;
  const halo = Math.exp(-((radius - 12) ** 2) / 0.4) * ARENA_LIGHTING.halo;
  const light = (thin * ARENA_LIGHTING.thin + bold * ARENA_LIGHTING.bold * pulse) * sand
    + edge * ARENA_LIGHTING.rim + radial * ARENA_LIGHTING.radial + halo;
  return ARENA_LIGHTING.ground.map((ground, i) => (ground + (ARENA_LIGHTING.sand[i]! - ground) * sand
    + ARENA_LIGHTING.key[i]! * key * sand + ARENA_LIGHTING.fill[i]! * fill + grain + theme[i]! * light * fade) * fade) as unknown as RGB;
}

const vec3 = (rgb: RGB): string => `vec3(${rgb.map(value => value.toFixed(5)).join(', ')})`;
export const FLOOR_LIGHTING_GLSL = `
  float key = exp(-((p.x + 4.0) * (p.x + 4.0) / 56.0 + (p.y - 3.0) * (p.y - 3.0) / 78.0));
  float fill = exp(-((p.x - 8.0) * (p.x - 8.0) / 115.0 + (p.y + 6.0) * (p.y + 6.0) / 85.0));
  float grain = sin(p.x * 65.2 + p.y * 47.7) * sin(p.x * 23.9 - p.y * 82.1) * ${ARENA_LIGHTING.grain} * sand;
  float halo = exp(-(radius - 12.0) * (radius - 12.0) / 0.4) * ${ARENA_LIGHTING.halo};
  float light = (thin * ${ARENA_LIGHTING.thin} + bold * ${ARENA_LIGHTING.bold} * pulse) * sand
    + edge * ${ARENA_LIGHTING.rim} + radial * ${ARENA_LIGHTING.radial} + halo;
  vec3 base = mix(${vec3(ARENA_LIGHTING.ground)}, ${vec3(ARENA_LIGHTING.sand)}, sand);
  base += ${vec3(ARENA_LIGHTING.key)} * key * sand + ${vec3(ARENA_LIGHTING.fill)} * fill + grain;
`;
