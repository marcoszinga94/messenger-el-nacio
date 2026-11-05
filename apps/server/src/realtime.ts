import type { Server } from 'socket.io';

let io: Server | null = null;
const socketsByUser = new Map<string, Set<string>>();

export function setIO(server: Server): void {
  io = server;
}

export function getIO(): Server | null {
  return io;
}

export function addUserSocket(userId: string, socketId: string): void {
  const set = socketsByUser.get(userId) ?? new Set<string>();
  set.add(socketId);
  socketsByUser.set(userId, set);
}

export function removeUserSocket(userId: string, socketId: string): boolean {
  const set = socketsByUser.get(userId);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    socketsByUser.delete(userId);
    return false;
  }
  return true;
}

export function isOnline(userId: string): boolean {
  return (socketsByUser.get(userId)?.size ?? 0) > 0;
}

export function onlineCount(): number {
  return socketsByUser.size;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToUsers(userIds: Iterable<string>, event: string, payload: unknown): void {
  for (const id of userIds) emitToUser(id, event, payload);
}
