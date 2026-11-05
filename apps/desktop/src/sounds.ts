const SOUND_KEY = 'nacio.sound';
const players = new Map<string, HTMLAudioElement>();

// En Linux, WebKit puede abortar si GStreamer no encuentra autoaudiosink
// (plugin gst-plugins-good). Arrancamos en false y lo habilitamos recién
// cuando el backend de audio confirma que puede reproducir.
let audioSupported = false;

export type SoundName = 'message' | 'send' | 'nudge' | 'online' | 'offline';

export function isSoundOn(): boolean {
  return localStorage.getItem(SOUND_KEY) !== 'off';
}

export function setSoundOn(value: boolean): void {
  localStorage.setItem(SOUND_KEY, value ? 'on' : 'off');
}

export function setAudioSupported(value: boolean): void {
  audioSupported = value;
}

export function isAudioSupported(): boolean {
  return audioSupported;
}

export function playSound(name: SoundName): void {
  if (!audioSupported || !isSoundOn()) return;
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
