export interface PartnerRow {
  id: string;
  user_id: string;
  company: string;
  login_email: string;
  contact_email: string;
  active: boolean;
  created_at: string;
}

export interface CredentialRow {
  id: string;
  partner_id: string;
  label: string;
  sandbox_url: string | null;
  username: string | null;
  api_key: string | null;
  notes: string | null;
  updated_at: string;
}

export interface PartnerDocRow {
  id: string;
  title: string;
  body: string;
  sort: number;
  updated_at: string;
}

export interface PortalGame {
  id: number;
  slug: string | null;
  title: string;
  image: string | null;
  genre: string | null;
  rtp: number | string | null;
  volatility: string | null;
  release_date: string | null;
}

export interface PartnerFile {
  path: string;
  name: string;
  size: number;
  mimeType: string;
  updatedAt: string;
}

export interface CredentialInput {
  label: string;
  sandbox_url: string;
  username: string;
  api_key: string;
  notes: string;
}

export type PartnerFolder = 'assets' | 'certificates' | 'docs';
