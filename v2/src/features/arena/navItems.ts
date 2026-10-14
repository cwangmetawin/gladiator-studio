import { Gamepad2, Info, Users, Map as MapIcon, Radio, Briefcase, Mail } from 'lucide-react';
import type { ComponentType } from 'react';
import type { PanelId } from '@/shared/motion/transition';

export interface NavItem {
  readonly label: string;
  /** The word on the top bar, where a long label ("Live Feed") would crowd its neighbours. */
  readonly short: string;
  readonly panelId: PanelId;
  readonly icon: ComponentType<{ size?: number }>;
}

/** The seven sections: the top bar, the bottom command bar, the phone drawer and the panel headings all read this list. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Games', short: 'Games', panelId: 'games', icon: Gamepad2 },
  { label: 'About', short: 'About', panelId: 'about', icon: Info },
  { label: 'Team', short: 'Team', panelId: 'team', icon: Users },
  { label: 'Journey', short: 'Journey', panelId: 'journey', icon: MapIcon },
  { label: 'Live Feed', short: 'Live', panelId: 'live', icon: Radio },
  { label: 'Careers', short: 'Careers', panelId: 'careers', icon: Briefcase },
  { label: 'Contact', short: 'Contact', panelId: 'contact', icon: Mail },
] as const;
