import type { HistoricalOrderView } from './types.js';

export interface HistoryStore {
  getRecentByTelegramChatId(telegramChatId: number, limit: number): Promise<HistoricalOrderView[]>;
}
