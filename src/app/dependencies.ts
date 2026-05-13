import { env } from '../config/env.js';
import { PrismaHistoryStore, PrismaOrderStore } from '../db/repositories/index.js';
import { HistoryService } from '../domain/history/index.js';
import { OrderService } from '../domain/orders/index.js';
import {
  VkusvillMcpClient,
  createVkusvillMcpHttpTransport,
} from '../integrations/vkusvill-mcp/index.js';
import {
  DisabledTelegramClient,
  InMemoryTelegramUpdateDeduplicator,
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
  telegramUpdateDeduplicator: InMemoryTelegramUpdateDeduplicator;
  telegramWebhookSecret?: string;
}

export function createAppDependencies(): AppDependencies {
  const orderStore = new PrismaOrderStore();
  const historyStore = new PrismaHistoryStore();
  const vkusvillTransport = createVkusvillMcpHttpTransport();
  const vkusvillClient =
    vkusvillTransport == null ? null : new VkusvillMcpClient(vkusvillTransport);
  const historyService = new HistoryService(historyStore);
  const orderService = new OrderService(
    orderStore,
    vkusvillClient ?? new UnconfiguredVkusvillCartClient(),
  );
  const telegramClient =
    env.TELEGRAM_BOT_TOKEN == null
      ? new DisabledTelegramClient()
      : new TelegramHttpClient(env.TELEGRAM_BOT_TOKEN);
  const telegramUpdateDeduplicator = new InMemoryTelegramUpdateDeduplicator();
  const productSearchService = vkusvillClient ?? new UnconfiguredProductSearchService();

  return env.TELEGRAM_WEBHOOK_SECRET == null
    ? {
        telegramCommandHandler: new TelegramCommandHandler(
          orderService,
          historyService,
          productSearchService,
          telegramClient,
        ),
        telegramUpdateDeduplicator,
      }
    : {
        telegramCommandHandler: new TelegramCommandHandler(
          orderService,
          historyService,
          productSearchService,
          telegramClient,
        ),
        telegramUpdateDeduplicator,
        telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
      };
}
