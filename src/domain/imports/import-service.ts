import type { ImportStore } from './store.js';
import type {
  ImportOptions,
  ImportOrder,
  ImportReport,
  ImportResult,
  ImportRowResult,
} from './types.js';
import type { ParsedImportXlsxRow } from './xlsx.js';

export class ImportService {
  public constructor(private readonly store: ImportStore) {}

  public async importXlsx(params: {
    checksum: string;
    options: ImportOptions;
    rows: ParsedImportXlsxRow[];
  }): Promise<ImportResult> {
    const rowResults: ImportRowResult[] = [];
    const validRows: ParsedImportXlsxRow[] = [];

    for (const row of params.rows) {
      if (isTotalRow(row)) {
        rowResults.push({
          rowNumber: row.rowNumber,
          status: 'SKIPPED',
          dedupeKey: null,
          errorCode: null,
          errorMessage: null,
          payload: row.raw,
        });
        continue;
      }

      const validation = validateXlsxRow(row);

      if (validation != null) {
        rowResults.push({
          rowNumber: row.rowNumber,
          status: 'FAILED',
          dedupeKey: null,
          errorCode: validation.errorCode,
          errorMessage: validation.errorMessage,
          payload: row.raw,
        });
        continue;
      }

      validRows.push(row);
    }

    const preparedOrders = groupRowsByPeriod(validRows);
    const existingDedupeKeys = await this.store.findExistingDedupeKeys(
      preparedOrders.map((order) => order.dedupeKey),
    );
    const ordersToImport: ImportOrder[] = [];

    for (const order of preparedOrders) {
      const duplicate = existingDedupeKeys.has(order.dedupeKey);

      if (duplicate && params.options.skipDuplicates) {
        pushOrderRows(rowResults, order, 'SKIPPED');
        continue;
      }

      if (duplicate) {
        pushOrderRows(rowResults, order, 'FAILED', 'DUPLICATE_ORDER', {
          message: `Historical order with dedupe_key "${order.dedupeKey}" already exists.`,
        });
        continue;
      }

      ordersToImport.push(order);
      pushOrderRows(rowResults, order, 'IMPORTED');
    }

    const report = buildReport(params.rows.length, validRows.length, rowResults, ordersToImport);

    if (params.options.failOnRowError && report.errorRows > 0) {
      return {
        orders: ordersToImport,
        report,
        rowResults: sortRowResults(rowResults),
      };
    }

    if (params.options.execute) {
      await this.store.persistExecutedImport({
        sourceFile: params.options.sourceFile,
        checksum: params.checksum,
        orders: ordersToImport,
        rowResults: sortRowResults(rowResults),
        report,
      });
    }

    return {
      orders: ordersToImport,
      report,
      rowResults: sortRowResults(rowResults),
    };
  }
}

function isTotalRow(row: ParsedImportXlsxRow): boolean {
  return row.itemName.trim().toUpperCase() === 'ВСЕГО:';
}

function validateXlsxRow(row: ParsedImportXlsxRow): {
  errorCode: string;
  errorMessage: string;
} | null {
  if (!Number.isInteger(row.month) || row.month < 1 || row.month > 12) {
    return {
      errorCode: 'INVALID_MONTH',
      errorMessage: 'Month must be an integer from 1 to 12.',
    };
  }

  if (!Number.isInteger(row.year) || row.year < 2000 || row.year > 2100) {
    return {
      errorCode: 'INVALID_YEAR',
      errorMessage: 'Year must be an integer between 2000 and 2100.',
    };
  }

  if (row.itemName.trim().length === 0) {
    return {
      errorCode: 'INVALID_ITEM_NAME',
      errorMessage: 'Item name is required.',
    };
  }

  if (!Number.isFinite(row.quantity) || row.quantity <= 0) {
    return {
      errorCode: 'INVALID_QUANTITY',
      errorMessage: 'Quantity must be a positive number.',
    };
  }

  if (!Number.isFinite(row.lineAmount) || row.lineAmount < 0) {
    return {
      errorCode: 'INVALID_LINE_AMOUNT',
      errorMessage: 'Line amount must be a non-negative number.',
    };
  }

  return null;
}

function groupRowsByPeriod(rows: ParsedImportXlsxRow[]): ImportOrder[] {
  const groups = new Map<string, ParsedImportXlsxRow[]>();

  for (const row of rows) {
    const dedupeKey = toDedupeKey(row.year, row.month);
    const items = groups.get(dedupeKey);

    if (items == null) {
      groups.set(dedupeKey, [row]);
      continue;
    }

    items.push(row);
  }

  return [...groups.entries()].map(([dedupeKey, items]) => {
    const first = items[0];

    if (first == null) {
      throw new Error(`Grouped XLSX import rows for "${dedupeKey}" are empty.`);
    }

    return {
      dedupeKey,
      finalizedAt: toPeriodDate(first.year, first.month),
      shareBasketUrl: null,
      items: items.map((row) => ({
        name: row.itemName,
        quantity: row.quantity,
        xmlId: null,
        priceCurrent: null,
        payload: row.raw,
      })),
    };
  });
}

function toDedupeKey(year: number, month: number): string {
  return `xlsx:${String(year)}-${String(month).padStart(2, '0')}`;
}

function toPeriodDate(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0, 12, 0, 0));
}

function pushOrderRows(
  rowResults: ImportRowResult[],
  order: ImportOrder,
  status: ImportRowResult['status'],
  errorCode: string | null = null,
  error?: { message: string },
): void {
  for (const row of order.items) {
    rowResults.push({
      rowNumber: Number(row.payload._row_number),
      status,
      dedupeKey: order.dedupeKey,
      errorCode,
      errorMessage: error?.message ?? null,
      payload: row.payload,
    });
  }
}

function buildReport(
  totalRows: number,
  validRows: number,
  rowResults: ImportRowResult[],
  importedOrders: ImportOrder[],
): ImportReport {
  return {
    totalRows,
    validRows,
    importedRows: rowResults.filter((row) => row.status === 'IMPORTED').length,
    skippedRows: rowResults.filter((row) => row.status === 'SKIPPED').length,
    errorRows: rowResults.filter((row) => row.status === 'FAILED').length,
    ordersImported: importedOrders.length,
    ordersSkipped: new Set(
      rowResults
        .filter((row) => row.status === 'SKIPPED' && row.dedupeKey != null)
        .map((row) => row.dedupeKey),
    ).size,
  };
}

function sortRowResults(rowResults: ImportRowResult[]): ImportRowResult[] {
  return [...rowResults].sort((left, right) => left.rowNumber - right.rowNumber);
}
