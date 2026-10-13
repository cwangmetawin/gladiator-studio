import type { CameraPose } from '@/shared/motion/cameraTween';

export const JOURNEY_CHAPTERS = [
  { label: 'Formation', alpha: 1.5, beta: Math.PI / 3.5, radiusScale: 1, x: 0, y: 0, z: 0, framing: 0.30 },
  { label: 'Expansion', alpha: 1.82, beta: Math.PI / 3.15, radiusScale: 0.90, x: 1, y: 1, z: -0.5, framing: 0.31 },
  { label: 'Horizon', alpha: 2.15, beta: Math.PI / 2.9, radiusScale: 1.18, x: -1, y: -0.8, z: 1, framing: 0.33 },
] as const;

export function clampJourneyProgress(progress: number): number {
  return Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
}

/** Balanced index groups preserve the back office's ordering and arbitrary dates. */
export function groupJourneyChapters<T>(milestones: readonly T[]) {
  const count = Math.min(JOURNEY_CHAPTERS.length, milestones.length);
  return Array.from({ length: count }, (_, index) => ({
    index,
    label: JOURNEY_CHAPTERS[index]!.label,
    milestones: milestones.slice(Math.floor(index * milestones.length / count), Math.floor((index + 1) * milestones.length / count)),
  }));
}

export function journeyChapterAt(progress: number, count: number = JOURNEY_CHAPTERS.length): number {
  const chapters = Math.max(1, count);
  return Math.min(chapters - 1, Math.floor(clampJourneyProgress(progress) * chapters));
}

/** Interpolate orbit, pivot and framing continuously, including when scrolling back. */
export function journeyCameraPose(base: CameraPose, progress: number, count: number = JOURNEY_CHAPTERS.length): CameraPose {
  const last = Math.max(0, Math.min(JOURNEY_CHAPTERS.length, count) - 1);
  const position = clampJourneyProgress(progress) * last;
  const low = Math.floor(position);
  const from = JOURNEY_CHAPTERS[low]!;
  const to = JOURNEY_CHAPTERS[Math.min(low + 1, last)]!;
  const t = position - low;
  const mix = (a: number, b: number) => a + (b - a) * t;
  const radius = base.radius * mix(from.radiusScale, to.radiusScale);
  return {
    alpha: mix(from.alpha, to.alpha), beta: mix(from.beta, to.beta), radius,
    x: base.x + mix(from.x, to.x), y: base.y + mix(from.y, to.y), z: base.z + mix(from.z, to.z),
    screenX: radius * mix(from.framing, to.framing),
  };
}
