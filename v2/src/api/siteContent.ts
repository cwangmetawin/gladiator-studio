import { supabase } from '@/lib/supabase';
import careersDefault from './careersDefault.json';
import aboutDefault from './aboutDefault.json';
import journeyDefault from './journeyDefault.json';

// ─── Structured, per-section page content ───────────────────────────────────
// One site_content row per section (key = section id, value = JSON document).
// The schema below drives BOTH the admin editor and the defaults the live site
// falls back to. Fields can be scalars or `list`s of sub-objects (e.g. team
// members), so any page can be edited to its own structure.

export type FieldType = 'text' | 'textarea' | 'number' | 'image' | 'list' | 'tags' | 'bullets';

export interface FieldDef {
  readonly key: string;
  readonly label: string;
  readonly type: FieldType;
  readonly hint?: string;
  readonly itemLabel?: string;   // list: singular noun e.g. "Member"
  readonly fields?: readonly FieldDef[]; // list: item sub-fields
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
      { key: 'lead_name', label: 'Name', type: 'text', group: 'Lead profile', groupOpen: true },
      { key: 'lead_role', label: 'Role', type: 'text', group: 'Lead profile' },
      { key: 'lead_callsign', label: 'Callsign', type: 'text', group: 'Lead profile' },
      { key: 'lead_location', label: 'Location', type: 'text', group: 'Lead profile' },
      { key: 'lead_company', label: 'Company', type: 'text', group: 'Lead profile' },
      { key: 'lead_experience', label: 'Experience', type: 'text', group: 'Lead profile' },
      { key: 'lead_initials', label: 'Initials', type: 'text', group: 'Lead profile' },
      { key: 'lead_bio', label: 'Bio', type: 'textarea', hint: 'Separate paragraphs with a blank line.', group: 'Lead profile' },
      { key: 'lead_expertise', label: 'Expertise', type: 'tags', group: 'Lead profile' },
      { key: 'lead_missions', label: 'Highlights', type: 'bullets', itemLabel: 'Highlight', group: 'Lead profile' },
      { key: 'lead_linkedin', label: 'LinkedIn URL', type: 'text', group: 'Lead profile' },
      { key: 'lead_email', label: 'Email', type: 'text', group: 'Lead profile' },
      { key: 'lead_github', label: 'GitHub URL', type: 'text', group: 'Lead profile' },
      {
        key: 'members', label: 'Additional members', type: 'list', itemLabel: 'Member',
        hint: 'Shown as a grid beneath the lead. Add as many as you like.',
        fields: [
          { key: 'name', label: 'Name', type: 'text' },
          { key: 'role', label: 'Role', type: 'text' },
          { key: 'image', label: 'Photo URL', type: 'image' },
          { key: 'bio', label: 'Short bio', type: 'textarea' },
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
    default: {
      lead_name: 'CHAO WANG',
      lead_role: 'CTO & Head of Game Development',
      lead_callsign: 'THE ARCHITECT',
      lead_location: 'London, UK',
      lead_company: 'MetaWin Group',
      lead_experience: '10+ yrs',
      lead_initials: 'CW',
      lead_bio: 'Industry pioneer — the first person to systematically deploy AI, large language models, and autonomous agent systems at production scale in iGaming. Chao architected the entire Gladiator Studio technology stack from the ground up and leads all engineering, AI R&D, and product development within the MetaWin group.\n\nHis AI-first approach has fundamentally reshaped how games are designed, tested, and optimized: LLM-powered game content generation, multi-agent orchestration for automated QA pipelines, real-time adaptive game balancing via reinforcement learning, and Claude-driven autonomous development workflows that compress months of engineering into days.\n\nBefore MetaWin, Chao spent a decade at the bleeding edge of gaming technology — building platforms processing $100M+ in daily wagers, contributing core modules to Pixi.js (the most widely used 2D WebGL renderer), and creating Chao2D, a purpose-built rendering engine for high-performance H5 gaming.',
      lead_expertise: 'AI / LLM Pioneer in iGaming\nMulti-Agent Systems\nGame Architecture\nWebGL / Pixi.js\nDistributed Systems\nCloud (AWS + GCP)\nCrypto-Native\nTech Leadership',
      lead_missions: "First to deploy LLMs and autonomous AI agents in production iGaming — industry pioneer\nArchitected multi-agent AI pipeline: game design → math validation → QA → deployment\nBuilt Claude-powered autonomous dev workflows — 10x engineering velocity\nArchitected gaming aggregation platform — $100M+ daily wagers\nCore open-source contributor to Pixi.js (world's #1 2D WebGL renderer)\nCreated Chao2D rendering engine for H5 gaming\nBuilt Newtonian physics engine for browser games\nShipped 34 live titles (8 Gladiator ULTRA-volatility slots + 26 MetaWin Originals)\nDual-cloud AWS + GCP elite-tier infrastructure across 7 markets\nBuilt and scaled cross-functional teams across engineering, AI, art, QA",
      lead_linkedin: 'https://www.linkedin.com/in/chaow/',
      lead_email: 'cwang@metawin.inc',
      lead_github: 'https://github.com/gladiator-studio',
      members: [],
      culture: [
        { tag: 'Craft', text: 'Small senior team. Every engineer ships to production. No bureaucracy.' },
        { tag: 'Velocity', text: 'Concept to live deployment in weeks, not quarters. Ship fast, iterate faster.' },
        { tag: 'Ownership', text: 'Full-stack ownership from game mathematics to cloud infrastructure.' },
        { tag: 'Impact', text: 'Our games are played by hundreds of thousands of real players daily.' },
      ],
    },
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
          { key: 'date', label: 'Date', type: 'text' },
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'description', label: 'Description', type: 'textarea' },
          { key: 'status', label: 'Status', type: 'text', hint: 'COMPLETE / ACTIVE / QUEUED' },
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
