import { supabase } from '@/lib/supabase';

// Contact-form submissions captured by the `send-enquiry` Edge Function.
// Read/delete are admin-only (RLS: enquiries_admin_read / enquiries_admin_delete);
// inserts happen server-side via the function's service role. The site never
// reads this table.

interface EnquiryRow {
  readonly id: number;
  readonly name: string;
  readonly company: string;
  readonly email: string;
  readonly enquiry_type: string;
  readonly message: string;
  readonly emailed: boolean;
  readonly created_at: string;
}

export interface Enquiry {
  readonly id: number;
  readonly name: string;
  readonly company: string;
  readonly email: string;
  readonly enquiryType: string;
  readonly message: string;
  readonly emailed: boolean;
  readonly createdAt: string;
}

function rowToEnquiry(r: EnquiryRow): Enquiry {
  return {
    id: r.id,
    name: r.name ?? '',
    company: r.company ?? '',
    email: r.email ?? '',
    enquiryType: r.enquiry_type ?? '',
    message: r.message ?? '',
    emailed: r.emailed ?? false,
    createdAt: r.created_at,
  };
}

/** Newest first. Admins only — RLS rejects everyone else. */
export async function fetchEnquiries(): Promise<Enquiry[]> {
  const { data, error } = await supabase
    .from('enquiries')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as EnquiryRow[]).map(rowToEnquiry);
}

export async function deleteEnquiry(id: number): Promise<void> {
  const { error } = await supabase.from('enquiries').delete().eq('id', id);
  if (error) throw error;
}
