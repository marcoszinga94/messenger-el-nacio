import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@nacio/shared';
import { getServer, loadSession } from './session';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createSocket(): AppSocket {
  return io(getServer(), {
    auth: { token: loadSession()?.accessToken ?? '' },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4000,
  });
}
