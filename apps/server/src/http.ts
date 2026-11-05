import type { FastifyReply } from 'fastify';

interface Parseable<T> {
  safeParse: (
    value: unknown,
  ) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } };
}

export function parse<T>(schema: Parseable<T>, value: unknown, reply: FastifyReply): T | null {
  const result = schema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? 'Datos inválidos.';
    reply.code(400).send({ error: message });
    return null;
  }
  return result.data;
}

export function fail(reply: FastifyReply, status: number, message: string): FastifyReply {
  return reply.code(status).send({ error: message });
}
