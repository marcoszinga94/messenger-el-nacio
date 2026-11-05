import type { ReactNode } from 'react';
import { renderEmoticons } from '@nacio/shared';

/** Marcas simples al estilo MSN: **negrita**, *cursiva*, __subrayado__, ~~tachado~~. */
const MARKUP = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|__[^_\n]+__|~~[^~\n]+~~)/g;

export const FORMAT_MARKERS = [
  { id: 'bold', label: 'N', title: 'Negrita', prefix: '**', suffix: '**' },
  { id: 'italic', label: 'C', title: 'Cursiva', prefix: '*', suffix: '*' },
  { id: 'underline', label: 'S', title: 'Subrayado', prefix: '__', suffix: '__' },
  { id: 'strike', label: 'T', title: 'Tachado', prefix: '~~', suffix: '~~' },
] as const;

export function renderRichText(text: string): ReactNode[] {
  return text.split(MARKUP).map((part, index) => {
    if (!part) return null;
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{renderEmoticons(part.slice(2, -2))}</strong>;
    }
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
      return <em key={index}>{renderEmoticons(part.slice(1, -1))}</em>;
    }
    if (part.length > 4 && part.startsWith('__') && part.endsWith('__')) {
      return <u key={index}>{renderEmoticons(part.slice(2, -2))}</u>;
    }
    if (part.length > 4 && part.startsWith('~~') && part.endsWith('~~')) {
      return <s key={index}>{renderEmoticons(part.slice(2, -2))}</s>;
    }
    return <span key={index}>{renderEmoticons(part)}</span>;
  });
}
