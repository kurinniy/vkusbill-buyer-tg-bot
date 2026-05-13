import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import { HistoryService } from '../../domain/history/index.js';
import type { HistoricalOrderView, HistoryStore } from '../../domain/history/index.js';
import { OrderService } from '../../domain/orders/index.js';
import type {
  CancelDraftOrderParams,
  FinalizeDraftOrderParams,
  OrderStore,
  RemoveDraftItemParams,
  UpdateDraftItemQuantityParams,
  UpsertDraftItemParams,
} from '../../domain/orders/index.js';
import type { OrderActor, OrderView, TelegramChatRef } from '../../domain/orders/index.js';
import type { ProductSearchResultItem } from '../../integrations/vkusvill-mcp/index.js';
import {
  InMemoryTelegramUpdateDeduplicator,
  type TelegramClient,
  TelegramCommandHandler,
} from '../../telegram/index.js';
import type { AppDependencies } from '../dependencies.js';
import { registerTelegramWebhookRoute } from './telegram-webhook.js';

test('POST /telegram/webhook handles /new_order and responds via Telegram client', async () => {
  const { app, telegramClient } = await buildTestApp();

  const response = await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 1,
      message: {
        message_id: 1,
        text: '/new_order',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
        from: {
          id: 77,
          username: 'tester',
          first_name: 'Test',
        },
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(telegramClient.messages.length, 1);
  assert.equal(
    telegramClient.messages[0]?.text,
    'Создал новую корзину. Добавляйте товары, затем смотрите состав через /cart.',
  );

  await app.close();
});

test('POST /telegram/webhook handles /start', async () => {
  const { app, telegramClient } = await buildTestApp();

  const response = await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 1001,
      message: {
        message_id: 1001,
        text: '/start',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.match(telegramClient.messages[0]?.text ?? '', /Бот помогает собирать общую корзину/);
  assert.match(telegramClient.messages[0]?.text ?? '', /\/help/);

  await app.close();
});

test('POST /telegram/webhook handles /help', async () => {
  const { app, telegramClient } = await buildTestApp();

  const response = await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 1002,
      message: {
        message_id: 1002,
        text: '/help',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.match(telegramClient.messages[0]?.text ?? '', /Доступные команды:/);
  assert.match(telegramClient.messages[0]?.text ?? '', /\/finalize/);
  assert.match(telegramClient.messages[0]?.text ?? '', /\/history/);

  await app.close();
});

test('POST /telegram/webhook handles /cart for empty cart', async () => {
  const { app, telegramClient } = await buildTestApp();

  await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 1,
      message: {
        message_id: 1,
        text: '/new_order',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
      },
    },
  });

  const response = await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 2,
      message: {
        message_id: 2,
        text: '/cart',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(telegramClient.messages[1]?.text, 'Корзина пуста.');

  await app.close();
});

test('POST /telegram/webhook handles /search and /add using last search results', async () => {
  const { app, telegramClient } = await buildTestApp();

  const searchResponse = await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 3,
      message: {
        message_id: 3,
        text: '/search бананы',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
        from: {
          id: 77,
          username: 'tester',
          first_name: 'Test',
        },
      },
    },
  });

  assert.equal(searchResponse.statusCode, 200);
  assert.match(telegramClient.messages[0]?.text ?? '', /Результаты поиска:/);
  assert.match(telegramClient.messages[0]?.text ?? '', /1\. Бананы — 168 ₽/);

  const addResponse = await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 4,
      message: {
        message_id: 4,
        text: '/add 1 2',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
        from: {
          id: 77,
          username: 'tester',
          first_name: 'Test',
        },
      },
    },
  });

  assert.equal(addResponse.statusCode, 200);
  assert.equal(telegramClient.messages[1]?.text, 'Добавил в корзину: Бананы x 2.');

  const cartResponse = await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 5,
      message: {
        message_id: 5,
        text: '/cart',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
      },
    },
  });

  assert.equal(cartResponse.statusCode, 200);
  assert.equal(telegramClient.messages[2]?.text, 'Текущая корзина:\n1. Бананы x 2');

  await app.close();
});

test('POST /telegram/webhook handles /finalize and returns share basket link', async () => {
  const { app, telegramClient } = await buildTestApp();

  await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 6,
      message: {
        message_id: 6,
        text: '/search бананы',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
        from: {
          id: 77,
          username: 'tester',
          first_name: 'Test',
        },
      },
    },
  });

  await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 7,
      message: {
        message_id: 7,
        text: '/add 1 2',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
        from: {
          id: 77,
          username: 'tester',
          first_name: 'Test',
        },
      },
    },
  });

  const response = await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 8,
      message: {
        message_id: 8,
        text: '/finalize',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
        from: {
          id: 77,
          username: 'tester',
          first_name: 'Test',
        },
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    telegramClient.messages[2]?.text,
    'Корзина финализирована.\nСсылка: https://vkusvill.ru/?share_basket=test',
  );

  await app.close();
});

test('POST /telegram/webhook handles /cancel and removes active draft', async () => {
  const { app, telegramClient } = await buildTestApp();

  await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 9,
      message: {
        message_id: 9,
        text: '/new_order',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
        from: {
          id: 77,
          username: 'tester',
          first_name: 'Test',
        },
      },
    },
  });

  const cancelResponse = await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 10,
      message: {
        message_id: 10,
        text: '/cancel',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
        from: {
          id: 77,
          username: 'tester',
          first_name: 'Test',
        },
      },
    },
  });

  assert.equal(cancelResponse.statusCode, 200);
  assert.equal(telegramClient.messages[1]?.text, 'Корзина отменена.');

  const cartResponse = await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 11,
      message: {
        message_id: 11,
        text: '/cart',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
      },
    },
  });

  assert.equal(cartResponse.statusCode, 200);
  assert.equal(
    telegramClient.messages[2]?.text,
    'Активной корзины нет. Создайте её командой /new_order.',
  );

  await app.close();
});

test('POST /telegram/webhook prevents /finalize for empty cart', async () => {
  const { app, telegramClient } = await buildTestApp();

  await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 12,
      message: {
        message_id: 12,
        text: '/new_order',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
      },
    },
  });

  const response = await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 13,
      message: {
        message_id: 13,
        text: '/finalize',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    telegramClient.messages[1]?.text,
    'Нельзя финализировать пустую корзину. Добавьте товары через /search и /add.',
  );

  await app.close();
});

test('POST /telegram/webhook handles /remove using cart item number', async () => {
  const { app, telegramClient } = await buildTestApp();

  await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 14,
      message: {
        message_id: 14,
        text: '/search бананы',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
        from: {
          id: 77,
          username: 'tester',
          first_name: 'Test',
        },
      },
    },
  });

  await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 15,
      message: {
        message_id: 15,
        text: '/add 1 2',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
        from: {
          id: 77,
          username: 'tester',
          first_name: 'Test',
        },
      },
    },
  });

  const removeResponse = await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 16,
      message: {
        message_id: 16,
        text: '/remove 1',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
        from: {
          id: 77,
          username: 'tester',
          first_name: 'Test',
        },
      },
    },
  });

  assert.equal(removeResponse.statusCode, 200);
  assert.equal(telegramClient.messages[2]?.text, 'Удалил из корзины: Бананы.');

  const cartResponse = await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 17,
      message: {
        message_id: 17,
        text: '/cart',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
      },
    },
  });

  assert.equal(cartResponse.statusCode, 200);
  assert.equal(telegramClient.messages[3]?.text, 'Корзина пуста.');

  await app.close();
});

test('POST /telegram/webhook shows recent order history', async () => {
  const { app, telegramClient } = await buildTestApp();

  await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 18,
      message: {
        message_id: 18,
        text: '/search бананы',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
        from: {
          id: 77,
          username: 'tester',
          first_name: 'Test',
        },
      },
    },
  });

  await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 19,
      message: {
        message_id: 19,
        text: '/add 1 2',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
        from: {
          id: 77,
          username: 'tester',
          first_name: 'Test',
        },
      },
    },
  });

  await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 20,
      message: {
        message_id: 20,
        text: '/finalize',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
        from: {
          id: 77,
          username: 'tester',
          first_name: 'Test',
        },
      },
    },
  });

  const historyResponse = await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload: {
      update_id: 21,
      message: {
        message_id: 21,
        text: '/history',
        chat: {
          id: 101,
          type: 'group',
          title: 'Test Group',
        },
      },
    },
  });

  assert.equal(historyResponse.statusCode, 200);
  assert.match(telegramClient.messages[3]?.text ?? '', /Последние заказы:/);
  assert.match(telegramClient.messages[3]?.text ?? '', /Бананы x 2/);
  assert.match(
    telegramClient.messages[3]?.text ?? '',
    /https:\/\/vkusvill\.ru\/\?share_basket=test/,
  );

  await app.close();
});

test('POST /telegram/webhook rejects wrong secret', async () => {
  const { app, telegramClient } = await buildTestApp();

  const response = await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'wrong-secret',
    },
    payload: {
      update_id: 1,
    },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(telegramClient.messages.length, 0);

  await app.close();
});

test('POST /telegram/webhook ignores duplicate update ids', async () => {
  const { app, telegramClient } = await buildTestApp();

  const payload = {
    update_id: 500,
    message: {
      message_id: 1,
      text: '/new_order',
      chat: {
        id: 101,
        type: 'group' as const,
        title: 'Test Group',
      },
      from: {
        id: 77,
        username: 'tester',
        first_name: 'Test',
      },
    },
  };

  const firstResponse = await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload,
  });

  const secondResponse = await app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'test-secret',
    },
    payload,
  });

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(secondResponse.statusCode, 200);
  assert.equal(telegramClient.messages.length, 1);

  await app.close();
});

async function buildTestApp() {
  const app = Fastify({ logger: false });
  const store = new InMemoryOrderStore();
  const orderService = new OrderService(store, {
    async createCartLink() {
      return {
        link: 'https://vkusvill.ru/?share_basket=test',
      };
    },
  });
  const historyService = new HistoryService(store);
  const telegramClient = new FakeTelegramClient();
  const dependencies: AppDependencies = {
    telegramCommandHandler: new TelegramCommandHandler(
      orderService,
      historyService,
      new FakeProductSearchService(),
      telegramClient,
    ),
    telegramUpdateDeduplicator: new InMemoryTelegramUpdateDeduplicator(),
    telegramWebhookSecret: 'test-secret',
  };

  await app.register(registerTelegramWebhookRoute, dependencies);

  return { app, telegramClient };
}

class FakeTelegramClient implements TelegramClient {
  public messages: Array<{ chatId: number; text: string }> = [];

  public async sendMessage(chatId: number, text: string): Promise<void> {
    this.messages.push({ chatId, text });
  }
}

class FakeProductSearchService {
  public async searchProducts(): Promise<{ items: ProductSearchResultItem[] }> {
    return {
      items: [
        {
          id: 731,
          xmlId: 731,
          name: 'Бананы',
          description: 'Фрукт',
          priceCurrent: 168,
          priceOld: null,
          currency: 'RUB',
          unit: 'кг',
          weightValue: null,
          weightUnit: null,
          ratingAverage: 4.9,
          ratingCount: 100,
          url: 'https://vkusvill.ru/goods/banany-731.html',
        },
      ],
    };
  }
}

class InMemoryOrderStore implements OrderStore, HistoryStore {
  private order: OrderView | null = null;
  private history: HistoricalOrderView[] = [];

  public async getDraftByTelegramChatId(telegramChatId: number): Promise<OrderView | null> {
    if (this.order?.telegramChatId === telegramChatId && this.order.status === 'DRAFT') {
      return structuredClone(this.order);
    }

    return null;
  }

  public async createDraftOrder(chat: TelegramChatRef): Promise<OrderView> {
    if (this.order?.telegramChatId === chat.telegramChatId && this.order.status === 'DRAFT') {
      return structuredClone(this.order);
    }

    this.order = {
      id: `order-${chat.telegramChatId}`,
      telegramChatId: chat.telegramChatId,
      status: 'DRAFT',
      version: 1,
      shareBasketUrl: null,
      finalizedAt: null,
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    };

    return structuredClone(this.order);
  }

  public async upsertDraftItem(params: UpsertDraftItemParams): Promise<OrderView> {
    const order = this.requireDraft(params.orderId);

    order.items.push({
      id: `item-${order.items.length + 1}`,
      quantity: params.quantity,
      productSnapshot: {
        id: `snapshot-${order.items.length + 1}`,
        externalProductId: params.product.externalProductId ?? null,
        xmlId: params.product.xmlId ?? null,
        slug: params.product.slug ?? null,
        name: params.product.name,
        description: params.product.description ?? null,
        priceCurrent: params.product.priceCurrent ?? null,
        priceOld: params.product.priceOld ?? null,
        currency: params.product.currency ?? null,
        unit: params.product.unit ?? null,
        weightValue: params.product.weightValue ?? null,
        weightUnit: params.product.weightUnit ?? null,
        ratingAverage: params.product.ratingAverage ?? null,
        ratingCount: params.product.ratingCount ?? null,
        productUrl: params.product.productUrl ?? null,
      },
    });

    order.version += 1;
    order.updatedAt = new Date();

    return structuredClone(order);
  }

  public async removeDraftItem(params: RemoveDraftItemParams): Promise<OrderView> {
    const order = this.requireDraft(params.orderId);
    order.items = order.items.filter((item) => item.id !== params.itemId);
    return structuredClone(order);
  }

  public async updateDraftItemQuantity(params: UpdateDraftItemQuantityParams): Promise<OrderView> {
    const order = this.requireDraft(params.orderId);
    const item = order.items.find((candidate) => candidate.id === params.itemId);

    if (item == null) {
      throw new Error('Item not found');
    }

    item.quantity = params.quantity;
    return structuredClone(order);
  }

  public async finalizeDraftOrder(params: FinalizeDraftOrderParams): Promise<OrderView> {
    const order = this.requireDraft(params.orderId);
    order.status = 'FINALIZED';
    order.shareBasketUrl = params.shareBasketUrl;
    order.finalizedAt = new Date();
    this.history.unshift({
      id: `history-${order.id}`,
      source: 'TELEGRAM',
      shareBasketUrl: params.shareBasketUrl,
      itemCount: order.items.length,
      finalizedAt: order.finalizedAt,
      finalizedBy: params.actor?.username == null ? null : `@${params.actor.username}`,
      items: order.items.map((item) => ({
        name: item.productSnapshot.name,
        quantity: item.quantity,
      })),
    });
    return structuredClone(order);
  }

  public async cancelDraftOrder(params: CancelDraftOrderParams): Promise<OrderView> {
    const order = this.requireDraft(params.orderId);
    order.status = 'CANCELLED';
    order.cancelledAt = new Date();
    return structuredClone(order);
  }

  public async getRecentByTelegramChatId(): Promise<HistoricalOrderView[]> {
    return structuredClone(this.history);
  }

  private requireDraft(orderId: string): OrderView {
    if (this.order == null || this.order.id !== orderId) {
      throw new Error(`Draft order ${orderId} not found`);
    }

    return this.order;
  }
}
