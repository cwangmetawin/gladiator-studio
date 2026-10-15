export const WIN_INTERVAL_MS = 400;
export const BIG_WIN_INTERVAL_MS = 3000;
export const GAME_SWITCH_INTERVAL_MS = 180;

/** Leading edge only: suppressed changes are consumed, never queued for later playback. */
export function createCueThrottle(intervalMs: number) {
  let last = -Infinity;
  return (now: number): boolean => {
    if (!Number.isFinite(now) || now - last < intervalMs) return false;
    last = now;
    return true;
  };
}

/** Big wins also share the ordinary win budget, so mixed bursts stay quiet. */
export function createWinThrottle() {
  let lastWin = -Infinity;
  let lastBigWin = -Infinity;
  return (cue: 'alert' | 'bigWin', now: number): boolean => {
    if (now - lastWin < WIN_INTERVAL_MS || (cue === 'bigWin' && now - lastBigWin < BIG_WIN_INTERVAL_MS)) return false;
    lastWin = now;
    if (cue === 'bigWin') lastBigWin = now;
    return true;
  };
}
