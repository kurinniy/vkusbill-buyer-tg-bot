import type { ImportOrder, ImportReport, ImportRowResult } from './types.js';

export interface ImportStore {
  findExistingDedupeKeys(dedupeKeys: string[]): Promise<Set<string>>;
  persistExecutedImport(params: {
    checksum: string;
    orders: ImportOrder[];
    report: ImportReport;
    rowResults: ImportRowResult[];
    sourceFile: string;
  }): Promise<void>;
}
