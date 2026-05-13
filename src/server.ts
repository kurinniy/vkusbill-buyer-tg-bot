import { buildApp } from './app/app.js';
import { env } from './config/env.js';

const app = buildApp();

const closeSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

for (const signal of closeSignals) {
  process.once(signal, () => {
    app.log.info({ signal }, 'Shutdown signal received');

    void app.close().finally(() => {
      process.exit(0);
    });
  });
}

try {
  await app.listen({
    host: env.HOST,
    port: env.PORT,
  });

  app.log.info(
    {
      host: env.HOST,
      port: env.PORT,
      environment: env.NODE_ENV,
    },
    'HTTP server started',
  );
} catch (error) {
  app.log.error({ err: error }, 'Failed to start HTTP server');
  process.exit(1);
}
