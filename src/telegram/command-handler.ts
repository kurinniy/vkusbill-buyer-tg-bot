import { type OrderService, productSnapshotFromSearchResult } from '../domain/orders/index.js';
import type { OrderActor, OrderView, TelegramChatRef } from '../domain/orders/index.js';
import type { ProductSearchResultItem } from '../integrations/vkusvill-mcp/index.js';
import type { TelegramClient } from './telegram-client.js';
import type { TelegramMessage, TelegramUpdate } from './types.js';

type SupportedOrderService = Pick<OrderService, 'addItem' | 'createDraftOrder' | 'getActiveOrder'>;

export interface ProductSearchService {
  searchProducts(params: { query: string }): Promise<{
    items: ProductSearchResultItem[];
  }>;
}

export class TelegramCommandHandler {
  private readonly lastSearchResultsByChat = new Map<number, ProductSearchResultItem[]>();

  public constructor(
    private readonly orderService: SupportedOrderService,
    private readonly productSearchService: ProductSearchService,
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

    switch (command.name) {
      case '/new_order':
        await this.handleNewOrder(message);
        return;
      case '/cart':
        await this.handleCart(message);
        return;
      case '/search':
        await this.handleSearch(message, command.args);
        return;
      case '/add':
        await this.handleAdd(message, command.args);
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

  private async handleSearch(message: TelegramMessage, args: string): Promise<void> {
    const query = args.trim();

    if (query.length === 0) {
      await this.telegramClient.sendMessage(
        message.chat.id,
        'Использование: /search <название товара>',
      );
      return;
    }

    const searchResult = await this.productSearchService.searchProducts({ query });
    const items = searchResult.items.slice(0, 5);

    this.lastSearchResultsByChat.set(message.chat.id, items);

    if (items.length === 0) {
      await this.telegramClient.sendMessage(
        message.chat.id,
        `По запросу "${query}" ничего не нашлось.`,
      );
      return;
    }

    const lines = items.map((item, index) => {
      const price = item.priceCurrent == null ? 'цена неизвестна' : `${item.priceCurrent} ₽`;
      return `${index + 1}. ${item.name} — ${price}`;
    });

    await this.telegramClient.sendMessage(
      message.chat.id,
      ['Результаты поиска:', ...lines, 'Добавить: /add <номер> [количество]'].join('\n'),
    );
  }

  private async handleAdd(message: TelegramMessage, args: string): Promise<void> {
    const [indexToken, quantityToken] = args.trim().split(/\s+/, 2);
    const resultIndex = Number(indexToken);
    const quantity =
      quantityToken == null || quantityToken.length === 0 ? 1 : Number(quantityToken);

    if (!Number.isInteger(resultIndex) || resultIndex <= 0) {
      await this.telegramClient.sendMessage(
        message.chat.id,
        'Использование: /add <номер из последнего поиска> [количество]',
      );
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      await this.telegramClient.sendMessage(
        message.chat.id,
        'Количество должно быть положительным числом.',
      );
      return;
    }

    const lastSearchResults = this.lastSearchResultsByChat.get(message.chat.id);

    if (lastSearchResults == null || lastSearchResults.length === 0) {
      await this.telegramClient.sendMessage(
        message.chat.id,
        'Сначала выполните поиск командой /search, затем добавляйте товар через /add.',
      );
      return;
    }

    const selectedItem = lastSearchResults[resultIndex - 1];

    if (selectedItem == null) {
      await this.telegramClient.sendMessage(
        message.chat.id,
        'В последнем поиске нет товара с таким номером.',
      );
      return;
    }

    const actor = toActor(message);
    const addItemInput =
      actor == null
        ? {
            chat: toChatRef(message),
            quantity,
            product: productSnapshotFromSearchResult(selectedItem),
          }
        : {
            chat: toChatRef(message),
            actor,
            quantity,
            product: productSnapshotFromSearchResult(selectedItem),
          };

    await this.orderService.addItem(addItemInput);

    await this.telegramClient.sendMessage(
      message.chat.id,
      `Добавил в корзину: ${selectedItem.name} x ${quantity}.`,
    );
  }
}

function parseTelegramCommand(
  text: string,
): { args: string; name: '/add' | '/cart' | '/new_order' | '/search' } | null {
  const match = text.trim().match(/^\/([a-z_]+)(?:@[a-z0-9_]+)?(?:\s+(.*))?$/i);

  if (match == null) {
    return null;
  }

  const command = `/${match[1]?.toLowerCase()}`;
  const args = match[2]?.trim() ?? '';

  if (
    command === '/new_order' ||
    command === '/cart' ||
    command === '/search' ||
    command === '/add'
  ) {
    return {
      name: command,
      args,
    };
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
