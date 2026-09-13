/**
 * vCard 3.0 generated from src/data/site.ts. Served as /contact.vcf.
 * iOS and Android open .vcf files directly in the contacts app.
 */
import type { APIRoute } from 'astro';
import { SITE } from '@/data/site';
import { getLinkType } from '@/data/linkTypes';

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

export const GET: APIRoute = () => {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:;${escapeText(SITE.fullName)};;;`,
    `FN:${escapeText(SITE.fullName)}`,
    `TITLE:${escapeText(SITE.tagline)}`,
    `EMAIL;TYPE=INTERNET:${SITE.email}`,
    `URL:${SITE.url}`,
    `ADR;TYPE=HOME:;;;;;;${escapeText(SITE.location)}`,
    `NOTE:${escapeText(SITE.bio)}`,
    ...SITE.socials.map((s) => `X-SOCIALPROFILE;TYPE=${getLinkType(s.type).label.replace(/\s+/g, '')}:${s.url}`),
    `REV:${new Date().toISOString()}`,
    'END:VCARD',
  ];

  return new Response(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': 'attachment; filename="jusi.vcf"',
    },
  });
};
