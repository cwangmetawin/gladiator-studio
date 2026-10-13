import { approach } from '@/shared/utils/frameTime';
import type { TransitionState } from '@/shared/motion/transition';

export const SCENE_ENERGY_CALM = 0.18;
export const SCENE_ENERGY_FLIGHT = 0.9;
export const SCENE_ENERGY_RISE_RATE = 12; // inverse seconds; 95% response in 250 ms
export const SCENE_ENERGY_DECAY_RATE = 3; // inverse seconds; 95% settle in one second

type EnergyTransition = Pick<TransitionState, 'phase' | 'kind'>;

/** Navigation and drag share one bounded response, rather than stacking flashes. */
export function sceneEnergyTarget(transition: EnergyTransition, trailStrength: number, reducedMotion: boolean): number {
  if (reducedMotion) return SCENE_ENERGY_CALM;
  const trail = Number.isFinite(trailStrength) ? Math.max(0, Math.min(1, trailStrength)) : 0;
  const dragEnergy = SCENE_ENERGY_CALM + (1 - SCENE_ENERGY_CALM) * trail;
  const flying = transition.phase === 'flying' && (transition.kind === 'open' || transition.kind === 'switch');
  return Math.max(flying ? SCENE_ENERGY_FLIGHT : SCENE_ENERGY_CALM, dragEnergy);
}

/** dt comes from M1's capped render clock; reduced motion always snaps to rest. */
export function advanceSceneEnergy(current: number, transition: EnergyTransition, trailStrength: number, reducedMotion: boolean, dt: number): number {
  if (reducedMotion) return SCENE_ENERGY_CALM;
  const target = sceneEnergyTarget(transition, trailStrength, false);
  const rate = target > current ? SCENE_ENERGY_RISE_RATE : SCENE_ENERGY_DECAY_RATE;
  const energy = approach(current, target, rate, Math.max(0, dt));
  // Reach exact rest so the hub's material values and post-free buffer match M4a.
  return Math.abs(energy - target) < 0.0001 ? target : Math.max(0, Math.min(1, energy));
}
