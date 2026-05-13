import type { VkusvillMcpClient } from '../../integrations/vkusvill-mcp/index.js';
import {
  ActiveOrderNotFoundError,
  EmptyOrderFinalizeError,
  InvalidOrderProductError,
  InvalidOrderQuantityError,
} from './errors.js';
import type { OrderStore } from './store.js';
import type {
  AddOrderItemInput,
  ChangeOrderItemQuantityInput,
  FinalizeOrderInput,
  OrderActor,
  OrderView,
  RemoveOrderItemInput,
  TelegramChatRef,
} from './types.js';

export class OrderService {
  public constructor(
    private readonly orderStore: OrderStore,
    private readonly vkusvillClient: Pick<VkusvillMcpClient, 'createCartLink'>,
  ) {}

  public async createDraftOrder(chat: TelegramChatRef, actor?: OrderActor): Promise<OrderView> {
    return this.orderStore.createDraftOrder(chat, actor);
  }

  public async getActiveOrder(telegramChatId: number): Promise<OrderView | null> {
    return this.orderStore.getDraftByTelegramChatId(telegramChatId);
  }

  public async addItem(input: AddOrderItemInput): Promise<OrderView> {
    const quantity = assertPositiveQuantity(input.quantity);

    if (input.product.xmlId == null) {
      throw new InvalidOrderProductError('Нельзя добавить товар без xml_id.');
    }

    const draftOrder =
      (await this.orderStore.getDraftByTelegramChatId(input.chat.telegramChatId)) ??
      (await this.orderStore.createDraftOrder(input.chat, input.actor));

    return this.orderStore.upsertDraftItem(
      withOptionalActor(
        {
          orderId: draftOrder.id,
          product: input.product,
          quantity,
        },
        input.actor,
      ),
    );
  }

  public async removeItem(input: RemoveOrderItemInput): Promise<OrderView> {
    const draftOrder = await this.requireDraft(input.telegramChatId);

    return this.orderStore.removeDraftItem(
      withOptionalActor(
        {
          orderId: draftOrder.id,
          itemId: input.itemId,
        },
        input.actor,
      ),
    );
  }

  public async changeItemQuantity(input: ChangeOrderItemQuantityInput): Promise<OrderView> {
    const quantity = assertPositiveQuantity(input.quantity);
    const draftOrder = await this.requireDraft(input.telegramChatId);

    return this.orderStore.updateDraftItemQuantity(
      withOptionalActor(
        {
          orderId: draftOrder.id,
          itemId: input.itemId,
          quantity,
        },
        input.actor,
      ),
    );
  }

  public async finalize(input: FinalizeOrderInput): Promise<OrderView> {
    const draftOrder = await this.requireDraft(input.telegramChatId);

    if (draftOrder.items.length === 0) {
      throw new EmptyOrderFinalizeError('Нельзя финализировать пустую корзину.');
    }

    const cartItems = draftOrder.items.map((item) => {
      if (item.productSnapshot.xmlId == null) {
        throw new InvalidOrderProductError(
          `Нельзя финализировать товар "${item.productSnapshot.name}" без xml_id.`,
        );
      }

      return {
        xmlId: item.productSnapshot.xmlId,
        quantity: item.quantity,
      };
    });

    const cartLink = await this.vkusvillClient.createCartLink(cartItems);

    return this.orderStore.finalizeDraftOrder(
      withOptionalActor(
        {
          orderId: draftOrder.id,
          shareBasketUrl: cartLink.link,
        },
        input.actor,
      ),
    );
  }

  public async cancel(input: FinalizeOrderInput): Promise<OrderView> {
    const draftOrder = await this.requireDraft(input.telegramChatId);

    return this.orderStore.cancelDraftOrder(
      withOptionalActor(
        {
          orderId: draftOrder.id,
        },
        input.actor,
      ),
    );
  }

  private async requireDraft(telegramChatId: number): Promise<OrderView> {
    const draftOrder = await this.orderStore.getDraftByTelegramChatId(telegramChatId);

    if (draftOrder == null) {
      throw new ActiveOrderNotFoundError('Активный заказ для чата не найден.');
    }

    return draftOrder;
  }
}

function assertPositiveQuantity(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new InvalidOrderQuantityError('Количество должно быть положительным числом.');
  }

  return quantity;
}

function withOptionalActor<T extends object>(
  params: T,
  actor: OrderActor,
): T & { actor: OrderActor };
function withOptionalActor<T extends object>(params: T, actor?: OrderActor): T;
function withOptionalActor<T extends object>(params: T, actor?: OrderActor) {
  return actor == null ? params : { ...params, actor };
}
