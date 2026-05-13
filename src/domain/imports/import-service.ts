import { parseCsv } from './csv.js';
import type { ImportStore } from './store.js';
import type {
  ImportCsvRow,
  ImportOptions,
  ImportOrder,
  ImportReport,
  ImportResult,
  ImportRowResult,
} from './types.js';

const CSV_COLUMNS = [
  'dedupe_key',
  'finalized_at',
  'share_basket_url',
  'item_name',
  'quantity',
  'item_xml_id',
  'item_price',
] as const;

type CsvColumn = (typeof CSV_COLUMNS)[number];
type CsvRecord = Record<CsvColumn, string> & Record<string, string>;

export class ImportService {
  public constructor(private readonly store: ImportStore) {}

  public async importCsv(params: {
    checksum: string;
    options: ImportOptions;
    text: string;
  }): Promise<ImportResult> {
    const csvRecords = parseCsv(params.text);
    const rowResults: ImportRowResult[] = [];
    const validRows: ImportCsvRow[] = [];
    let validRowCount = 0;

    for (const [index, record] of csvRecords.entries()) {
      const rowNumber = index + 2;
      const validation = validateCsvRecord(record, rowNumber);
      const csvRecord = record as Partial<CsvRecord>;

      if (!validation.ok) {
        rowResults.push({
          rowNumber,
          status: 'FAILED',
          dedupeKey: csvRecord.dedupe_key?.trim() || null,
          errorCode: validation.errorCode,
          errorMessage: validation.errorMessage,
          payload: record,
        });
        continue;
      }

      validRows.push(validation.row);
      validRowCount += 1;
    }

    const grouped = groupRowsByDedupeKey(validRows);
    const preparedOrders: ImportOrder[] = [];

    for (const group of grouped) {
      const firstRow = group.rows[0];

      if (firstRow == null) {
        continue;
      }

      if (!group.isConsistent) {
        for (const row of group.rows) {
          rowResults.push({
            rowNumber: row.rowNumber,
            status: 'FAILED',
            dedupeKey: row.dedupeKey,
            errorCode: 'INCONSISTENT_GROUP',
            errorMessage:
              'Rows with the same dedupe_key must have identical finalized_at and share_basket_url.',
            payload: row.raw,
          });
        }
        continue;
      }

      preparedOrders.push({
        dedupeKey: group.dedupeKey,
        finalizedAt: firstRow.finalizedAt,
        shareBasketUrl: firstRow.shareBasketUrl,
        items: group.rows.map((row) => ({
          name: row.itemName,
          quantity: row.quantity,
          xmlId: row.itemXmlId,
          priceCurrent: row.itemPrice,
          payload: row.raw,
        })),
      });
    }

    const existingDedupeKeys = await this.store.findExistingDedupeKeys(
      preparedOrders.map((order) => order.dedupeKey),
    );

    const ordersToImport: ImportOrder[] = [];

    for (const order of preparedOrders) {
      const duplicate = existingDedupeKeys.has(order.dedupeKey);

      if (duplicate && params.options.skipDuplicates) {
        for (const row of order.items) {
          rowResults.push({
            rowNumber: Number(row.payload._row_number),
            status: 'SKIPPED',
            dedupeKey: order.dedupeKey,
            errorCode: null,
            errorMessage: null,
            payload: row.payload,
          });
        }
        continue;
      }

      if (duplicate) {
        for (const row of order.items) {
          rowResults.push({
            rowNumber: Number(row.payload._row_number),
            status: 'FAILED',
            dedupeKey: order.dedupeKey,
            errorCode: 'DUPLICATE_ORDER',
            errorMessage: `Historical order with dedupe_key "${order.dedupeKey}" already exists.`,
            payload: row.payload,
          });
        }
        continue;
      }

      ordersToImport.push(order);

      for (const row of order.items) {
        rowResults.push({
          rowNumber: Number(row.payload._row_number),
          status: 'IMPORTED',
          dedupeKey: order.dedupeKey,
          errorCode: null,
          errorMessage: null,
          payload: row.payload,
        });
      }
    }

    const report = buildReport(csvRecords.length, validRowCount, rowResults, ordersToImport);

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

function validateCsvRecord(
  record: Record<string, string>,
  rowNumber: number,
):
  | {
      ok: true;
      row: ImportCsvRow;
    }
  | {
      errorCode: string;
      errorMessage: string;
      ok: false;
    } {
  for (const column of CSV_COLUMNS) {
    if (!(column in record)) {
      return {
        ok: false,
        errorCode: 'MISSING_COLUMN',
        errorMessage: `CSV must contain column "${column}".`,
      };
    }
  }

  const csvRecord = record as CsvRecord;
  const dedupeKey = csvRecord.dedupe_key?.trim();

  if (dedupeKey == null || dedupeKey.length === 0) {
    return {
      ok: false,
      errorCode: 'INVALID_DEDUPE_KEY',
      errorMessage: 'dedupe_key is required.',
    };
  }

  const finalizedAtValue = csvRecord.finalized_at?.trim();
  const finalizedAt = finalizedAtValue == null ? new Date('') : new Date(finalizedAtValue);

  if (Number.isNaN(finalizedAt.getTime())) {
    return {
      ok: false,
      errorCode: 'INVALID_FINALIZED_AT',
      errorMessage: 'finalized_at must be a valid ISO date.',
    };
  }

  const itemName = csvRecord.item_name?.trim();

  if (itemName == null || itemName.length === 0) {
    return {
      ok: false,
      errorCode: 'INVALID_ITEM_NAME',
      errorMessage: 'item_name is required.',
    };
  }

  const quantity = Number(csvRecord.quantity);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return {
      ok: false,
      errorCode: 'INVALID_QUANTITY',
      errorMessage: 'quantity must be a positive number.',
    };
  }

  const itemXmlId = parseOptionalInt(csvRecord.item_xml_id);

  if (csvRecord.item_xml_id?.trim().length && itemXmlId == null) {
    return {
      ok: false,
      errorCode: 'INVALID_ITEM_XML_ID',
      errorMessage: 'item_xml_id must be a positive integer.',
    };
  }

  const itemPrice = parseOptionalNumber(csvRecord.item_price);

  if (csvRecord.item_price?.trim().length && itemPrice == null) {
    return {
      ok: false,
      errorCode: 'INVALID_ITEM_PRICE',
      errorMessage: 'item_price must be a non-negative number.',
    };
  }

  if (itemPrice != null && itemPrice < 0) {
    return {
      ok: false,
      errorCode: 'INVALID_ITEM_PRICE',
      errorMessage: 'item_price must be a non-negative number.',
    };
  }

  const shareBasketUrl = normalizeOptionalString(csvRecord.share_basket_url);

  return {
    ok: true,
    row: {
      rowNumber,
      dedupeKey,
      finalizedAt,
      shareBasketUrl,
      itemName,
      quantity,
      itemXmlId,
      itemPrice,
      raw: {
        ...csvRecord,
        _row_number: String(rowNumber),
      },
    },
  };
}

function groupRowsByDedupeKey(rows: ImportCsvRow[]): Array<{
  dedupeKey: string;
  isConsistent: boolean;
  rows: ImportCsvRow[];
}> {
  const groups = new Map<string, ImportCsvRow[]>();

  for (const row of rows) {
    const items = groups.get(row.dedupeKey);

    if (items == null) {
      groups.set(row.dedupeKey, [row]);
      continue;
    }

    items.push(row);
  }

  return [...groups.entries()].map(([dedupeKey, items]) => {
    const first = items[0];

    if (first == null) {
      return {
        dedupeKey,
        rows: [],
        isConsistent: true,
      };
    }

    const isConsistent = items.every(
      (item) =>
        item.finalizedAt.toISOString() === first.finalizedAt.toISOString() &&
        item.shareBasketUrl === first.shareBasketUrl,
    );

    return {
      dedupeKey,
      rows: items,
      isConsistent,
    };
  });
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
      rowResults.filter((row) => row.status === 'SKIPPED').map((row) => row.dedupeKey),
    ).size,
  };
}

function parseOptionalInt(value: string | undefined): number | null {
  if (value == null || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseOptionalNumber(value: string | undefined): number | null {
  if (value == null || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function normalizeOptionalString(value: string | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? null : trimmed;
}

function sortRowResults(rowResults: ImportRowResult[]): ImportRowResult[] {
  return [...rowResults].sort((left, right) => left.rowNumber - right.rowNumber);
}
