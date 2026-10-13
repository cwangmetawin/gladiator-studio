import { gameAccent, gameHash, gameKey, gameSkyPosition, type SkyPosition } from './gameIdentity';

export const MAX_CONSTELLATIONS = 64;
export const STARS_PER_CONSTELLATION = 12;
export const PHONE_STARS_PER_CONSTELLATION = 6;
export const STAR_LIFETIME_MS = 60000;
export const STAR_FADE_MS = 20000;

export interface ConstellationStar extends SkyPosition {
  born: number;
  brightness: number;
  alpha: number;
  active: boolean;
}

export interface Constellation {
  key: string;
  hash: number;
  gameName: string;
  readonly position: SkyPosition;
  accent: ReturnType<typeof gameAccent>;
  readonly stars: readonly ConstellationStar[];
  count: number;
  brightness: number;
  lastWinAt: number;
  sequence: number;
}

/** A bounded logarithm keeps small wins visible without letting jackpots wash out the sky. */
export function winBrightness(amount: number): number {
  const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return 0.25 + 0.75 * Math.min(1, Math.log1p(safe) / Math.log1p(1000000));
}

export function starOpacity(born: number, now: number, reduced = false): number {
  const age = Math.max(0, now - born);
  if (age >= STAR_LIFETIME_MS) return 0;
  return reduced ? 1 : Math.min(1, (STAR_LIFETIME_MS - age) / STAR_FADE_MS);
}

/** All groups and star slots are allocated once, including slots for future games. */
export function createConstellationStore() {
  const groups: Constellation[] = Array.from({ length: MAX_CONSTELLATIONS }, () => ({
    key: '', hash: 0, gameName: '', position: { x: 0, y: 0, z: 0 }, accent: gameAccent(''),
    stars: Array.from({ length: STARS_PER_CONSTELLATION }, () => ({
      x: 0, y: 0, z: 0, born: 0, brightness: 0, alpha: 0, active: false,
    })),
    count: 0, brightness: 0, lastWinAt: -Infinity, sequence: 0,
  }));
  let phone = false;
  let reduced = false;
  let count = 0;
  let revision = 0;

  function update(now: number): boolean {
    let changed = false;
    count = 0;
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]!;
      const previous = group.count;
      group.count = 0;
      group.brightness = 0;
      for (let j = 0; j < group.stars.length; j++) {
        const star = group.stars[j]!;
        if (!star.active) continue;
        const opacity = starOpacity(star.born, now, reduced);
        star.active = opacity > 0;
        star.alpha = star.brightness * opacity;
        if (star.active) { group.count++; group.brightness += star.alpha; }
      }
      if (group.count > 0) count++;
      if (group.count !== previous) changed = true;
    }
    if (changed) revision++;
    return changed;
  }

  function addWin(gameName: string, amount: number, now: number): void {
    const key = gameKey(gameName);
    if (!key) return;
    update(now);
    let group: Constellation | undefined;
    let reusable = groups[0]!;
    for (let i = 0; i < groups.length; i++) {
      const candidate = groups[i]!;
      if (candidate.key === key) { group = candidate; break; }
      if ((candidate.count === 0 && reusable.count > 0)
        || (candidate.count === 0) === (reusable.count === 0) && candidate.lastWinAt < reusable.lastWinAt) reusable = candidate;
    }
    if (!group) {
      group = reusable;
      group.key = key;
      group.hash = gameHash(key);
      group.gameName = gameName.trim();
      gameSkyPosition(key, group.position);
      group.accent = gameAccent(key);
      group.sequence = 0;
      for (let i = 0; i < group.stars.length; i++) {
        group.stars[i]!.active = false;
        group.stars[i]!.alpha = 0;
      }
    }
    const cap = phone ? PHONE_STARS_PER_CONSTELLATION : STARS_PER_CONSTELLATION;
    let star = group.stars[0]!;
    let activeCount = 0;
    for (let i = 0; i < group.stars.length; i++) if (group.stars[i]!.active) activeCount++;
    for (let i = 0; i < group.stars.length; i++) {
      const candidate = group.stars[i]!;
      if (activeCount < cap && !candidate.active) { star = candidate; break; }
      if (candidate.active && (!star.active || candidate.born < star.born)) star = candidate;
    }
    const hash = gameHash(`${key}:star:${group.sequence++}`);
    const angle = hash / 0xffffffff * Math.PI * 2;
    const distance = 2 + (hash % 700) / 100;
    star.x = group.position.x + Math.cos(angle) * distance;
    star.y = group.position.y + Math.sin(angle) * distance;
    star.z = group.position.z + ((hash >>> 16) % 200) / 100 - 1;
    star.born = now;
    star.brightness = winBrightness(amount);
    star.alpha = star.brightness;
    star.active = true;
    group.lastWinAt = now;
    revision++;
    update(now);
  }

  function configure(isPhone: boolean, isReduced: boolean, now: number): void {
    phone = isPhone;
    reduced = isReduced;
    // Keep the newest six when switching to a phone-sized viewport.
    if (phone) {
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i]!;
        while (group.stars.reduce((n, star) => n + Number(star.active), 0) > PHONE_STARS_PER_CONSTELLATION) {
          let oldest: ConstellationStar | undefined;
          for (let j = 0; j < group.stars.length; j++) {
            const star = group.stars[j]!;
            if (star.active && (!oldest || star.born < oldest.born)) oldest = star;
          }
          if (oldest) { oldest.active = false; oldest.alpha = 0; }
        }
      }
    }
    revision++;
    update(now);
  }

  return { groups, addWin, update, configure, get count() { return count; }, get revision() { return revision; } };
}
