import type { Enquiry } from '@/api/enquiriesDb';

/** Quote every cell and protect spreadsheet users from executable formula prefixes. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function isoDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

/** UTF-8 BOM and CRLF records; embedded newlines remain inside quoted cells. */
export function buildEnquiriesCsv(items: readonly Enquiry[]): string {
  const header = 'created_at,name,company,email,type,handled,replied_at,message';
  const rows = items.map((e) => [
    isoDate(e.createdAt), e.name, e.company, e.email, e.enquiryType,
    String(e.handled), e.repliedAt ? isoDate(e.repliedAt) : '', e.message,
  ].map(csvCell).join(','));
  return `\uFEFF${[header, ...rows].join('\r\n')}\r\n`;
}
