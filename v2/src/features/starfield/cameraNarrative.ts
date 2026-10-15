import { perSecond } from '@/shared/utils/frameTime';

/** Preserve the homepage's slow orbit; section pages no longer move this camera. */
export function driftHomeCamera(alpha: number, dt: number, phone: boolean): number {
  return alpha + perSecond(phone ? 0.00035 : 0.00060) * dt;
}
