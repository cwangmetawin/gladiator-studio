import type { AdminGame } from '@/api/catalogueDb';
import type { GameCategory } from '@/shared/types/game';
import { defaultRtp } from '@/shared/utils/gameRtp';

/** Keep a new game's suggested RTP in sync until the operator edits the field. */
export function withGameCategory(game: AdminGame, category: GameCategory, rtpEdited: boolean): AdminGame {
  return { ...game, category, rtp: rtpEdited ? game.rtp : defaultRtp(category) };
}
