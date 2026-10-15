import type { ComponentProps } from 'react';
import { ArenaPageShell } from '@/features/arena-page/ArenaPageShell';
import './partner.css';

type PartnerDialogProps = Omit<ComponentProps<typeof ArenaPageShell>, 'page' | 'onNavigate'>;

/** Keep the Client Area's persistent loading/error frame and original composition. */
export function PartnerDialog(props: PartnerDialogProps) {
  return <ArenaPageShell {...props} page="partner" />;
}
