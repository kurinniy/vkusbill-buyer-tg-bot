import type { OrderActor, OrderView, ProductSnapshotInput, TelegramChatRef } from './types.js';

export interface UpsertDraftItemParams {
  orderId: string;
  product: ProductSnapshotInput;
  quantity: number;
  actor?: OrderActor;
}

export interface RemoveDraftItemParams {
  orderId: string;
  itemId: string;
  actor?: OrderActor;
}

export interface UpdateDraftItemQuantityParams extends RemoveDraftItemParams {
  quantity: number;
}

export interface FinalizeDraftOrderParams {
  orderId: string;
  shareBasketUrl: string;
  actor?: OrderActor;
}

export interface CancelDraftOrderParams {
  orderId: string;
  actor?: OrderActor;
}

export interface OrderStore {
  getDraftByTelegramChatId(telegramChatId: number): Promise<OrderView | null>;
  createDraftOrder(chat: TelegramChatRef, actor?: OrderActor): Promise<OrderView>;
  upsertDraftItem(params: UpsertDraftItemParams): Promise<OrderView>;
  removeDraftItem(params: RemoveDraftItemParams): Promise<OrderView>;
  updateDraftItemQuantity(params: UpdateDraftItemQuantityParams): Promise<OrderView>;
  finalizeDraftOrder(params: FinalizeDraftOrderParams): Promise<OrderView>;
  cancelDraftOrder(params: CancelDraftOrderParams): Promise<OrderView>;
}
