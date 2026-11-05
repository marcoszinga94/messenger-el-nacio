export const APP_NAME = 'Messenger El Nacio';

export const USERNAME_RE = /^[a-z0-9._-]{3,20}$/i;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const MESSAGE_MAX = 2000;
export const DISPLAY_NAME_MAX = 40;
export const STATUS_MESSAGE_MAX = 140;
export const GROUP_NAME_MAX = 40;
export const GROUP_TOPIC_MAX = 120;

export const GROUP_MAX_MEMBERS = 50;
export const NUDGE_COOLDOWN_MS = 30_000;

export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const AVATARS = [
  '🐱', '🐶', '🐼', '🦊', '🐸', '🐵', '🦁', '🐯',
  '🐨', '🐷', '🐙', '🦄', '🐧', '🐢', '🦉', '🐝',
  '🌟', '🎧', '🎮', '⚽', '🎸', '🚀', '🍕', '🌈',
] as const;

export const STATUS_LABELS: Record<string, string> = {
  online: 'En línea',
  away: 'Ausente',
  busy: 'Ocupado',
  invisible: 'Invisible',
  offline: 'Desconectado',
};

export const STATUS_ORDER: Record<string, number> = {
  online: 0,
  busy: 1,
  away: 2,
  offline: 3,
};

export const STATUS_COLORS: Record<string, string> = {
  online: '#3fa33f',
  away: '#d9a300',
  busy: '#cc3b3b',
  invisible: '#8a8a8a',
  offline: '#b3b3b3',
};

export const SOCKET_PATH = '/socket.io';
