import assert from 'node:assert/strict';
import test from 'node:test';

import { ImportService } from './import-service.js';
import type { ImportStore } from './store.js';
import type { ParsedImportXlsxRow } from './xlsx.js';

test('ImportService dry-run groups xlsx rows into monthly historical orders', async () => {
  const store = new FakeImportStore();
  const service = new ImportService(store);

  const result = await service.importXlsx({
    checksum: 'abc',
    options: {
      execute: false,
      failOnRowError: false,
      skipDuplicates: false,
      sourceFile: '/tmp/vkusvill.xlsx',
    },
    rows: [
      createRow(2, 2026, 'Архив', 'Бананы', 2, 168, 2),
      createRow(2, 2026, 'Архив', 'Сыр Серанто', 1, 359, 3),
      createRow(2, 2026, 'Архив', 'ВСЕГО:', Number.NaN, 527, 4),
      createRow(3, 2026, 'Сыры', 'Маасдам', 1, 340, 5),
    ],
  });

  assert.equal(result.report.totalRows, 4);
  assert.equal(result.report.validRows, 3);
  assert.equal(result.report.importedRows, 3);
  assert.equal(result.report.skippedRows, 1);
  assert.equal(result.report.ordersImported, 2);
  assert.equal(result.orders[0]?.dedupeKey, 'xlsx:2026-02');
  assert.equal(result.orders[1]?.dedupeKey, 'xlsx:2026-03');
});

test('ImportService skips duplicate periods when skipDuplicates is enabled', async () => {
  const store = new FakeImportStore(new Set(['xlsx:2026-02']));
  const service = new ImportService(store);

  const result = await service.importXlsx({
    checksum: 'abc',
    options: {
      execute: false,
      failOnRowError: false,
      skipDuplicates: true,
      sourceFile: '/tmp/vkusvill.xlsx',
    },
    rows: [createRow(2, 2026, 'Архив', 'Бананы', 2, 168, 2)],
  });

  assert.equal(result.report.importedRows, 0);
  assert.equal(result.report.skippedRows, 1);
  assert.equal(result.report.ordersSkipped, 1);
});

test('ImportService does not persist execute run in strict mode when there are row errors', async () => {
  const store = new FakeImportStore();
  const service = new ImportService(store);

  const result = await service.importXlsx({
    checksum: 'abc',
    options: {
      execute: true,
      failOnRowError: true,
      skipDuplicates: false,
      sourceFile: '/tmp/vkusvill.xlsx',
    },
    rows: [createRow(13, 2026, 'Архив', 'Бананы', 2, 168, 2)],
  });

  assert.equal(result.report.errorRows, 1);
  assert.equal(store.persistedRuns.length, 0);
});

test('ImportService persists execute run when execute mode is enabled', async () => {
  const store = new FakeImportStore();
  const service = new ImportService(store);

  await service.importXlsx({
    checksum: 'abc',
    options: {
      execute: true,
      failOnRowError: false,
      skipDuplicates: false,
      sourceFile: '/tmp/vkusvill.xlsx',
    },
    rows: [createRow(2, 2026, 'Архив', 'Бананы', 2, 168, 2)],
  });

  assert.equal(store.persistedRuns.length, 1);
  assert.equal(store.persistedRuns[0]?.orders.length, 1);
  assert.equal(store.persistedRuns[0]?.orders[0]?.dedupeKey, 'xlsx:2026-02');
});

function createRow(
  month: number,
  year: number,
  category: string,
  itemName: string,
  quantity: number,
  lineAmount: number,
  rowNumber: number,
): ParsedImportXlsxRow {
  return {
    rowNumber,
    month,
    year,
    category,
    itemName,
    quantity,
    lineAmount,
    raw: {
      month: String(month),
      year: String(year),
      category,
      item_name: itemName,
      quantity: Number.isNaN(quantity) ? '' : String(quantity),
      line_amount: String(lineAmount),
      percent: '',
      _row_number: String(rowNumber),
    },
  };
}

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
