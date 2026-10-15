import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { listPartnerFiles } from './portalStorage';
import type { CredentialRow, PartnerDocRow, PartnerFile, PartnerRow, PortalGame } from './portalTypes';

export interface PortalDataProps {
  partner: PartnerRow | null;
  preview: boolean;
  userId: string;
}

export interface PortalResource<T> {
  data: T[];
  loading: boolean;
  error: string;
  retry: () => void;
}

export async function loadPortalDocs(): Promise<PartnerDocRow[]> {
  const { data, error } = await supabase.from('partner_docs')
    .select('id,title,body,sort,updated_at')
    .order('sort', { ascending: true }).order('title', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PartnerDocRow[];
}

export async function loadPortalCredentials(partner: PartnerRow): Promise<CredentialRow[]> {
  if (!partner.id) throw new Error('A partner id is required to load credentials.');
  const { data, error } = await supabase.from('partner_credentials')
    .select('id,partner_id,label,sandbox_url,username,api_key,notes,updated_at')
    .eq('partner_id', partner.id).order('label', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CredentialRow[];
}

export async function loadPortalGames(): Promise<PortalGame[]> {
  const { data, error } = await supabase.from('games')
    .select('id,slug,title,genre,rtp,volatility,release_date')
    .eq('is_published', true).order('sort_order', { ascending: true }).order('title', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PortalGame[];
}

interface ResourceState<T> {
  scope: string;
  data: T[];
  loading: boolean;
  error: string;
}

function readableError(label: string, error: unknown): string {
  const detail = error && typeof error === 'object' && 'message' in error ? String(error.message).trim() : '';
  return `Could not load ${label}.${detail ? ` ${detail}` : ' Please try again when your connection is available.'}`;
}

/** A separate request lifecycle lets one slow or failed section leave the others readable. */
function useResource<T>(load: () => Promise<T[]>, label: string, scope: string, enabled: boolean): PortalResource<T> {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<ResourceState<T>>({ scope, data: [], loading: enabled, error: '' });
  useEffect(() => {
    let current = true;
    setState({ scope, data: [], loading: enabled, error: '' });
    if (!enabled) return () => { current = false; };
    void load().then(
      data => { if (current) setState({ scope, data, loading: false, error: '' }); },
      error => { if (current) setState({ scope, data: [], loading: false, error: readableError(label, error) }); },
    );
    return () => { current = false; };
  }, [load, label, scope, enabled, version]);
  const retry = useCallback(() => setVersion(value => value + 1), []);
  // Never expose a previous user's response during the render before the effect resets it.
  if (!enabled || state.scope !== scope) return { data: [], loading: enabled, error: '', retry };
  return { data: state.data, loading: state.loading, error: state.error, retry };
}

const loadDocFiles = () => listPartnerFiles('docs');
const loadAssetFiles = () => listPartnerFiles('assets');
const loadCertificateFiles = () => listPartnerFiles('certificates');

export function usePortalData({ partner, preview, userId }: PortalDataProps) {
  const ownPartner = partner?.active && partner.user_id === userId ? partner : null;
  const enabled = Boolean(userId && (ownPartner || preview));
  const scope = `${userId}:${ownPartner?.id ?? 'preview'}:${preview}`;
  const loadCredentials = useCallback(() => ownPartner ? loadPortalCredentials(ownPartner) : Promise.resolve([]), [ownPartner]);
  const docs = useResource(loadPortalDocs, 'integration docs', scope, enabled);
  const credentials = useResource(loadCredentials, 'test credentials', scope, enabled && Boolean(ownPartner) && !preview);
  const games = useResource(loadPortalGames, 'game information', scope, enabled);
  const docFiles = useResource<PartnerFile>(loadDocFiles, 'document downloads', scope, enabled);
  const assetFiles = useResource<PartnerFile>(loadAssetFiles, 'game assets', scope, enabled);
  const certificateFiles = useResource<PartnerFile>(loadCertificateFiles, 'certificates', scope, enabled);
  return { docs, credentials, games, docFiles, assetFiles, certificateFiles };
}
