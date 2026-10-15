export interface PartnerDocDraft {
  readonly title: string;
  readonly body: string;
  readonly sort: string;
}

/** Match partner_docs constraints before sending a write to the database. */
export function validatePartnerDoc({ title, body, sort: rawSort }: PartnerDocDraft): string | null {
  if (!title.trim() || Array.from(title.trim()).length > 200) return 'A document title is required (200 characters or fewer).';
  if (Array.from(body).length > 50_000) return 'Document text must be 50,000 characters or fewer.';
  const sort = Number(rawSort);
  if (!rawSort.trim() || !Number.isInteger(sort) || sort < -2_147_483_648 || sort > 2_147_483_647) {
    return 'Sort order must be a whole integer between -2147483648 and 2147483647.';
  }
  return null;
}
