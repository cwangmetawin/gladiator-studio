import type { CatalogueCounts } from '@/shared/content/StudioStats';

/** Resolve current-count copy, including older numbers stored in site content.
 *  Apply only to current marketing copy, never historical milestones or bios. */
export function withCatalogueCounts(text: string, counts: CatalogueCounts): string {
  return text
    .replace(/(?:\{\{games\}\}|\b\d+)( live)? titles?\b/gi, (_match, live = '') =>
      `${counts.games}${live} ${counts.games === 1 ? 'title' : 'titles'}`)
    .replace(/(?:\{\{slots\}\}|\b\d+) Gladiator slots?\b/gi, () =>
      `${counts.slots} Gladiator ${counts.slots === 1 ? 'slot' : 'slots'}`)
    .replace(/(?:\{\{originals\}\}|\b\d+) MetaWin Originals?\b/gi, () =>
      `${counts.originals} MetaWin ${counts.originals === 1 ? 'Original' : 'Originals'}`);
}
