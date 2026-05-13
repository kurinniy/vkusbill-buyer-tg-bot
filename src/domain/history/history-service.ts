import type { HistoryStore } from './store.js';
import type { HistoricalOrderView } from './types.js';

export class HistoryService {
  public constructor(private readonly historyStore: HistoryStore) {}

  public async getRecentOrders(telegramChatId: number, limit = 5): Promise<HistoricalOrderView[]> {
    return this.historyStore.getRecentByTelegramChatId(telegramChatId, limit);
  }
}
