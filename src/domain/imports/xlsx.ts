import * as XLSX from 'xlsx';

import type { ImportRowPayload } from './types.js';

const REQUIRED_HEADERS = [
  'Месяц',
  'Год',
  'Категория',
  'Наименование товара',
  'Кол-во',
  'Сумма',
] as const;

export interface ParsedImportXlsxRow {
  category: string;
  itemName: string;
  lineAmount: number;
  month: number;
  quantity: number;
  raw: ImportRowPayload;
  rowNumber: number;
  year: number;
}

export function parseImportXlsx(buffer: Buffer): ParsedImportXlsxRow[] {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
  });
  const firstSheetName = workbook.SheetNames[0];

  if (firstSheetName == null) {
    return [];
  }

  const worksheet = workbook.Sheets[firstSheetName];

  if (worksheet == null) {
    return [];
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as string[][];

  if (rows.length === 0) {
    return [];
  }

  const [headerRow, ...dataRows] = rows;

  if (headerRow == null) {
    return [];
  }

  const headerMap = new Map<string, number>();

  for (const [index, value] of headerRow.entries()) {
    headerMap.set(String(value).trim(), index);
  }

  for (const header of REQUIRED_HEADERS) {
    if (!headerMap.has(header)) {
      throw new Error(`XLSX must contain column "${header}".`);
    }
  }

  return dataRows
    .filter((row) => row.some((value) => String(value).trim().length > 0))
    .map((row, index) => {
      const rowNumber = index + 2;
      const month = Number(readCell(row, headerMap, 'Месяц'));
      const year = Number(readCell(row, headerMap, 'Год'));
      const category = readCell(row, headerMap, 'Категория').trim();
      const itemName = readCell(row, headerMap, 'Наименование товара').trim();
      const quantity = Number(readCell(row, headerMap, 'Кол-во'));
      const lineAmount = Number(readCell(row, headerMap, 'Сумма'));

      return {
        rowNumber,
        month,
        year,
        category,
        itemName,
        quantity,
        lineAmount,
        raw: {
          month: readCell(row, headerMap, 'Месяц'),
          year: readCell(row, headerMap, 'Год'),
          category,
          item_name: itemName,
          quantity: readCell(row, headerMap, 'Кол-во'),
          line_amount: readCell(row, headerMap, 'Сумма'),
          percent: readOptionalCell(row, headerMap, 'Процент'),
          _row_number: String(rowNumber),
        },
      };
    });
}

function readCell(
  row: string[],
  headerMap: Map<string, number>,
  header: (typeof REQUIRED_HEADERS)[number],
): string {
  const columnIndex = headerMap.get(header);

  if (columnIndex == null) {
    return '';
  }

  return String(row[columnIndex] ?? '');
}

function readOptionalCell(row: string[], headerMap: Map<string, number>, header: string): string {
  const columnIndex = headerMap.get(header);

  if (columnIndex == null) {
    return '';
  }

  return String(row[columnIndex] ?? '');
}
