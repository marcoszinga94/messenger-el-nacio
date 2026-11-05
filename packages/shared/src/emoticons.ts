export interface Emoticon {
  code: string;
  emoji: string;
  label: string;
}

/** Emoticones clásicos de MSN, recreados con Unicode para no depender de imágenes con licencia. */
export const EMOTICONS: Emoticon[] = [
  { code: ':)', emoji: '🙂', label: 'Sonrisa' },
  { code: ':-)', emoji: '🙂', label: 'Sonrisa' },
  { code: ':D', emoji: '😄', label: 'Sonrisa grande' },
  { code: ':-D', emoji: '😄', label: 'Sonrisa grande' },
  { code: ';)', emoji: '😉', label: 'Guiño' },
  { code: ';-)', emoji: '😉', label: 'Guiño' },
  { code: ':P', emoji: '😛', label: 'Lengua' },
  { code: ':-P', emoji: '😛', label: 'Lengua' },
  { code: ':(', emoji: '🙁', label: 'Triste' },
  { code: ':-(', emoji: '🙁', label: 'Triste' },
  { code: ":'(", emoji: '😢', label: 'Llorando' },
  { code: ':@', emoji: '😠', label: 'Enojado' },
  { code: ':-@', emoji: '😠', label: 'Enojado' },
  { code: ':O', emoji: '😮', label: 'Sorprendido' },
  { code: ':-O', emoji: '😮', label: 'Sorprendido' },
  { code: ':S', emoji: '😕', label: 'Confundido' },
  { code: ':-S', emoji: '😕', label: 'Confundido' },
  { code: ':$', emoji: '😳', label: 'Avergonzado' },
  { code: ':-$', emoji: '😳', label: 'Avergonzado' },
  { code: ':Z', emoji: '😴', label: 'Durmiendo' },
  { code: '8)', emoji: '😎', label: 'Canchero' },
  { code: '8-)', emoji: '😎', label: 'Canchero' },
  { code: '(H)', emoji: '😎', label: 'Anteojos' },
  { code: '(A)', emoji: '😇', label: 'Ángel' },
  { code: '(6)', emoji: '😈', label: 'Diablito' },
  { code: '(L)', emoji: '❤️', label: 'Corazón' },
  { code: '(U)', emoji: '💔', label: 'Corazón roto' },
  { code: '(K)', emoji: '💋', label: 'Beso' },
  { code: '(F)', emoji: '🌹', label: 'Rosa' },
  { code: '(D)', emoji: '🍺', label: 'Cerveza' },
  { code: '(C)', emoji: '☕', label: 'Café' },
  { code: '(T)', emoji: '📞', label: 'Teléfono' },
  { code: '(Y)', emoji: '👍', label: 'Pulgar arriba' },
  { code: '(N)', emoji: '👎', label: 'Pulgar abajo' },
  { code: '(X)', emoji: '💋', label: 'Beso' },
  { code: '(Z)', emoji: '🧑‍💻', label: 'Programando' },
  { code: '(S)', emoji: '🌙', label: 'Luna' },
  { code: '(8)', emoji: '🎵', label: 'Música' },
  { code: '(E)', emoji: '✉️', label: 'Carta' },
  { code: '(M)', emoji: '🕶️', label: 'Lentes' },
  { code: '(W)', emoji: '🌹', label: 'Marchita' },
  { code: '(P)', emoji: '📷', label: 'Cámara' },
  { code: '(B)', emoji: '🍻', label: 'Brindis' },
  { code: '(ni)', emoji: '🤐', label: 'Boca cerrada' },
];

const SORTED = [...EMOTICONS].sort((a, b) => b.code.length - a.code.length);

/** Reemplaza los códigos :) por emojis, sin tocar el texto que ya contiene emojis. */
export function renderEmoticons(text: string): string {
  let out = text;
  for (const e of SORTED) {
    out = out.split(e.code).join(e.emoji);
  }
  return out;
}
