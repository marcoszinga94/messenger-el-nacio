import { createReadStream, createWriteStream, existsSync, statSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { FILE_MAX_BYTES } from '@nacio/shared';
import { config } from '../config.js';
import { fail } from '../http.js';
import { getFileRow, toAttachment } from '../serialize.js';

/** Evita rutas y caracteres raros en el nombre que se muestra al descargar. */
function cleanName(raw: string | undefined): string {
  const base = path.basename((raw ?? '').replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f]/g, '');
  const trimmed = base.trim().slice(0, 180);
  return trimmed || 'archivo';
}

function disposition(mime: string, name: string): string {
  const inline =
    (/^image\/(png|jpeg|gif|webp|bmp|avif)$/.test(mime) ||
      mime.startsWith('audio/') ||
      mime.startsWith('video/') ||
      mime === 'application/pdf');
  const encoded = encodeURIComponent(name).replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16)}`);
  return `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encoded}`;
}

export default async function fileRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;

  app.post('/files', { preHandler: [app.authenticate] }, async (request, reply) => {
    let upload;
    try {
      upload = await request.file();
    } catch {
      return fail(reply, 400, 'Mandá el archivo como formulario multipart.');
    }
    if (!upload) return fail(reply, 400, 'No llegó ningún archivo.');

    const id = randomUUID();
    const name = cleanName(upload.filename);
    const mime = (upload.mimetype || 'application/octet-stream').slice(0, 120);
    const target = path.join(config.uploadsDir, id);
    const durationRaw = Number((request.query as { duration?: string }).duration);
    const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.round(durationRaw) : null;

    try {
      await pipeline(upload.file, createWriteStream(target));
    } catch {
      if (existsSync(target)) unlinkSync(target);
      return fail(reply, 500, 'No se pudo guardar el archivo.');
    }

    if (upload.file.truncated) {
      if (existsSync(target)) unlinkSync(target);
      return fail(reply, 413, `El archivo supera los ${Math.round(FILE_MAX_BYTES / (1024 * 1024))} MB.`);
    }

    const stat = statSync(target);
    if (stat.size === 0) {
      unlinkSync(target);
      return fail(reply, 400, 'El archivo está vacío.');
    }

    db.prepare(
      'INSERT INTO files (id, owner_id, name, mime, size, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, request.user.id, name, mime, stat.size, duration, Date.now());

    const row = getFileRow(db, id)!;
    return reply.code(201).send({ attachment: toAttachment(row) });
  });

  app.get('/files/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const file = getFileRow(db, id);
    if (!file) return fail(reply, 404, 'Archivo no encontrado.');

    const allowed =
      file.owner_id === request.user.id ||
      db
        .prepare(
          `SELECT 1 FROM messages m
           JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
           WHERE m.file_id = ? AND cm.user_id = ?
           LIMIT 1`,
        )
        .get(id, request.user.id) !== undefined;
    if (!allowed) return fail(reply, 403, 'No tenés acceso a este archivo.');

    const target = path.join(config.uploadsDir, id);
    if (!existsSync(target)) return fail(reply, 404, 'El archivo ya no está disponible.');

    reply.header('Content-Type', file.mime);
    reply.header('Content-Length', String(file.size));
    reply.header('Content-Disposition', disposition(file.mime, file.name));
    reply.header('Cache-Control', 'private, max-age=86400');
    return reply.send(createReadStream(target));
  });
}
