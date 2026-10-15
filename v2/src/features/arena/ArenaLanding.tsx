import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useCatalogueGames, useStudioStats } from '@/shared/content/StudioStats';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { useMotionPreference } from '@/shared/motion/useMotionPreference';
import type { Game } from '@/shared/types/game';
import { HallCopy } from './HallCopy';
import { featuredGames } from './hallCatalogue';
import { bindHallControls } from './hallControls';
import { playDetail, type HallPlay } from './hallActions';
import { coverForGame, COVER_MANIFEST } from './hallManifest';
import { hallOffset } from './hallProgress';
import { hallContent, hallDrawn } from './hallState';
import { journeyProgress } from './journeyProgress';
import { createHallSound } from './arenaSound';
import { soundEngine } from '@/shared/utils/soundEngine';
import './hall.css';

interface ArenaLandingProps {
  readonly visible: boolean;
  readonly interactive: boolean;
  readonly onPlayGame: (game: HallPlay) => void;
}

export function ArenaLanding({ visible, interactive, onPlayGame }: ArenaLandingProps) {
  const catalogue = useCatalogueGames(), stats = useStudioStats();
  const games = useMemo(() => featuredGames(catalogue), [catalogue]);
  const phone = useIsMobile(), reduced = useMotionPreference();
  // A phone remains in the small-texture tier in landscape. Coarse-pointer
  // devices also start there when their first viewport is already wide.
  const [phoneTier] = useState(() => phone || (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches));
  const compact = phone || phoneTier;
  const [activated, setActivated] = useState(false);
  const root = useRef<HTMLElement>(null), enabled = useRef(false);
  const controls = useRef<ReturnType<typeof bindHallControls> | null>(null);
  const switchSound = useMemo(() => createHallSound(soundEngine.gameSwitch), []);
  const index = useSyncExternalStore(journeyProgress.subscribe,
    () => Math.round(hallOffset(journeyProgress.getSnapshot(), games.length, reduced)), () => 0);
  const rendered = useSyncExternalStore(hallDrawn.subscribe, hallDrawn.getSnapshot, () => false);
  const items = useMemo(() => games.map(game => ({ game, cover: coverForGame(game, COVER_MANIFEST, compact), compact })), [games, compact]);
  const selectedIdentity = games[index] ? String(games[index].id) : null;
  useLayoutEffect(() => {
    const sync = (): void => switchSound.update(selectedIdentity,
      visible && interactive && (typeof document === 'undefined' || !document.hidden));
    sync();
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [switchSound, selectedIdentity, visible, interactive]);

  useLayoutEffect(() => { enabled.current = visible && interactive; }, [visible, interactive]);
  useLayoutEffect(() => {
    if (!root.current) return;
    const binding = bindHallControls(root.current, games.length, () => enabled.current);
    controls.current = binding;
    return () => { binding.dispose(); controls.current = null; };
  }, [games.length]);
  useEffect(() => { if (visible) setActivated(true); }, [visible]);
  useLayoutEffect(() => {
    hallContent.publish(activated ? items : []);
    return () => { hallContent.publish([]); };
  }, [activated, items]);

  const play = (game: Game): void => { const detail = playDetail(game); if (detail && enabled.current) onPlayGame(detail); };
  return <HallCopy games={games} index={index} total={stats.games} visible={visible && interactive}
    activated={activated} rendered={rendered} cover={items[index]?.cover ?? null} rootRef={root}
    onSelect={at => controls.current?.select(at)} onPlay={play} />;
}
