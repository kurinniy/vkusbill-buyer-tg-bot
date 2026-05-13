import type { OrderService } from '../domain/orders/index.js';
import type { OrderActor, OrderView, TelegramChatRef } from '../domain/orders/index.js';
import type { TelegramClient } from './telegram-client.js';
import type { TelegramMessage, TelegramUpdate } from './types.js';

type SupportedOrderService = Pick<OrderService, 'createDraftOrder' | 'getActiveOrder'>;

export class TelegramCommandHandler {
  public constructor(
    private readonly orderService: SupportedOrderService,
    private readonly telegramClient: TelegramClient,
  ) {}

  public async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;

    if (message?.text == null) {
      return;
    }

    const command = parseTelegramCommand(message.text);

    if (command == null) {
      return;
    }

    if (!isGroupChat(message.chat.type)) {
      await this.telegramClient.sendMessage(
        message.chat.id,
        'Этот бот сейчас работает только в группах и супергруппах.',
      );
      return;
    }

    switch (command) {
      case '/new_order':
        await this.handleNewOrder(message);
        return;
      case '/cart':
        await this.handleCart(message);
        return;
      default:
        return;
    }
  }

  private async handleNewOrder(message: TelegramMessage): Promise<void> {
    const existingOrder = await this.orderService.getActiveOrder(message.chat.id);

    if (existingOrder != null) {
      await this.telegramClient.sendMessage(
        message.chat.id,
        'Активная корзина уже есть. Посмотреть её можно командой /cart.',
      );
      return;
    }

    await this.orderService.createDraftOrder(toChatRef(message), toActor(message));

    await this.telegramClient.sendMessage(
      message.chat.id,
      'Создал новую корзину. Добавляйте товары, затем смотрите состав через /cart.',
    );
  }

  private async handleCart(message: TelegramMessage): Promise<void> {
    const order = await this.orderService.getActiveOrder(message.chat.id);

    if (order == null) {
      await this.telegramClient.sendMessage(
        message.chat.id,
        'Активной корзины нет. Создайте её командой /new_order.',
      );
      return;
    }

    await this.telegramClient.sendMessage(message.chat.id, formatCart(order));
  }
}

function parseTelegramCommand(text: string): '/new_order' | '/cart' | null {
  const match = text.trim().match(/^\/([a-z_]+)(?:@[a-z0-9_]+)?(?:\s|$)/i);

  if (match == null) {
    return null;
  }

  const command = `/${match[1]?.toLowerCase()}`;

  if (command === '/new_order' || command === '/cart') {
    return command;
  }

  return null;
}

function isGroupChat(chatType: TelegramMessage['chat']['type']): boolean {
  return chatType === 'group' || chatType === 'supergroup';
}

function toChatRef(message: TelegramMessage): TelegramChatRef {
  return {
    telegramChatId: message.chat.id,
    type: message.chat.type,
    title: message.chat.title ?? null,
  };
}

function toActor(message: TelegramMessage): OrderActor | undefined {
  if (message.from == null) {
    return undefined;
  }

  const actor: OrderActor = {
    telegramUserId: message.from.id,
  };

  if (message.from.username != null) {
    actor.username = message.from.username;
  }

  if (message.from.first_name != null) {
    actor.firstName = message.from.first_name;
  }

  if (message.from.last_name != null) {
    actor.lastName = message.from.last_name;
  }

  return actor;
}

function formatCart(order: OrderView): string {
  if (order.items.length === 0) {
    return 'Корзина пуста.';
  }

  const lines = order.items.map(
    (item, index) => `${index + 1}. ${item.productSnapshot.name} x ${item.quantity}`,
  );

  return ['Текущая корзина:', ...lines].join('\n');
}
