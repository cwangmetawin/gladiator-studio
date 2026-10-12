import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { sceneEvents } from '@/shared/utils/sceneEvents';
import { lookupGame } from '@/features/live-feed/liveCatalogue';

// A win earns the spotlight when it sets a new session record (above a floor so the
// first cent-sized bets don't qualify) or is simply large. Throttled so a burst of
// records never stacks up, and each flash clears itself.
const RECORD_FLOOR_USD = 5;
const ALWAYS_SHOW_USD = 100;
const MIN_GAP_MS = 6000;
const SHOW_MS = 3800;

interface Flash {
  readonly key: number;
  readonly amount: number;
  readonly gameName: string;
  readonly isRecord: boolean;
}

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Gold holo call-out above the live ticker on the homepage when a standout win lands.
 *  Decorative (the ticker already carries every win), so it is hidden from AT. */
export function BigWinFlash() {
  const [flash, setFlash] = useState<Flash | null>(null);
  const bestRef = useRef(0);
  const lastShownRef = useRef(0);
  const seqRef = useRef(0);

  useEffect(() => {
    let hideTimer = 0;
    const unsubscribe = sceneEvents.onWin(({ amount, gameName }) => {
      const isRecord = amount >= RECORD_FLOOR_USD && amount > bestRef.current;
      bestRef.current = Math.max(bestRef.current, amount);
      if (!isRecord && amount < ALWAYS_SHOW_USD) return;
      const now = Date.now();
      if (now - lastShownRef.current < MIN_GAP_MS) return;
      lastShownRef.current = now;
      seqRef.current += 1;
      setFlash({ key: seqRef.current, amount, gameName, isRecord });
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setFlash(null), SHOW_MS);
    });
    return () => { unsubscribe(); window.clearTimeout(hideTimer); };
  }, []);

  const entry = flash ? lookupGame(flash.gameName) : undefined;

  return (
    <div className="bigwin-anchor" aria-hidden="true">
      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash.key}
            className="bigwin"
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.35 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          >
            <span className="bigwin__sweep" />
            {entry?.image
              ? <img className="bigwin__thumb" src={entry.image} alt="" />
              : <span className="bigwin__thumb bigwin__thumb--mono">{(entry?.title ?? flash.gameName).charAt(0).toUpperCase()}</span>}
            <span className="bigwin__text">
              <span className="bigwin__tag">{flash.isRecord ? 'Session record' : 'Big win'}</span>
              <span className="bigwin__game">{entry?.title ?? flash.gameName}</span>
            </span>
            <span className="bigwin__amt">{usd(flash.amount)}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
