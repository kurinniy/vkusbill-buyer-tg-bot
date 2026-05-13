import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ActiveOrderNotFoundError,
  EmptyOrderFinalizeError,
  InvalidOrderProductError,
} from './errors.js';
import { OrderService } from './order-service.js';
import type {
  CancelDraftOrderParams,
  FinalizeDraftOrderParams,
  OrderStore,
  RemoveDraftItemParams,
  UpdateDraftItemQuantityParams,
  UpsertDraftItemParams,
} from './store.js';
import type { OrderActor, OrderItemView, OrderView, TelegramChatRef } from './types.js';

test('createDraftOrder returns same draft for one chat', async () => {
  const service = new OrderService(new InMemoryOrderStore(), new FakeVkusvillClient());
  const chat = createChat();

  const firstOrder = await service.createDraftOrder(chat);
  const secondOrder = await service.createDraftOrder(chat);

  assert.equal(firstOrder.id, secondOrder.id);
  assert.equal(secondOrder.status, 'DRAFT');
});

test('addItem creates draft automatically and aggregates quantity by xmlId', async () => {
  const service = new OrderService(new InMemoryOrderStore(), new FakeVkusvillClient());

  await service.addItem({
    chat: createChat(),
    actor: createActor(),
    quantity: 1,
    product: createProduct(),
  });

  const order = await service.addItem({
    chat: createChat(),
    actor: createActor(),
    quantity: 2,
    product: createProduct(),
  });

  assert.equal(order.items.length, 1);
  assert.equal(order.items[0]?.quantity, 3);
});

test('finalize creates share basket link and changes status', async () => {
  const client = new FakeVkusvillClient();
  const service = new OrderService(new InMemoryOrderStore(), client);
  const chat = createChat();

  await service.addItem({
    chat,
    quantity: 1,
    product: createProduct(),
  });

  const finalizedOrder = await service.finalize({
    telegramChatId: chat.telegramChatId,
    actor: createActor(),
  });

  assert.equal(finalizedOrder.status, 'FINALIZED');
  assert.equal(finalizedOrder.shareBasketUrl, 'https://vkusvill.ru/?share_basket=test');
  assert.deepEqual(client.lastCreateCartLinkInput, [{ xmlId: 731, quantity: 1 }]);
});

test('finalize fails for empty order', async () => {
  const service = new OrderService(new InMemoryOrderStore(), new FakeVkusvillClient());
  const chat = createChat();

  await service.createDraftOrder(chat);

  await assert.rejects(
    service.finalize({ telegramChatId: chat.telegramChatId }),
    EmptyOrderFinalizeError,
  );
});

test('finalize fails when no active draft exists', async () => {
  const service = new OrderService(new InMemoryOrderStore(), new FakeVkusvillClient());

  await assert.rejects(service.finalize({ telegramChatId: 999 }), ActiveOrderNotFoundError);
});

test('addItem rejects product without xmlId', async () => {
  const service = new OrderService(new InMemoryOrderStore(), new FakeVkusvillClient());

  await assert.rejects(
    service.addItem({
      chat: createChat(),
      quantity: 1,
      product: {
        ...createProduct(),
        xmlId: null,
      },
    }),
    InvalidOrderProductError,
  );
});

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
    const existingItem = order.items.find(
      (item) => item.productSnapshot.xmlId === (params.product.xmlId ?? null),
    );

    if (existingItem == null) {
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
    } else {
      existingItem.quantity += params.quantity;
    }

    order.version += 1;
    order.updatedAt = new Date();

    return structuredClone(order);
  }

  public async removeDraftItem(params: RemoveDraftItemParams): Promise<OrderView> {
    const order = this.requireDraft(params.orderId);
    order.items = order.items.filter((item) => item.id !== params.itemId);
    order.version += 1;
    order.updatedAt = new Date();
    return structuredClone(order);
  }

  public async updateDraftItemQuantity(params: UpdateDraftItemQuantityParams): Promise<OrderView> {
    const order = this.requireDraft(params.orderId);
    const item = order.items.find((candidate) => candidate.id === params.itemId);

    if (item == null) {
      throw new Error(`Item ${params.itemId} not found`);
    }

    item.quantity = params.quantity;
    order.version += 1;
    order.updatedAt = new Date();
    return structuredClone(order);
  }

  public async finalizeDraftOrder(params: FinalizeDraftOrderParams): Promise<OrderView> {
    const order = this.requireDraft(params.orderId);
    order.status = 'FINALIZED';
    order.shareBasketUrl = params.shareBasketUrl;
    order.finalizedAt = new Date();
    order.version += 1;
    order.updatedAt = new Date();
    return structuredClone(order);
  }

  public async cancelDraftOrder(params: CancelDraftOrderParams): Promise<OrderView> {
    const order = this.requireDraft(params.orderId);
    order.status = 'CANCELLED';
    order.cancelledAt = new Date();
    order.version += 1;
    order.updatedAt = new Date();
    return structuredClone(order);
  }

  private requireDraft(orderId: string): OrderView {
    if (this.order == null || this.order.id !== orderId || this.order.status !== 'DRAFT') {
      throw new Error(`Draft order ${orderId} not found`);
    }

    return this.order;
  }
}

class FakeVkusvillClient {
  public lastCreateCartLinkInput: { quantity: number; xmlId: number }[] | null = null;

  public async createCartLink(items: { quantity: number; xmlId: number }[]) {
    this.lastCreateCartLinkInput = items;

    return {
      link: 'https://vkusvill.ru/?share_basket=test',
    };
  }
}

function createChat(): TelegramChatRef {
  return {
    telegramChatId: 10001,
    type: 'group',
    title: 'Test Chat',
  };
}

function createActor(): OrderActor {
  return {
    telegramUserId: 77,
    username: 'tester',
    firstName: 'Test',
    lastName: 'User',
  };
}

function createProduct() {
  return {
    externalProductId: 731,
    xmlId: 731,
    name: 'Бананы',
    description: 'Фрукт',
    priceCurrent: 168,
    currency: 'RUB',
  };
}
