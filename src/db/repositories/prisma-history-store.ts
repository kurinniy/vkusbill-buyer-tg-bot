import { Prisma, type PrismaClient } from '@prisma/client';

import type { HistoryStore } from '../../domain/history/store.js';
import type { HistoricalOrderView } from '../../domain/history/types.js';
import { prisma } from '../client.js';

const historicalOrderInclude = Prisma.validator<Prisma.HistoricalOrderInclude>()({
  finalizedByUser: true,
  items: {
    include: {
      productSnapshot: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  },
});

type HistoricalOrderWithRelations = Prisma.HistoricalOrderGetPayload<{
  include: typeof historicalOrderInclude;
}>;

type DbClient = PrismaClient | Prisma.TransactionClient;

export class PrismaHistoryStore implements HistoryStore {
  public constructor(private readonly client: DbClient = prisma) {}

  public async getRecentByTelegramChatId(
    telegramChatId: number,
    limit: number,
  ): Promise<HistoricalOrderView[]> {
    const orders = await this.client.historicalOrder.findMany({
      where: {
        chat: {
          telegramChatId: BigInt(telegramChatId),
        },
      },
      include: historicalOrderInclude,
      orderBy: [
        {
          finalizedAt: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
      take: limit,
    });

    return orders.map(mapHistoricalOrder);
  }
}

function mapHistoricalOrder(order: HistoricalOrderWithRelations): HistoricalOrderView {
  return {
    id: order.id,
    source: order.source,
    shareBasketUrl: order.shareBasketUrl,
    itemCount: order.itemCount,
    finalizedAt: order.finalizedAt,
    finalizedBy: formatFinalizedBy(order),
    items: order.items.map((item) => ({
      name: item.productSnapshot.name,
      quantity: Number(item.quantity),
    })),
  };
}

function formatFinalizedBy(order: HistoricalOrderWithRelations): string | null {
  const user = order.finalizedByUser;

  if (user == null) {
    return null;
  }

  if (user.username != null && user.username.length > 0) {
    return `@${user.username}`;
  }

  const fullName = [user.firstName, user.lastName].filter(
    (part) => part != null && part.length > 0,
  );

  if (fullName.length > 0) {
    return fullName.join(' ');
  }

  return null;
}
