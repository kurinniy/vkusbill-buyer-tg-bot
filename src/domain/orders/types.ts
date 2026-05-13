import type { Prisma } from '@prisma/client';

import type { ProductSearchResultItem } from '../../integrations/vkusvill-mcp/index.js';

export interface TelegramChatRef {
  telegramChatId: number;
  type: string;
  title?: string | null;
}

export interface OrderActor {
  telegramUserId: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface ProductSnapshotInput {
  externalProductId?: number | null;
  xmlId?: number | null;
  slug?: string | null;
  name: string;
  description?: string | null;
  priceCurrent?: number | null;
  priceOld?: number | null;
  currency?: string | null;
  unit?: string | null;
  weightValue?: number | null;
  weightUnit?: string | null;
  ratingAverage?: number | null;
  ratingCount?: number | null;
  productUrl?: string | null;
  payload?: Prisma.InputJsonValue | null;
}

export interface OrderItemView {
  id: string;
  quantity: number;
  productSnapshot: ProductSnapshotView;
}

export interface ProductSnapshotView {
  id: string;
  externalProductId: number | null;
  xmlId: number | null;
  slug: string | null;
  name: string;
  description: string | null;
  priceCurrent: number | null;
  priceOld: number | null;
  currency: string | null;
  unit: string | null;
  weightValue: number | null;
  weightUnit: string | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  productUrl: string | null;
}

export interface OrderView {
  id: string;
  telegramChatId: number;
  status: 'DRAFT' | 'FINALIZED' | 'CANCELLED';
  version: number;
  shareBasketUrl: string | null;
  finalizedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItemView[];
}

export interface AddOrderItemInput {
  chat: TelegramChatRef;
  product: ProductSnapshotInput;
  quantity: number;
  actor?: OrderActor;
}

export interface RemoveOrderItemInput {
  telegramChatId: number;
  itemId: string;
  actor?: OrderActor;
}

export interface ChangeOrderItemQuantityInput extends RemoveOrderItemInput {
  quantity: number;
}

export interface FinalizeOrderInput {
  telegramChatId: number;
  actor?: OrderActor;
}

export function productSnapshotFromSearchResult(
  product: ProductSearchResultItem,
): ProductSnapshotInput {
  return {
    externalProductId: product.id,
    xmlId: product.xmlId,
    name: product.name,
    description: product.description,
    priceCurrent: product.priceCurrent,
    priceOld: product.priceOld,
    currency: product.currency,
    unit: product.unit,
    weightValue: product.weightValue,
    weightUnit: product.weightUnit,
    ratingAverage: product.ratingAverage,
    ratingCount: product.ratingCount,
    productUrl: product.url,
  };
}
