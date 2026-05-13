import { OrderStatus, Prisma, type PrismaClient } from '@prisma/client';

import type {
  CancelDraftOrderParams,
  FinalizeDraftOrderParams,
  OrderStore,
  RemoveDraftItemParams,
  UpdateDraftItemQuantityParams,
  UpsertDraftItemParams,
} from '../../domain/orders/store.js';
import type { OrderActor, OrderView, TelegramChatRef } from '../../domain/orders/types.js';
import { prisma } from '../client.js';

const orderInclude = Prisma.validator<Prisma.OrderInclude>()({
  chat: true,
  items: {
    include: {
      productSnapshot: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  },
});

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: typeof orderInclude;
}>;

type DbClient = PrismaClient | Prisma.TransactionClient;

export class PrismaOrderStore implements OrderStore {
  public constructor(private readonly client: DbClient = prisma) {}

  public async getDraftByTelegramChatId(telegramChatId: number): Promise<OrderView | null> {
    const order = await this.client.order.findFirst({
      where: {
        status: OrderStatus.DRAFT,
        chat: {
          telegramChatId: BigInt(telegramChatId),
        },
      },
      include: orderInclude,
    });

    return order == null ? null : mapOrder(order);
  }

  public async createDraftOrder(chat: TelegramChatRef, actor?: OrderActor): Promise<OrderView> {
    return this.runInTransaction(async (tx) => {
      const chatRecord = await ensureChat(tx, chat);
      const actorRecord = actor == null ? null : await ensureActor(tx, chatRecord.id, actor);

      const existingOrder = await tx.order.findFirst({
        where: {
          chatId: chatRecord.id,
          status: OrderStatus.DRAFT,
        },
        include: orderInclude,
      });

      if (existingOrder != null) {
        return mapOrder(existingOrder);
      }

      const order = await tx.order.create({
        data: {
          chatId: chatRecord.id,
          events: {
            create: buildOrderEvent('ORDER_CREATED', actorRecord?.id ?? null, {
              telegramChatId: chat.telegramChatId,
            }),
          },
        },
        include: orderInclude,
      });

      return mapOrder(order);
    });
  }

  public async upsertDraftItem(params: UpsertDraftItemParams): Promise<OrderView> {
    return this.runInTransaction(async (tx) => {
      const order = await getDraftOrderOrThrow(tx, params.orderId);
      const actorRecord =
        params.actor == null ? null : await ensureActor(tx, order.chatId, params.actor);
      const actorUserId = actorRecord?.id ?? null;

      if (params.product.xmlId == null) {
        throw new Error('Product xmlId is required to upsert draft item.');
      }

      const existingItem = await tx.orderItem.findFirst({
        where: {
          orderId: order.id,
          productSnapshot: {
            is: {
              xmlId: params.product.xmlId,
            },
          },
        },
        include: {
          productSnapshot: true,
        },
      });

      if (existingItem == null) {
        const productSnapshot = await tx.productSnapshot.create({
          data: toProductSnapshotCreateInput(params.product),
        });

        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productSnapshotId: productSnapshot.id,
            addedByUserId: actorUserId,
            quantity: new Prisma.Decimal(params.quantity),
          },
        });
      } else {
        await tx.productSnapshot.update({
          where: {
            id: existingItem.productSnapshotId,
          },
          data: toProductSnapshotUpdateInput(params.product),
        });

        await tx.orderItem.update({
          where: {
            id: existingItem.id,
          },
          data: {
            quantity: existingItem.quantity.plus(new Prisma.Decimal(params.quantity)),
            addedByUserId: actorUserId || existingItem.addedByUserId,
          },
        });
      }

      await tx.order.update({
        where: {
          id: order.id,
        },
        data: {
          version: {
            increment: 1,
          },
          events: {
            create: buildOrderEvent('ITEM_UPSERTED', actorUserId, {
              name: params.product.name,
              quantity: params.quantity,
              xmlId: params.product.xmlId,
            }),
          },
        },
      });

      const refreshedOrder = await tx.order.findUniqueOrThrow({
        where: {
          id: order.id,
        },
        include: orderInclude,
      });

      return mapOrder(refreshedOrder);
    });
  }

  public async removeDraftItem(params: RemoveDraftItemParams): Promise<OrderView> {
    return this.runInTransaction(async (tx) => {
      const order = await getDraftOrderOrThrow(tx, params.orderId);
      const actorRecord =
        params.actor == null ? null : await ensureActor(tx, order.chatId, params.actor);
      const actorUserId = actorRecord?.id ?? null;

      await tx.orderItem.delete({
        where: {
          id: params.itemId,
          orderId: order.id,
        },
      });

      await tx.order.update({
        where: {
          id: order.id,
        },
        data: {
          version: {
            increment: 1,
          },
          events: {
            create: buildOrderEvent('ITEM_REMOVED', actorUserId, {
              itemId: params.itemId,
            }),
          },
        },
      });

      const refreshedOrder = await tx.order.findUniqueOrThrow({
        where: {
          id: order.id,
        },
        include: orderInclude,
      });

      return mapOrder(refreshedOrder);
    });
  }

  public async updateDraftItemQuantity(params: UpdateDraftItemQuantityParams): Promise<OrderView> {
    return this.runInTransaction(async (tx) => {
      const order = await getDraftOrderOrThrow(tx, params.orderId);
      const actorRecord =
        params.actor == null ? null : await ensureActor(tx, order.chatId, params.actor);
      const actorUserId = actorRecord?.id ?? null;

      await tx.orderItem.update({
        where: {
          id: params.itemId,
          orderId: order.id,
        },
        data: {
          quantity: new Prisma.Decimal(params.quantity),
        },
      });

      await tx.order.update({
        where: {
          id: order.id,
        },
        data: {
          version: {
            increment: 1,
          },
          events: {
            create: buildOrderEvent('ITEM_QUANTITY_CHANGED', actorUserId, {
              itemId: params.itemId,
              quantity: params.quantity,
            }),
          },
        },
      });

      const refreshedOrder = await tx.order.findUniqueOrThrow({
        where: {
          id: order.id,
        },
        include: orderInclude,
      });

      return mapOrder(refreshedOrder);
    });
  }

  public async finalizeDraftOrder(params: FinalizeDraftOrderParams): Promise<OrderView> {
    return this.runInTransaction(async (tx) => {
      const order = await getDraftOrderOrThrow(tx, params.orderId);
      const actorRecord =
        params.actor == null ? null : await ensureActor(tx, order.chatId, params.actor);
      const actorUserId = actorRecord?.id ?? null;
      const now = new Date();

      const finalizedOrder = await tx.order.update({
        where: {
          id: order.id,
        },
        data: {
          status: OrderStatus.FINALIZED,
          shareBasketUrl: params.shareBasketUrl,
          finalizedAt: now,
          finalizedByUserId: actorUserId,
          version: {
            increment: 1,
          },
          events: {
            create: buildOrderEvent('ORDER_FINALIZED', actorUserId, {
              shareBasketUrl: params.shareBasketUrl,
            }),
          },
        },
        include: orderInclude,
      });

      const historicalOrder = await tx.historicalOrder.create({
        data: {
          source: 'TELEGRAM',
          dedupeKey: `telegram:${order.id}`,
          originalOrderId: order.id,
          chatId: order.chatId,
          finalizedByUserId: actorUserId,
          shareBasketUrl: params.shareBasketUrl,
          itemCount: finalizedOrder.items.length,
          finalizedAt: now,
        },
      });

      if (finalizedOrder.items.length > 0) {
        await tx.historicalOrderItem.createMany({
          data: finalizedOrder.items.map((item) => ({
            historicalOrderId: historicalOrder.id,
            productSnapshotId: item.productSnapshotId,
            quantity: item.quantity,
          })),
        });
      }

      return mapOrder(finalizedOrder);
    });
  }

  public async cancelDraftOrder(params: CancelDraftOrderParams): Promise<OrderView> {
    return this.runInTransaction(async (tx) => {
      const order = await getDraftOrderOrThrow(tx, params.orderId);
      const actorRecord =
        params.actor == null ? null : await ensureActor(tx, order.chatId, params.actor);
      const actorUserId = actorRecord?.id ?? null;
      const cancelledOrder = await tx.order.update({
        where: {
          id: order.id,
        },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: new Date(),
          version: {
            increment: 1,
          },
          events: {
            create: buildOrderEvent('ORDER_CANCELLED', actorUserId),
          },
        },
        include: orderInclude,
      });

      return mapOrder(cancelledOrder);
    });
  }

  private async runInTransaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if ('$transaction' in this.client) {
      return this.client.$transaction(callback);
    }

    return callback(this.client);
  }
}

async function ensureChat(tx: Prisma.TransactionClient, chat: TelegramChatRef) {
  return tx.telegramChat.upsert({
    where: {
      telegramChatId: BigInt(chat.telegramChatId),
    },
    create: {
      telegramChatId: BigInt(chat.telegramChatId),
      type: chat.type,
      title: chat.title ?? null,
    },
    update: {
      type: chat.type,
      title: chat.title ?? null,
    },
  });
}

async function ensureActor(tx: Prisma.TransactionClient, chatId: string, actor: OrderActor) {
  const user = await tx.user.upsert({
    where: {
      telegramUserId: BigInt(actor.telegramUserId),
    },
    create: {
      telegramUserId: BigInt(actor.telegramUserId),
      username: actor.username ?? null,
      firstName: actor.firstName ?? null,
      lastName: actor.lastName ?? null,
    },
    update: {
      username: actor.username ?? null,
      firstName: actor.firstName ?? null,
      lastName: actor.lastName ?? null,
    },
  });

  await tx.chatMember.upsert({
    where: {
      chatId_userId: {
        chatId,
        userId: user.id,
      },
    },
    create: {
      chatId,
      userId: user.id,
    },
    update: {},
  });

  return user;
}

async function getDraftOrderOrThrow(tx: Prisma.TransactionClient, orderId: string) {
  return tx.order.findFirstOrThrow({
    where: {
      id: orderId,
      status: OrderStatus.DRAFT,
    },
    include: orderInclude,
  });
}

function mapOrder(order: OrderWithRelations): OrderView {
  return {
    id: order.id,
    telegramChatId: Number(order.chat.telegramChatId),
    status: order.status,
    version: order.version,
    shareBasketUrl: order.shareBasketUrl,
    finalizedAt: order.finalizedAt,
    cancelledAt: order.cancelledAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: order.items.map((item) => ({
      id: item.id,
      quantity: item.quantity.toNumber(),
      productSnapshot: {
        id: item.productSnapshot.id,
        externalProductId: item.productSnapshot.externalProductId,
        xmlId: item.productSnapshot.xmlId,
        slug: item.productSnapshot.slug,
        name: item.productSnapshot.name,
        description: item.productSnapshot.description,
        priceCurrent: decimalToNumber(item.productSnapshot.priceCurrent),
        priceOld: decimalToNumber(item.productSnapshot.priceOld),
        currency: item.productSnapshot.currency,
        unit: item.productSnapshot.unit,
        weightValue: decimalToNumber(item.productSnapshot.weightValue),
        weightUnit: item.productSnapshot.weightUnit,
        ratingAverage: decimalToNumber(item.productSnapshot.ratingAverage),
        ratingCount: item.productSnapshot.ratingCount,
        productUrl: item.productSnapshot.productUrl,
      },
    })),
  };
}

function decimalToNumber(value: Prisma.Decimal | null): number | null {
  return value == null ? null : value.toNumber();
}

function buildOrderEvent(
  type: string,
  actorUserId: string | null,
  payload?: Prisma.InputJsonValue,
): Prisma.OrderEventUncheckedCreateWithoutOrderInput {
  return {
    type,
    actorUserId,
    ...(payload == null ? {} : { payload }),
  };
}

function toProductSnapshotCreateInput(
  product: UpsertDraftItemParams['product'],
): Prisma.ProductSnapshotCreateInput {
  return {
    externalProductId: product.externalProductId ?? null,
    xmlId: product.xmlId ?? null,
    slug: product.slug ?? null,
    name: product.name,
    description: product.description ?? null,
    priceCurrent: decimalFromNumber(product.priceCurrent),
    priceOld: decimalFromNumber(product.priceOld),
    currency: product.currency ?? null,
    unit: product.unit ?? null,
    weightValue: decimalFromNumber(product.weightValue),
    weightUnit: product.weightUnit ?? null,
    ratingAverage: decimalFromNumber(product.ratingAverage),
    ratingCount: product.ratingCount ?? null,
    productUrl: product.productUrl ?? null,
    payload: product.payload ?? Prisma.JsonNull,
  };
}

function toProductSnapshotUpdateInput(
  product: UpsertDraftItemParams['product'],
): Prisma.ProductSnapshotUpdateInput {
  return {
    externalProductId: product.externalProductId ?? null,
    xmlId: product.xmlId ?? null,
    slug: product.slug ?? null,
    name: product.name,
    description: product.description ?? null,
    priceCurrent: decimalFromNumber(product.priceCurrent),
    priceOld: decimalFromNumber(product.priceOld),
    currency: product.currency ?? null,
    unit: product.unit ?? null,
    weightValue: decimalFromNumber(product.weightValue),
    weightUnit: product.weightUnit ?? null,
    ratingAverage: decimalFromNumber(product.ratingAverage),
    ratingCount: product.ratingCount ?? null,
    productUrl: product.productUrl ?? null,
    payload: product.payload ?? Prisma.JsonNull,
  };
}

function decimalFromNumber(value: number | null | undefined): Prisma.Decimal | null {
  return value == null ? null : new Prisma.Decimal(value);
}
