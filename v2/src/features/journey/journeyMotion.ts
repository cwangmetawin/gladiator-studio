import { JOURNEY_CHAPTERS, clampJourneyProgress, journeyChapterAt } from './chapters';

interface JourneyMotionState {
  readonly progress: number;
  readonly chapter: number;
  readonly count: number;
}

export function createJourneyMotion() {
  let snapshot: JourneyMotionState = { progress: 0, chapter: 0, count: JOURNEY_CHAPTERS.length };
  let chapterSnapshot = { chapter: snapshot.chapter, count: snapshot.count };
  const listeners = new Set<() => void>();
  const update = (progress: number, count: number): void => {
    const clamped = clampJourneyProgress(progress);
    const chapter = journeyChapterAt(clamped, count);
    if (clamped === snapshot.progress && count === snapshot.count) return;
    snapshot = { progress: clamped, chapter, count };
    // Babylon reads every progress sample; React only needs chapter boundaries.
    if (chapter !== chapterSnapshot.chapter || count !== chapterSnapshot.count) {
      chapterSnapshot = { chapter, count };
      listeners.forEach(listener => listener());
    }
  };
  return {
    getSnapshot: () => snapshot,
    getChapterSnapshot: () => chapterSnapshot,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setProgress: (progress: number): void => update(progress, snapshot.count),
    setCount: (count: number): void => update(snapshot.progress, Math.max(1, Math.min(JOURNEY_CHAPTERS.length, count))),
  };
}

export const journeyMotion = createJourneyMotion();
