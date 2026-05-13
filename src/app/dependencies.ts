import { env } from '../config/env.js';
import { PrismaOrderStore } from '../db/repositories/index.js';
import { OrderService } from '../domain/orders/index.js';
import {
  DisabledTelegramClient,
  TelegramCommandHandler,
  TelegramHttpClient,
} from '../telegram/index.js';

class UnconfiguredVkusvillCartClient {
  public async createCartLink(): Promise<{ link: string }> {
    throw new Error('Vkusvill cart link client is not configured yet.');
  }
}

export interface AppDependencies {
  telegramCommandHandler: TelegramCommandHandler;
  telegramWebhookSecret?: string;
}

export function createAppDependencies(): AppDependencies {
  const orderStore = new PrismaOrderStore();
  const orderService = new OrderService(orderStore, new UnconfiguredVkusvillCartClient());
  const telegramClient =
    env.TELEGRAM_BOT_TOKEN == null
      ? new DisabledTelegramClient()
      : new TelegramHttpClient(env.TELEGRAM_BOT_TOKEN);

  return env.TELEGRAM_WEBHOOK_SECRET == null
    ? {
        telegramCommandHandler: new TelegramCommandHandler(orderService, telegramClient),
      }
    : {
        telegramCommandHandler: new TelegramCommandHandler(orderService, telegramClient),
        telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
      };
}
