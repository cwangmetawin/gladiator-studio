const CHAPTERS = ['Formation', 'Expansion', 'Horizon'] as const;

/** Balanced groups preserve arbitrary edited ordering and dates. */
export function groupJourneyChapters<T>(milestones: readonly T[]) {
  const count = Math.min(CHAPTERS.length, milestones.length);
  return Array.from({ length: count }, (_, index) => ({
    index, label: CHAPTERS[index]!,
    milestones: milestones.slice(Math.floor(index * milestones.length / count), Math.floor((index + 1) * milestones.length / count)),
  }));
}
