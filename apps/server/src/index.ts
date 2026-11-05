import { buildApp } from './app.js';
import { config } from './config.js';
import { startJobs } from './jobs.js';

const app = await buildApp();

try {
  startJobs(app);
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Messenger El Nacio escuchando en http://localhost:${config.port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    app.log.info(`Cerrando por ${signal}...`);
    await app.close();
    process.exit(0);
  });
}
