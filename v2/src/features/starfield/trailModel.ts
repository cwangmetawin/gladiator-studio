export const TRAIL_FULL_SPEED = 1200; // CSS pixels / second
export const TRAIL_DECAY_MS = 900;
export const PHONE_TRAIL_DECAY_MS = 450;
const STALE_DRAG_MS = 80;
const DECAY_FLOOR = 0.01;

export function velocityStrength(velocity: number): number {
  return Number.isFinite(velocity) ? Math.min(1, Math.abs(velocity) / TRAIL_FULL_SPEED) : 0;
}

/** Pointer writes are synchronous; sampling uses elapsed time, never frame count. */
export function createTrailModel() {
  const state = { strength: 0, direction: 0, velocity: 0, dragging: false };
  let previousX = 0;
  let previousAt = 0;
  let decayAt = 0;
  let decayStrength = 0;

  function begin(x: number, now: number): void {
    previousX = x;
    previousAt = now;
    state.dragging = true;
    state.strength = state.velocity = state.direction = 0;
    decayStrength = 0;
  }

  function move(x: number, now: number, reduced = false): void {
    if (!state.dragging) return;
    const elapsed = Math.max(1, now - previousAt);
    state.velocity = (x - previousX) * 1000 / elapsed;
    state.direction = Math.sign(state.velocity);
    state.strength = reduced ? 0 : velocityStrength(state.velocity);
    previousX = x;
    previousAt = now;
    decayAt = now + STALE_DRAG_MS;
    decayStrength = state.strength;
  }

  function release(now: number): void {
    state.dragging = false;
    decayStrength = state.strength;
    decayAt = now;
  }

  function sample(now: number, phone = false, reduced = false): number {
    if (reduced) {
      state.strength = decayStrength = 0;
      return 0;
    }
    const duration = phone ? PHONE_TRAIL_DECAY_MS : TRAIL_DECAY_MS;
    const elapsed = Math.max(0, now - decayAt);
    state.strength = decayStrength * Math.exp(Math.log(DECAY_FLOOR) * elapsed / duration);
    if (elapsed >= duration || state.strength < DECAY_FLOOR) state.strength = 0;
    return state.strength;
  }

  return { state, begin, move, release, sample };
}
