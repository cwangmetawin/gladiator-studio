import { ExternalLink, Menu } from 'lucide-react';
import { SoundToggle } from '@/shared/ui/SoundToggle';
import { soundEngine } from '@/shared/utils/soundEngine';
import type { PanelId } from '@/shared/motion/transition';
import { MiniEmblem } from './FlatEmblem';
import { NAV_ITEMS } from './navItems';
import './topBar.css';

// The top bar (Phase 4 M1): the brand on the left, the seven sections in the middle in small mono
// capitals, the sound toggle and Client Area on the right; on a phone, the brand and a menu button (the
// drawer is App's). It replaced the seven orbiting dots, so each section button opens the panel the dot
// opened, through App's own handler: the transition, the camera flight and the focus return are unchanged.
// It mounts when the first screen is released and arrives by a CSS animation (a fade and a short drop).

export interface TopBarProps {
  readonly isConnected: boolean;
  readonly isMobile: boolean;
  /** The panel the transition is heading for ('none' at home). */
  readonly target: PanelId;
  /** Open the section, or close it when it is already open (App's handleActivate). */
  readonly onActivate: (id: PanelId) => void;
  readonly onClientArea: () => void;
  readonly onMenu: () => void;
  /** Phones hide the menu while a panel flies in or out, so focus can return to it cleanly. */
  readonly menuVisible: boolean;
  /** Something full-screen has the page (a phone's panel, the desktop catalogue): the bar is hidden and inert, but stays mounted so its arrival does not replay. */
  readonly covered: boolean;
}

export function TopBar({ isConnected, isMobile, target, onActivate, onClientArea, onMenu, menuVisible, covered }: TopBarProps) {
  return (
    <header role="banner" aria-label="Studio" className="topbar" data-covered={covered ? '' : undefined} inert={covered}>
      <span className="topbar__brand" aria-label="Gladiator Studio">
        <MiniEmblem className="topbar__mark" />
        <span className="topbar__name">Gladiator</span>
        <span className="topbar__sub" aria-hidden="true">Studio</span>
      </span>

      {!isMobile && (
        <nav className="topbar__nav" aria-label="Sections">
          <ul>
            {NAV_ITEMS.map(({ short, panelId }) => (
              <li key={panelId}>
                <button type="button" className="topbar__item" data-cursor="OPEN" aria-pressed={target === panelId}
                  aria-label={panelId === 'live' ? `Live feed, ${isConnected ? 'connected' : 'offline'}` : undefined}
                  onMouseEnter={() => soundEngine.hover()} onClick={() => onActivate(panelId)}>
                  {panelId === 'live' && <i className="topbar__dot" data-live={isConnected} aria-hidden="true" />}
                  {short}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="topbar__end">
        <SoundToggle />
        {isMobile ? (
          <button type="button" className="topbar__menu" aria-label="Open menu"
            aria-hidden={!menuVisible} tabIndex={menuVisible ? 0 : -1} style={{ visibility: menuVisible ? 'visible' : 'hidden' }}
            onClick={onMenu}>
            <Menu size={14} aria-hidden="true" />
            Menu
          </button>
        ) : (
          <button type="button" className="topbar__client" onMouseEnter={() => soundEngine.hover()} onClick={onClientArea}>
            Client Area
            <ExternalLink size={12} aria-hidden="true" />
          </button>
        )}
      </div>
    </header>
  );
}
