import assert from 'node:assert/strict';
import test from 'node:test';

import { ImportService } from './import-service.js';
import type { ImportStore } from './store.js';

test('ImportService dry-run groups rows into historical orders', async () => {
  const store = new FakeImportStore();
  const service = new ImportService(store);

  const result = await service.importCsv({
    checksum: 'abc',
    options: {
      execute: false,
      failOnRowError: false,
      skipDuplicates: false,
      sourceFile: '/tmp/orders.csv',
    },
    text: [
      'dedupe_key,finalized_at,share_basket_url,item_name,quantity,item_xml_id,item_price',
      'order-1,2026-05-13T10:00:00.000Z,https://vkusvill.ru/?share_basket=1,Бананы,2,731,168',
      'order-1,2026-05-13T10:00:00.000Z,https://vkusvill.ru/?share_basket=1,Сыр Серанто,1,991,359',
    ].join('\n'),
  });

  assert.equal(result.report.totalRows, 2);
  assert.equal(result.report.validRows, 2);
  assert.equal(result.report.importedRows, 2);
  assert.equal(result.report.ordersImported, 1);
  assert.equal(result.orders[0]?.items.length, 2);
});

test('ImportService skips duplicate orders when skipDuplicates is enabled', async () => {
  const store = new FakeImportStore(new Set(['order-1']));
  const service = new ImportService(store);

  const result = await service.importCsv({
    checksum: 'abc',
    options: {
      execute: false,
      failOnRowError: false,
      skipDuplicates: true,
      sourceFile: '/tmp/orders.csv',
    },
    text: [
      'dedupe_key,finalized_at,share_basket_url,item_name,quantity,item_xml_id,item_price',
      'order-1,2026-05-13T10:00:00.000Z,,Бананы,2,731,168',
    ].join('\n'),
  });

  assert.equal(result.report.importedRows, 0);
  assert.equal(result.report.skippedRows, 1);
  assert.equal(result.report.ordersSkipped, 1);
});

test('ImportService does not persist execute run in strict mode when there are row errors', async () => {
  const store = new FakeImportStore();
  const service = new ImportService(store);

  const result = await service.importCsv({
    checksum: 'abc',
    options: {
      execute: true,
      failOnRowError: true,
      skipDuplicates: false,
      sourceFile: '/tmp/orders.csv',
    },
    text: [
      'dedupe_key,finalized_at,share_basket_url,item_name,quantity,item_xml_id,item_price',
      'order-1,invalid-date,,Бананы,2,731,168',
    ].join('\n'),
  });

  assert.equal(result.report.errorRows, 1);
  assert.equal(store.persistedRuns.length, 0);
});

test('ImportService persists execute run when execute mode is enabled', async () => {
  const store = new FakeImportStore();
  const service = new ImportService(store);

  await service.importCsv({
    checksum: 'abc',
    options: {
      execute: true,
      failOnRowError: false,
      skipDuplicates: false,
      sourceFile: '/tmp/orders.csv',
    },
    text: [
      'dedupe_key,finalized_at,share_basket_url,item_name,quantity,item_xml_id,item_price',
      'order-1,2026-05-13T10:00:00.000Z,,Бананы,2,731,168',
    ].join('\n'),
  });

  assert.equal(store.persistedRuns.length, 1);
  assert.equal(store.persistedRuns[0]?.orders.length, 1);
});

class FakeImportStore implements ImportStore {
  public persistedRuns: Array<{
    checksum: string;
    orders: { dedupeKey: string }[];
  }> = [];

  public constructor(private readonly existingKeys = new Set<string>()) {}

  public async findExistingDedupeKeys(): Promise<Set<string>> {
    return new Set(this.existingKeys);
  }

  public async persistExecutedImport(params: {
    checksum: string;
    orders: { dedupeKey: string }[];
  }): Promise<void> {
    this.persistedRuns.push(params);
  }
}
