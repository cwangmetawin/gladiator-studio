import { useId, useLayoutEffect, useRef, type ComponentProps, type ReactNode, type RefObject } from 'react';
import { ChevronRight } from 'lucide-react';
import { useDialogFocus } from '@/shared/hooks/useDialogFocus';
import { MiniEmblem } from '@/features/arena/FlatEmblem';
import { LiveTicker } from '@/features/live-feed/LiveTicker';
import { SoundToggle } from '@/shared/ui/SoundToggle';
import { NAV_ITEMS } from '@/features/arena/navItems';
import type { ArenaPageId } from './useArenaPage';
import '@/features/arena/topBar.css';
import './arenaPage.css';

interface ArenaPageShellProps {
  readonly page: ArenaPageId | 'partner';
  readonly onClose: () => void;
  readonly onNavigate?: (page: ArenaPageId) => void;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly events: ComponentProps<typeof LiveTicker>['events'];
  readonly isConnected: boolean;
  readonly children: (titleId: string) => ReactNode;
}

/** One modal/focus owner across page switches; the Client Area keeps its original bar. */
export function ArenaPageShell({ page, onClose, onNavigate, returnFocusRef, events, isConnected, children }: ArenaPageShellProps) {
  const titleId = useId(), closeRef = useRef<HTMLButtonElement>(null), scrollRef = useRef<HTMLDivElement>(null);
  const dialogRef = useDialogFocus<HTMLDivElement>({ onEscape: onClose, initialFocusRef: closeRef, returnFocusRef });
  useLayoutEffect(() => {
    if (page === 'partner') return;
    scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    scrollRef.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }, [page]);
  return (
    <div ref={dialogRef} className={`partner arena-page${page === 'partner' ? '' : ' arena-page--section'}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <img className="partner__backdrop" src="/arena/client-backdrop.svg" alt="" aria-hidden="true" width={1920} height={1080} />
      <div className="partner__shade" aria-hidden="true" />
      <header className="topbar partner__bar">
        <span className="topbar__brand">
          <MiniEmblem className="topbar__mark" />
          <span className="partner__brand-copy">
            <span className="topbar__name">Gladiator <span className="topbar__sub">Studio</span></span>
            <span className="partner__section-name">{page === 'partner' ? 'Partners' : NAV_ITEMS.find(item => item.panelId === page)?.short}</span>
          </span>
        </span>
        {onNavigate && <nav className="arena-page__nav" aria-label="Sections"><ul>
          {NAV_ITEMS.map(({ short, panelId }) => <li key={panelId}>
            <a href={`#${panelId}`} aria-current={page === panelId ? 'page' : undefined}
              onClick={event => { event.preventDefault(); if (panelId !== 'none') onNavigate(panelId); }}>{short}</a>
          </li>)}
        </ul></nav>}
        <div className="topbar__end">
          <SoundToggle />
          <button ref={closeRef} type="button" className="topbar__client" onClick={onClose}>
            Close<ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div ref={scrollRef} className="partner__scroll">{children(titleId)}</div>
      <LiveTicker events={events} isConnected={isConnected} />
    </div>
  );
}
