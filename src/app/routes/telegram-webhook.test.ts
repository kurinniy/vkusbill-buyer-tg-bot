import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

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
import { type TelegramClient, TelegramCommandHandler } from '../../telegram/index.js';
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

async function buildTestApp() {
  const app = Fastify({ logger: false });
  const orderService = new OrderService(new InMemoryOrderStore(), {
    async createCartLink() {
      return {
        link: 'https://vkusvill.ru/?share_basket=test',
      };
    },
  });
  const telegramClient = new FakeTelegramClient();
  const dependencies: AppDependencies = {
    telegramCommandHandler: new TelegramCommandHandler(orderService, telegramClient),
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

class InMemoryOrderStore implements OrderStore {
  private order: OrderView | null = null;

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
    return structuredClone(order);
  }

  public async cancelDraftOrder(params: CancelDraftOrderParams): Promise<OrderView> {
    const order = this.requireDraft(params.orderId);
    order.status = 'CANCELLED';
    order.cancelledAt = new Date();
    return structuredClone(order);
  }

  private requireDraft(orderId: string): OrderView {
    if (this.order == null || this.order.id !== orderId) {
      throw new Error(`Draft order ${orderId} not found`);
    }

    return this.order;
  }
}
