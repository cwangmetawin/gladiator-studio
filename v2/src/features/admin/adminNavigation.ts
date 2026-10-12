export type GameState = 'all' | 'live' | 'hidden';
export type EnquiryFilter = 'new' | 'handled' | 'all';

/** Keep a destination's preset with it, including through unsaved-edit confirmation. */
export type AdminDestination =
  | { readonly tab: 'dashboard' | 'content' }
  | { readonly tab: 'games'; readonly state?: GameState }
  | { readonly tab: 'enquiries'; readonly filter?: EnquiryFilter };
