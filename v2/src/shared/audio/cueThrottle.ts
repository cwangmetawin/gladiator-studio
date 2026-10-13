export const WIN_INTERVAL_MS = 400;
export const BIG_WIN_INTERVAL_MS = 3000;

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
