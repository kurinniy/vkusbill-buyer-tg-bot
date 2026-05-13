export type ImportRowPayload = Record<string, string> & {
  _row_number: string;
};

export interface ImportOrderItem {
  name: string;
  payload: ImportRowPayload;
  priceCurrent: number | null;
  quantity: number;
  xmlId: number | null;
}

export interface ImportOrder {
  dedupeKey: string;
  finalizedAt: Date;
  items: ImportOrderItem[];
  shareBasketUrl: string | null;
}

export interface ImportRowResult {
  dedupeKey: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  payload: Record<string, string>;
  rowNumber: number;
  status: 'FAILED' | 'IMPORTED' | 'SKIPPED';
}

export interface ImportReport {
  errorRows: number;
  importedRows: number;
  ordersImported: number;
  ordersSkipped: number;
  skippedRows: number;
  totalRows: number;
  validRows: number;
}

export interface ImportOptions {
  execute: boolean;
  failOnRowError: boolean;
  skipDuplicates: boolean;
  sourceFile: string;
}

export interface ImportResult {
  orders: ImportOrder[];
  report: ImportReport;
  rowResults: ImportRowResult[];
}
