export interface ChatBackground {
  id: string;
  label: string;
  css: string;
}

export const CHAT_BACKGROUNDS: ChatBackground[] = [
  { id: 'default', label: 'Blanco clásico', css: '#ffffff' },
  { id: 'cielo', label: 'Cielo', css: 'linear-gradient(180deg, #eaf6ff, #cfe8ff)' },
  { id: 'menta', label: 'Menta', css: 'linear-gradient(180deg, #effbf3, #d6f1e2)' },
  { id: 'durazno', label: 'Durazno', css: 'linear-gradient(180deg, #fff6ee, #ffe4cf)' },
  { id: 'lavanda', label: 'Lavanda', css: 'linear-gradient(180deg, #f6f1ff, #e5dcf7)' },
  {
    id: 'papel',
    label: 'Papel rayado',
    css: 'repeating-linear-gradient(0deg, #fffdf5, #fffdf5 26px, #f3eeda 27px)',
  },
  {
    id: 'puntos',
    label: 'Puntos',
    css: 'radial-gradient(#c9ddf2 1.2px, transparent 1.2px) 0 0 / 16px 16px, #fbfdff',
  },
  {
    id: 'rayas',
    label: 'Rayas',
    css: 'repeating-linear-gradient(45deg, #f4f9ff, #f4f9ff 12px, #e7f1fc 12px, #e7f1fc 24px)',
  },
];

export function backgroundCss(id: string | undefined): string | undefined {
  return CHAT_BACKGROUNDS.find((preset) => preset.id === id)?.css;
}
