import assert from 'node:assert/strict';
import test from 'node:test';

import { HistoryService } from './history-service.js';
import type { HistoryStore } from './store.js';
import type { HistoricalOrderView } from './types.js';

test('getRecentOrders returns recent history for telegram chat', async () => {
  const service = new HistoryService(new FakeHistoryStore());

  const history = await service.getRecentOrders(101, 3);

  assert.equal(history.length, 1);
  assert.equal(history[0]?.source, 'TELEGRAM');
  assert.equal(history[0]?.items[0]?.name, 'Бананы');
});

class FakeHistoryStore implements HistoryStore {
  public async getRecentByTelegramChatId(): Promise<HistoricalOrderView[]> {
    return [
      {
        id: 'history-1',
        source: 'TELEGRAM',
        shareBasketUrl: 'https://vkusvill.ru/?share_basket=test',
        itemCount: 1,
        finalizedAt: new Date('2026-05-13T10:00:00.000Z'),
        finalizedBy: 'tester',
        items: [
          {
            name: 'Бананы',
            quantity: 2,
          },
        ],
      },
    ];
  }
}
