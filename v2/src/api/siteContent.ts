import { supabase } from '@/lib/supabase';
import careersDefault from './careersDefault.json';
import aboutDefault from './aboutDefault.json';
import journeyDefault from './journeyDefault.json';
import partnerDefault from './partnerDefault.json';
import teamDefault from './teamDefault.json';

// ─── Structured, per-section page content ───────────────────────────────────
// One site_content row per section (key = section id, value = JSON document).
// The schema below drives BOTH the admin editor and the defaults the live site
// falls back to. Fields can be scalars or `list`s of sub-objects (e.g. team
// members), so any page can be edited to its own structure.

export type FieldType = 'text' | 'textarea' | 'number' | 'image' | 'list' | 'tags' | 'bullets' | 'select' | 'period';

export interface FieldDef {
  readonly key: string;
  readonly label: string;
  readonly type: FieldType;
  readonly hint?: string;
  readonly itemLabel?: string;   // list: singular noun e.g. "Member"
  readonly fields?: readonly FieldDef[]; // list: item sub-fields
  readonly options?: readonly string[];  // select: the allowed values
  readonly group?: string;       // consecutive same-group fields → a collapsible accordion
  readonly groupOpen?: boolean;  // default-open this group
}

export interface SectionSchema {
  readonly key: string;
  readonly label: string;
  readonly fields: readonly FieldDef[];
  readonly default: Record<string, unknown>;
}

export type SectionValue = Record<string, unknown>;
export type ContentMap = Record<string, SectionValue>;

export const SECTIONS: readonly SectionSchema[] = [
  {
    key: 'stats',
    label: 'Studio Stats',
    fields: [
      { key: 'markets', label: 'Markets', type: 'number', hint: 'Shared across Hero, About & Team.' },
      { key: 'rtp', label: 'Max RTP %', type: 'number' },
      { key: 'years', label: 'Years experience', type: 'number' },
    ],
    // games / slots / originals are auto-counted from the live catalogue — not edited here.
    default: { markets: 7, rtp: 97.5, years: 10 },
  },
  {
    key: 'hero',
    label: 'Hero',
    fields: [
      { key: 'tagline', label: 'Tagline', type: 'text' },
    ],
    default: { tagline: 'A MetaWin Studio' },
  },
  {
    key: 'team',
    label: 'Team',
    fields: [
      {
        key: 'people', label: 'Team members', type: 'list', itemLabel: 'Person',
        hint: 'Each person is a tab on the site. One person shows as a single profile (as now); add more to get tabs.',
        fields: [
          { key: 'name', label: 'Name', type: 'text' },
          { key: 'role', label: 'Role', type: 'text' },
          { key: 'callsign', label: 'Callsign', type: 'text' },
          { key: 'initials', label: 'Initials (badge)', type: 'text' },
          { key: 'location', label: 'Location', type: 'text' },
          { key: 'company', label: 'Company', type: 'text' },
          { key: 'experience', label: 'Experience', type: 'text' },
          { key: 'image', label: 'Photo URL', type: 'image' },
          { key: 'bio', label: 'Bio', type: 'textarea', hint: 'Separate paragraphs with a blank line.' },
          { key: 'expertise', label: 'Expertise', type: 'tags' },
          { key: 'missions', label: 'Highlights', type: 'bullets', itemLabel: 'Highlight' },
          { key: 'linkedin', label: 'LinkedIn URL', type: 'text' },
          { key: 'email', label: 'Email', type: 'text' },
          { key: 'github', label: 'GitHub URL', type: 'text' },
        ],
      },
      {
        key: 'culture', label: 'How we work', type: 'list', itemLabel: 'Value',
        fields: [
          { key: 'tag', label: 'Title', type: 'text' },
          { key: 'text', label: 'Text', type: 'textarea' },
        ],
      },
    ],
    default: teamDefault,
  },
  {
    key: 'about',
    label: 'About',
    fields: [
      { key: 'tech', label: 'Tech stack', type: 'tags' },
      {
        key: 'features', label: 'Feature cards', type: 'list', itemLabel: 'Card',
        fields: [
          { key: 'tag', label: 'Tag', type: 'text' },
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'body', label: 'Body', type: 'textarea' },
        ],
      },
    ],
    default: aboutDefault,
  },
  {
    key: 'journey',
    label: 'Journey',
    fields: [
      {
        key: 'milestones', label: 'Milestones', type: 'list', itemLabel: 'Milestone',
        fields: [
          { key: 'date', label: 'Date', type: 'period', hint: 'Pick a quarter (or — for year-only), e.g. “Q3 2023” or “2025”.' },
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'description', label: 'Description', type: 'textarea' },
          { key: 'status', label: 'Status', type: 'select', options: ['COMPLETE', 'ACTIVE', 'QUEUED'] },
        ],
      },
    ],
    default: journeyDefault,
  },
  {
    key: 'careers',
    label: 'Careers',
    fields: [
      { key: 'apply_email', label: 'Applications email', type: 'text' },
      {
        key: 'positions', label: 'Open positions', type: 'list', itemLabel: 'Position',
        hint: 'Add, edit or remove roles anytime — they publish instantly.',
        fields: [
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'department', label: 'Department', type: 'text' },
          { key: 'location', label: 'Location', type: 'text' },
          { key: 'type', label: 'Type', type: 'text' },
          { key: 'summary', label: 'Summary', type: 'textarea' },
          { key: 'description', label: 'Description', type: 'textarea' },
          { key: 'requirements', label: 'Requirements', type: 'bullets', itemLabel: 'Requirement' },
          { key: 'niceToHave', label: 'Nice to have', type: 'bullets', itemLabel: 'Item' },
          { key: 'applyUrl', label: 'Apply link (URL or mailto:)', type: 'text' },
        ],
      },
    ],
    default: careersDefault,
  },
  {
    key: 'contact',
    label: 'Contact',
    fields: [{ key: 'email', label: 'Email', type: 'text' }],
    default: { email: 'cwang@metawin.inc' },
  },
  {
    key: 'partner',
    label: 'Client Area',
    fields: [
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'title', label: 'Headline', type: 'text' },
      { key: 'lede', label: 'Intro', type: 'textarea' },
      { key: 'ctaLabel', label: 'CTA button label', type: 'text', group: 'Call to action', groupOpen: true },
      { key: 'ctaUrl', label: 'CTA link (URL or mailto:)', type: 'text', group: 'Call to action' },
      { key: 'contactEmail', label: 'Contact email', type: 'text', group: 'Call to action' },
      {
        key: 'valueProps', label: 'Value cards', type: 'list', itemLabel: 'Card',
        fields: [
          { key: 'tag', label: 'Tag', type: 'text' },
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'body', label: 'Body', type: 'textarea' },
        ],
      },
      {
        key: 'steps', label: 'How to integrate', type: 'list', itemLabel: 'Step',
        fields: [
          { key: 'step', label: 'Step title', type: 'text' },
          { key: 'body', label: 'Detail', type: 'textarea' },
        ],
      },
      { key: 'specs', label: 'What you get', type: 'bullets', itemLabel: 'Item' },
      {
        key: 'catalogue', label: 'Featured titles', type: 'list', itemLabel: 'Title',
        fields: [
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'genre', label: 'Genre / mechanic', type: 'text' },
          { key: 'rtp', label: 'RTP', type: 'text' },
        ],
      },
      { key: 'complianceTitle', label: 'Compliance title', type: 'text' },
      { key: 'complianceBody', label: 'Compliance intro', type: 'textarea' },
      { key: 'compliancePoints', label: 'Compliance points', type: 'bullets', itemLabel: 'Point' },
      {
        key: 'faqs', label: 'FAQ', type: 'list', itemLabel: 'Q&A',
        fields: [
          { key: 'q', label: 'Question', type: 'text' },
          { key: 'a', label: 'Answer', type: 'textarea' },
        ],
      },
      { key: 'closingTitle', label: 'Closing title', type: 'text' },
      { key: 'closingBody', label: 'Closing body', type: 'textarea' },
    ],
    default: partnerDefault,
  },
];

export const SECTION_DEFAULTS: ContentMap = Object.fromEntries(
  SECTIONS.map((s) => [s.key, s.default]),
);

/** Load every section row, each merged over its code default. Never throws. */
export async function fetchSiteContent(): Promise<ContentMap> {
  try {
    const { data, error } = await supabase.from('site_content').select('key,value');
    if (error) throw error;
    const map: ContentMap = {};
    for (const s of SECTIONS) map[s.key] = { ...s.default };
    for (const row of data ?? []) {
      const r = row as { key: string; value: SectionValue };
      map[r.key] = { ...(map[r.key] ?? {}), ...r.value };
    }
    return map;
  } catch (err) {
    console.warn('[siteContent] read failed — using defaults:', err);
    return { ...SECTION_DEFAULTS };
  }
}

/** Upsert one section's whole document (admin-only via RLS). */
export async function saveSection(key: string, value: SectionValue): Promise<void> {
  const { error } = await supabase.from('site_content').upsert({ key, value });
  if (error) throw error;
}

/** Seed the DB with the code-default content for any section not yet stored.
 *  ignoreDuplicates = never clobbers content you've already edited. */
export async function importDefaultContent(): Promise<number> {
  const rows = SECTIONS.map((s) => ({ key: s.key, value: s.default }));
  const { error } = await supabase.from('site_content').upsert(rows, { onConflict: 'key', ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}
