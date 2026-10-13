export const GAME_PALETTE = [
  { name: 'holo cyan', hex: '#4fc3f7', r: 79 / 255, g: 195 / 255, b: 247 / 255 },
  { name: 'violet', hex: '#b39ddb', r: 179 / 255, g: 157 / 255, b: 219 / 255 },
  { name: 'gold', hex: '#ffd54f', r: 1, g: 213 / 255, b: 79 / 255 },
  { name: 'rose', hex: '#ef839a', r: 239 / 255, g: 131 / 255, b: 154 / 255 },
  { name: 'emerald', hex: '#66bb6a', r: 102 / 255, g: 187 / 255, b: 106 / 255 },
] as const;

export function gameKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** FNV-1a over a canonical name: independent of arrival order and session time. */
export function gameHash(value: string): number {
  const key = gameKey(value);
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function gameAccent(slugOrTitle: string) {
  return GAME_PALETTE[gameHash(slugOrTitle) % GAME_PALETTE.length]!;
}

export const CONSTELLATION_RADIUS = 160;
export interface SkyPosition { x: number; y: number; z: number; }

/** A fixed front-facing sky shell, wide enough to leave space around the hub. */
export function gameSkyPosition(name: string, out: SkyPosition = { x: 0, y: 0, z: 0 }): SkyPosition {
  const key = gameKey(name);
  out.x = (gameHash(key) / 0xffffffff - 0.5) * 200;
  out.y = (gameHash(`${key}:height`) / 0xffffffff - 0.5) * 140;
  out.z = Math.sqrt(CONSTELLATION_RADIUS ** 2 - out.x ** 2 - out.y ** 2);
  return out;
}
