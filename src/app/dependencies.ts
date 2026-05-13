import { env } from '../config/env.js';
import { PrismaOrderStore } from '../db/repositories/index.js';
import { OrderService } from '../domain/orders/index.js';
import {
  VkusvillMcpClient,
  createVkusvillMcpHttpTransport,
} from '../integrations/vkusvill-mcp/index.js';
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

class UnconfiguredProductSearchService {
  public async searchProducts(): Promise<{ items: [] }> {
    throw new Error('Vkusvill product search client is not configured yet.');
  }
}

export interface AppDependencies {
  telegramCommandHandler: TelegramCommandHandler;
  telegramWebhookSecret?: string;
}

export function createAppDependencies(): AppDependencies {
  const orderStore = new PrismaOrderStore();
  const vkusvillTransport = createVkusvillMcpHttpTransport();
  const vkusvillClient =
    vkusvillTransport == null ? null : new VkusvillMcpClient(vkusvillTransport);
  const orderService = new OrderService(
    orderStore,
    vkusvillClient ?? new UnconfiguredVkusvillCartClient(),
  );
  const telegramClient =
    env.TELEGRAM_BOT_TOKEN == null
      ? new DisabledTelegramClient()
      : new TelegramHttpClient(env.TELEGRAM_BOT_TOKEN);
  const productSearchService = vkusvillClient ?? new UnconfiguredProductSearchService();

  return env.TELEGRAM_WEBHOOK_SECRET == null
    ? {
        telegramCommandHandler: new TelegramCommandHandler(
          orderService,
          productSearchService,
          telegramClient,
        ),
      }
    : {
        telegramCommandHandler: new TelegramCommandHandler(
          orderService,
          productSearchService,
          telegramClient,
        ),
        telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
      };
}
