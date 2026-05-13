import type { FastifyInstance } from 'fastify';

import type { TelegramUpdate } from '../../telegram/index.js';
import type { AppDependencies } from '../dependencies.js';

export async function registerTelegramWebhookRoute(
  app: FastifyInstance,
  dependencies: AppDependencies,
): Promise<void> {
  app.post<{ Body: TelegramUpdate }>('/telegram/webhook', async (request, reply) => {
    const requestSecret = request.headers['x-telegram-bot-api-secret-token'];

    if (
      dependencies.telegramWebhookSecret != null &&
      requestSecret !== dependencies.telegramWebhookSecret
    ) {
      return reply.status(401).send({
        error: 'Unauthorized',
      });
    }

    if (!dependencies.telegramUpdateDeduplicator.shouldProcess(request.body.update_id)) {
      return reply.status(200).send({
        ok: true,
      });
    }

    await dependencies.telegramCommandHandler.handleUpdate(request.body);

    return reply.status(200).send({
      ok: true,
    });
  });
}
