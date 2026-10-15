import { schedulePageIdleWork } from './pageBodyWork';

/** Speculative and visible loads share promises; a failed idle load can retry on landing. */
function memoizeLoad<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => pending ??= load().catch((error: unknown) => { pending = null; throw error; });
}

export const pageBodyLoaders = {
  games: memoizeLoad(() => import('@/features/games/GamesPage').then(m => ({ default: m.GamesPage }))),
  about: memoizeLoad(() => import('@/features/about/AboutSection').then(m => ({ default: m.AboutSection }))),
  team: memoizeLoad(() => import('@/features/team/TeamSection').then(m => ({ default: m.TeamSection }))),
  journey: memoizeLoad(() => import('@/features/journey/JourneySection').then(m => ({ default: m.JourneySection }))),
  live: memoizeLoad(() => import('@/features/live-feed/LiveActivityFeed').then(m => ({ default: m.LiveActivityFeed }))),
  careers: memoizeLoad(() => import('@/features/careers/CareersSection').then(m => ({ default: m.CareersSection }))),
  contact: memoizeLoad(() => import('@/features/contact/ContactSection').then(m => ({ default: m.ContactSection }))),
  partner: memoizeLoad(() => import('@/features/partner/PartnerArea').then(m => ({ default: m.PartnerArea }))),
};

/** Warm one chunk per idle turn after home is released; never start a new import during a flight. */
export function schedulePageBodyWarmup(): () => void {
  const loads = Object.values(pageBodyLoaders);
  let cancelled = false, index = 0, cancelIdle = () => {};
  const next = () => {
    if (cancelled || index === loads.length) return;
    cancelIdle = schedulePageIdleWork(() => { void loads[index++]!().catch(() => {}).then(next); });
  };
  next();
  return () => { cancelled = true; cancelIdle(); };
}
