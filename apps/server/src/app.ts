import { existsSync } from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { getSettings, openDatabase } from './db.js';
import { ensureSeed } from './seed.js';
import { verifyAccessToken } from './auth.js';
import { setupSockets } from './socket.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import contactRoutes from './routes/contacts.js';
import conversationRoutes from './routes/conversations.js';
import adminRoutes from './routes/admin.js';
import type { UserRow } from './serialize.js';

const adminDist = process.env.ADMIN_DIST
  ? path.resolve(process.env.ADMIN_DIST)
  : path.resolve(import.meta.dirname, '../../admin/dist');

function landingPage(appName: string, releasesUrl: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${appName}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Tahoma, Verdana, sans-serif; background: #dfeaf7; color: #1d2b3a; }
  .hero { background: linear-gradient(180deg, #1c5fa8 0%, #2f7bc4 55%, #7fb2e5 100%); color: #fff; padding: 56px 20px 48px; text-align: center; }
  .hero h1 { margin: 0 0 8px; font-size: 34px; letter-spacing: .5px; }
  .hero p { margin: 0 auto; max-width: 620px; opacity: .95; }
  .card { max-width: 760px; margin: -28px auto 40px; background: #fff; border: 1px solid #9bb8d6; border-radius: 10px; box-shadow: 0 10px 30px rgba(20,50,80,.18); padding: 28px; }
  h2 { margin-top: 0; font-size: 18px; color: #1c5fa8; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin: 18px 0; }
  .download { display: block; text-decoration: none; border: 1px solid #9bb8d6; border-radius: 8px; padding: 16px; background: #f4f9ff; color: #17456f; }
  .download strong { display: block; font-size: 15px; margin-bottom: 4px; }
  .download span { font-size: 12px; color: #4f6d8a; }
  .download:hover { background: #e7f2ff; }
  .steps { font-size: 14px; line-height: 1.65; color: #33495e; }
  code { background: #eef4fb; padding: 2px 6px; border-radius: 4px; }
  .foot { text-align: center; font-size: 12px; color: #5d748a; padding-bottom: 30px; }
  .admin { font-size: 12px; }
</style>
</head>
<body>
  <div class="hero">
    <h1>${appName}</h1>
    <p>El mensajero de la institución. Hablá con tus compañeros, creá grupos y compartí el día a día.</p>
  </div>
  <main class="card">
    <h2>1. Descargá el cliente</h2>
    <div class="grid">
      <a class="download" href="${releasesUrl}">
        <strong>Windows 10 / 11</strong>
        <span>Instalador .exe — hacé clic en "Más información" y "Ejecutar de todas formas" si Windows avisa.</span>
      </a>
      <a class="download" href="${releasesUrl}">
        <strong>Linux</strong>
        <span>AppImage portable o paquete .deb para Ubuntu/Debian.</span>
      </a>
    </div>
    <h2>2. Entrá con tu cuenta</h2>
    <p class="steps">
      Pedile a tu docente el <strong>código de invitación</strong> del curso.<br />
      Abrí el cliente, elegí "Crear cuenta", completá el código, tu usuario y una contraseña.<br />
      Después iniciá sesión con ese usuario y contraseña.
    </p>
    <h2>3. Empezá a chatear</h2>
    <p class="steps">
      Buscá a tus compañeros por su nombre de usuario, agregalos como contactos y hacé doble clic para abrir el chat.
      También podés crear un grupo desde el botón <strong>+</strong> de la lista.
    </p>
    <p class="admin">¿Sos administrador? <a href="/admin/">Entrá al panel</a>.</p>
  </main>
  <div class="foot">${appName} · servidor de la institución</div>
</body>
</html>`;
}

export async function buildApp() {
  const app = Fastify({
    logger: config.isTest ? false : { level: config.logLevel },
    trustProxy: true,
    bodyLimit: 64 * 1024,
  });

  const db = openDatabase(config.dataDir);
  const seed = ensureSeed(db);
  app.decorate('db', db);

  await app.register(cors, { origin: config.corsOrigins });
  await app.register(rateLimit, {
    max: config.isTest ? 100_000 : 600,
    timeWindow: '1 minute',
  });

  app.decorate('authenticate', async (request, reply) => {
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      await reply.code(401).send({ error: 'No autenticado.' });
      return;
    }
    const payload = await verifyAccessToken(token);
    if (!payload) {
      await reply.code(401).send({ error: 'La sesión venció.' });
      return;
    }
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id) as unknown as UserRow | undefined;
    if (!row || row.banned === 1) {
      await reply.code(401).send({ error: 'Cuenta no disponible.' });
      return;
    }
    request.user = { id: row.id, username: row.username, role: row.role };
  });

  app.decorate('requireAdmin', async (request, reply) => {
    if (request.user?.role !== 'admin') {
      await reply.code(403).send({ error: 'Solo para administradores.' });
    }
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    if (reply.sent) return;
    const err = error as { statusCode?: number; message: string };
    const status = err.statusCode ?? 500;
    reply.code(status).send({ error: status >= 500 ? 'Error interno del servidor.' : err.message });
  });

  app.get('/health', async () => ({
    ok: true,
    app: getSettings(db).appName,
    uptime: Math.round(process.uptime()),
  }));

  app.get('/', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(landingPage(getSettings(db).appName, config.releasesUrl));
  });

  await app.register(authRoutes, { prefix: '/api' });
  await app.register(userRoutes, { prefix: '/api' });
  await app.register(contactRoutes, { prefix: '/api' });
  await app.register(conversationRoutes, { prefix: '/api' });
  await app.register(adminRoutes, { prefix: '/api/admin' });

  if (existsSync(adminDist)) {
    await app.register(fastifyStatic, {
      root: adminDist,
      prefix: '/admin/',
      decorateReply: false,
      index: ['index.html'],
    });
    app.get('/admin', async (_request, reply) => reply.redirect('/admin/'));
  } else {
    app.get('/admin', async (_request, reply) =>
      reply.type('text/plain').send('El panel todavía no está compilado. Ejecutá pnpm build:admin.'),
    );
  }

  const io = setupSockets(app);
  app.decorate('io', io);

  if (seed.createdAdmin) {
    app.log.warn(
      { credentials: seed.credentialsPath ?? 'variables de entorno' },
      'Se creó el administrador inicial. Guardá la contraseña y cambiala al entrar.',
    );
  }

  app.addHook('onClose', async () => {
    await io.close();
    db.close();
  });

  return app;
}
