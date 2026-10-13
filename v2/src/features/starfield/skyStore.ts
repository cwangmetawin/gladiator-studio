import { gameAccent } from './gameIdentity';
import { createTrailModel } from './trailModel';
import { createConstellationStore } from './constellationStore';
import type { DoorCandidate } from './doorSelection';

export const SKY_TINT_MIX = 0.12;
export const SKY_TINT_RATE = 8;

export function createSkyStore(now: () => number = () => performance.now()) {
  const trail = createTrailModel();
  const constellations = createConstellationStore();
  const tint = { r: 0.6, g: 0.6, b: 0.66, targetR: 0.6, targetG: 0.6, targetB: 0.66 };
  const projections: DoorCandidate[] = constellations.groups.map(constellation => ({
    constellation, rect: { left: 0, top: 0, right: 0, bottom: 0 }, visible: false, gameTitle: '',
  }));
  const changes = new Set<() => void>();
  const frames = new Set<() => void>();
  const notify = (listener: () => void): void => listener();
  let gameName = '';
  let accentKey = '';
  let phone = false;
  let reduced = false;
  let ready = false;

  function snapTint(): void {
    tint.r = tint.targetR; tint.g = tint.targetG; tint.b = tint.targetB;
  }

  function advance(at: number, dt: number): boolean {
    trail.sample(at, phone, reduced);
    const blend = reduced ? 1 : 1 - Math.exp(-SKY_TINT_RATE * dt);
    tint.r += (tint.targetR - tint.r) * blend;
    tint.g += (tint.targetG - tint.g) * blend;
    tint.b += (tint.targetB - tint.b) * blend;
    return constellations.update(at);
  }

  return {
    trail, constellations, tint, projections, advance,
    get gameName() { return gameName; }, get phone() { return phone; }, get reduced() { return reduced; },
    get ready() { return ready; },
    setReady(value: boolean): void { ready = value; frames.forEach(notify); },
    configure(isPhone: boolean, isReduced: boolean): void {
      if (phone === isPhone && reduced === isReduced) return;
      phone = isPhone; reduced = isReduced;
      constellations.configure(phone, reduced, now());
      trail.sample(now(), phone, reduced);
      if (reduced) snapTint();
      changes.forEach(notify);
    },
    focusGame(title: string, slug?: string): void {
      const key = slug || title;
      if (gameName === title && accentKey === key) return;
      gameName = title; accentKey = key;
      const accent = gameAccent(key);
      tint.targetR = 0.6 * (1 - SKY_TINT_MIX + SKY_TINT_MIX * accent.r);
      tint.targetG = 0.6 * (1 - SKY_TINT_MIX + SKY_TINT_MIX * accent.g);
      tint.targetB = 0.66 * (1 - SKY_TINT_MIX + SKY_TINT_MIX * accent.b);
      if (reduced) snapTint();
      changes.forEach(notify);
    },
    addWin(title: string, amount: number): void { constellations.addWin(title, amount, now()); changes.forEach(notify); },
    beginDrag(x: number, at: number): void { trail.begin(x, at); changes.forEach(notify); },
    moveDrag(x: number, at: number): void { trail.move(x, at, reduced); changes.forEach(notify); },
    releaseDrag(at: number): void { trail.release(at); changes.forEach(notify); },
    maintain(): void {
      const previous = Math.round(trail.state.strength * 100);
      if (advance(now(), 0) || previous !== Math.round(trail.state.strength * 100)) changes.forEach(notify);
    },
    publishFrame(): void { frames.forEach(notify); },
    subscribe(listener: () => void): () => void { changes.add(listener); return () => { changes.delete(listener); }; },
    onFrame(listener: () => void): () => void { frames.add(listener); return () => { frames.delete(listener); }; },
  };
}

export const skyStore = createSkyStore();
