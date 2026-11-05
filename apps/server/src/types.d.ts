import type { DatabaseSync } from 'node:sqlite';
import type { Server } from 'socket.io';
import type { AuthUser } from './auth.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: DatabaseSync;
    io: Server;
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
    requireAdmin: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    user: AuthUser;
  }
}
