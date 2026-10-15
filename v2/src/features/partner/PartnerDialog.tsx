import { useId, useRef, type ComponentProps, type ReactNode, type RefObject } from 'react';
import { ChevronRight } from 'lucide-react';
import { useDialogFocus } from '@/shared/hooks/useDialogFocus';
import { MiniEmblem } from '@/features/arena/FlatEmblem';
import { LiveTicker } from '@/features/live-feed/LiveTicker';
import { SoundToggle } from '@/shared/ui/SoundToggle';
import '@/features/arena/topBar.css';
import './partner.css';

interface PartnerDialogProps {
  readonly onClose: () => void;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly events: ComponentProps<typeof LiveTicker>['events'];
  readonly isConnected: boolean;
  readonly children: (titleId: string) => ReactNode;
}

/** The modal frame persists through loading, success and errors: one fade, one focus owner. */
export function PartnerDialog({ onClose, returnFocusRef, events, isConnected, children }: PartnerDialogProps) {
  const titleId = useId(), closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus<HTMLDivElement>({ onEscape: onClose, initialFocusRef: closeRef, returnFocusRef });
  return (
    <div ref={dialogRef} className="partner" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <img className="partner__backdrop" src="/arena/client-backdrop.svg" alt="" aria-hidden="true" width={1920} height={1080} />
      <div className="partner__shade" aria-hidden="true" />
      <header className="topbar partner__bar">
        <span className="topbar__brand">
          <MiniEmblem className="topbar__mark" />
          <span className="partner__brand-copy">
            <span className="topbar__name">Gladiator <span className="topbar__sub">Studio</span></span>
            <span className="partner__section-name">Partners</span>
          </span>
        </span>
        <div className="topbar__end">
          <SoundToggle />
          <button ref={closeRef} type="button" className="topbar__client" onClick={onClose}>
            Close<ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="partner__scroll">{children(titleId)}</div>
      <LiveTicker events={events} isConnected={isConnected} />
    </div>
  );
}
