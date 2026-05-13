import Fastify, { type FastifyInstance } from 'fastify';

import { env } from '../config/env.js';
import { registerHealthRoute } from './routes/health.js';

export function buildApp(): FastifyInstance {
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

  return app;
}
