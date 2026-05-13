import {
  HistoricalOrderSource,
  ImportJobRowStatus,
  ImportJobStatus,
  Prisma,
  type PrismaClient,
} from '@prisma/client';

import type { ImportStore } from '../../domain/imports/store.js';
import type { ImportOrder, ImportReport, ImportRowResult } from '../../domain/imports/types.js';
import { prisma } from '../client.js';

type DbClient = PrismaClient | Prisma.TransactionClient;

export class PrismaImportStore implements ImportStore {
  public constructor(private readonly client: DbClient = prisma) {}

  public async findExistingDedupeKeys(dedupeKeys: string[]): Promise<Set<string>> {
    if (dedupeKeys.length === 0) {
      return new Set();
    }

    const orders = await this.client.historicalOrder.findMany({
      where: {
        dedupeKey: {
          in: dedupeKeys,
        },
      },
      select: {
        dedupeKey: true,
      },
    });

    return new Set(orders.map((order) => order.dedupeKey));
  }

  public async persistExecutedImport(params: {
    checksum: string;
    orders: ImportOrder[];
    report: ImportReport;
    rowResults: ImportRowResult[];
    sourceFile: string;
  }): Promise<void> {
    await this.runInTransaction(async (tx) => {
      const now = new Date();
      const importJob = await tx.importJob.create({
        data: {
          status: ImportJobStatus.RUNNING,
          sourceFile: params.sourceFile,
          checksum: params.checksum,
          totalRows: params.report.totalRows,
          validRows: params.report.validRows,
          importedRows: params.report.importedRows,
          skippedRows: params.report.skippedRows,
          errorRows: params.report.errorRows,
          startedAt: now,
        },
      });

      if (params.rowResults.length > 0) {
        await tx.importJobRow.createMany({
          data: params.rowResults.map((row) => ({
            importJobId: importJob.id,
            rowNumber: row.rowNumber,
            status: mapImportJobRowStatus(row.status),
            dedupeKey: row.dedupeKey,
            errorCode: row.errorCode,
            errorMessage: row.errorMessage,
            payload: row.payload,
          })),
        });
      }

      for (const order of params.orders) {
        const historicalOrder = await tx.historicalOrder.create({
          data: {
            source: HistoricalOrderSource.CSV_IMPORT,
            dedupeKey: order.dedupeKey,
            importJobId: importJob.id,
            shareBasketUrl: order.shareBasketUrl,
            itemCount: order.items.length,
            finalizedAt: order.finalizedAt,
          },
        });

        for (const item of order.items) {
          const snapshot = await tx.productSnapshot.create({
            data: {
              name: item.name,
              xmlId: item.xmlId,
              priceCurrent:
                item.priceCurrent == null ? null : new Prisma.Decimal(item.priceCurrent),
              currency: item.priceCurrent == null ? null : 'RUB',
              payload: item.payload,
            },
          });

          await tx.historicalOrderItem.create({
            data: {
              historicalOrderId: historicalOrder.id,
              productSnapshotId: snapshot.id,
              quantity: new Prisma.Decimal(item.quantity),
            },
          });
        }
      }

      await tx.importJob.update({
        where: {
          id: importJob.id,
        },
        data: {
          status: resolveImportJobStatus(params.report),
          finishedAt: new Date(),
        },
      });
    });
  }

  private async runInTransaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if ('$transaction' in this.client) {
      return this.client.$transaction(async (tx) => callback(tx));
    }

    return callback(this.client);
  }
}

function mapImportJobRowStatus(status: ImportRowResult['status']): ImportJobRowStatus {
  switch (status) {
    case 'IMPORTED':
      return ImportJobRowStatus.IMPORTED;
    case 'SKIPPED':
      return ImportJobRowStatus.SKIPPED;
    case 'FAILED':
      return ImportJobRowStatus.FAILED;
  }
}

function resolveImportJobStatus(report: ImportReport): ImportJobStatus {
  if (report.errorRows === 0) {
    return ImportJobStatus.COMPLETED;
  }

  if (report.importedRows > 0 || report.skippedRows > 0) {
    return ImportJobStatus.PARTIAL_FAILED;
  }

  return ImportJobStatus.FAILED;
}
