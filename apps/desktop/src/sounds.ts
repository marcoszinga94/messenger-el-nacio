const SOUND_KEY = 'nacio.sound';
const players = new Map<string, HTMLAudioElement>();

export type SoundName = 'message' | 'send' | 'nudge' | 'online' | 'offline';

export function isSoundOn(): boolean {
  return localStorage.getItem(SOUND_KEY) !== 'off';
}

export function setSoundOn(value: boolean): void {
  localStorage.setItem(SOUND_KEY, value ? 'on' : 'off');
}

export function playSound(name: SoundName): void {
  if (!isSoundOn()) return;
  try {
    let audio = players.get(name);
    if (!audio) {
      const base = import.meta.env.BASE_URL || '/';
      audio = new Audio(`${base}sounds/${name}.wav`);
      audio.preload = 'auto';
      players.set(name, audio);
    }
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Algunos WebView bloquean audio hasta la primera interacción.
    });
  } catch {
    // Sin sonido no pasa nada.
  }
}
