import type { FastifyInstance } from 'fastify';

import type { TelegramUpdate } from '../../telegram/index.js';
import type { AppDependencies } from '../dependencies.js';

export async function registerTelegramWebhookRoute(
  app: FastifyInstance,
  dependencies: AppDependencies,
): Promise<void> {
  app.post<{ Body: TelegramUpdate }>('/telegram/webhook', async (request, reply) => {
    const requestSecret = request.headers['x-telegram-bot-api-secret-token'];
    const updateContext = getTelegramUpdateContext(request.body);

    if (
      dependencies.telegramWebhookSecret != null &&
      requestSecret !== dependencies.telegramWebhookSecret
    ) {
      request.log.warn(
        { ...updateContext, correlationId: request.id },
        'Rejected Telegram webhook',
      );
      return reply.status(401).send({
        error: 'Unauthorized',
      });
    }

    if (!dependencies.telegramUpdateDeduplicator.shouldProcess(request.body.update_id)) {
      request.log.info(
        { ...updateContext, correlationId: request.id },
        'Ignored duplicate Telegram update',
      );
      return reply.status(200).send({
        ok: true,
      });
    }

    request.log.info({ ...updateContext, correlationId: request.id }, 'Processing Telegram update');

    await dependencies.telegramCommandHandler.handleUpdate(request.body);

    return reply.status(200).send({
      ok: true,
    });
  });
}

function getTelegramUpdateContext(update: TelegramUpdate): {
  command?: string;
  hasMessage: boolean;
  messageId?: number;
  telegramChatId?: number;
  telegramChatType?: string;
  telegramUserId?: number;
  updateId: number;
} {
  const message = update.message;
  const command = message?.text?.match(/^\/([a-z_]+)/i)?.[0];

  return {
    updateId: update.update_id,
    hasMessage: message != null,
    ...(message?.message_id == null ? {} : { messageId: message.message_id }),
    ...(message?.chat.id == null ? {} : { telegramChatId: message.chat.id }),
    ...(message?.chat.type == null ? {} : { telegramChatType: message.chat.type }),
    ...(message?.from?.id == null ? {} : { telegramUserId: message.from.id }),
    ...(command == null ? {} : { command }),
  };
}
