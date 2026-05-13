import Fastify, { type FastifyInstance } from 'fastify';

import { env } from '../config/env.js';
import { type AppDependencies, createAppDependencies } from './dependencies.js';
import { registerHealthRoute } from './routes/health.js';
import { registerTelegramWebhookRoute } from './routes/telegram-webhook.js';

export function buildApp(dependencies: AppDependencies = createAppDependencies()): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
    disableRequestLogging: env.NODE_ENV === 'test',
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Unhandled application error');

    void reply.status(500).send({
      error: 'Internal Server Error',
    });
  });

  void app.register(registerHealthRoute);
  void app.register(registerTelegramWebhookRoute, dependencies);

  return app;
}
