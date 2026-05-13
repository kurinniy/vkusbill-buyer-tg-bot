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
    requestIdHeader: 'x-request-id',
  });

  app.addHook('onRequest', (request, reply, done) => {
    reply.header('x-correlation-id', request.id);
    done();
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, correlationId: request.id }, 'Unhandled application error');

    void reply.status(500).send({
      error: 'Internal Server Error',
      correlationId: request.id,
    });
  });

  void app.register(registerHealthRoute);
  void app.register(registerTelegramWebhookRoute, dependencies);

  return app;
}
