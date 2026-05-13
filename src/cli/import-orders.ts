import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { PrismaImportStore } from '../db/repositories/index.js';
import { ImportService, parseImportXlsx } from '../domain/imports/index.js';
import type { ImportStore } from '../domain/imports/store.js';

class NoopImportStore implements ImportStore {
  public async findExistingDedupeKeys(): Promise<Set<string>> {
    return new Set();
  }

  public async persistExecutedImport(): Promise<void> {
    throw new Error('DATABASE_URL is required for executed imports.');
  }
}

function createImportStore(options: {
  execute: boolean;
  failOnRowError: boolean;
  skipDuplicates: boolean;
}): ImportStore {
  const { DATABASE_URL: databaseUrl = '' } = process.env;
  const hasDatabaseUrl = databaseUrl.trim().length > 0;

  if (options.execute) {
    if (!hasDatabaseUrl) {
      throw new Error('DATABASE_URL is required for --execute.');
    }

    return new PrismaImportStore();
  }

  if (hasDatabaseUrl) {
    return new PrismaImportStore();
  }

  return new NoopImportStore();
}

const args = process.argv.slice(2);
const { filePath, options } = parseArgs(args);
const absolutePath = path.resolve(filePath);
const fileContent = await readFile(absolutePath);
const checksum = createHash('sha256').update(fileContent).digest('hex');
const rows = parseImportXlsx(fileContent);

const service = new ImportService(createImportStore(options));
const result = await service.importXlsx({
  checksum,
  rows,
  options: {
    ...options,
    sourceFile: absolutePath,
  },
});

process.stdout.write(
  `${JSON.stringify(
    {
      mode: options.execute ? 'execute' : 'dry-run',
      sourceFile: absolutePath,
      checksum,
      report: result.report,
      rowResults: result.rowResults,
    },
    null,
    2,
  )}\n`,
);

if (result.report.errorRows > 0) {
  process.exitCode = 1;
}

function parseArgs(args: string[]): {
  filePath: string;
  options: {
    execute: boolean;
    failOnRowError: boolean;
    skipDuplicates: boolean;
  };
} {
  let execute = false;
  let dryRun = false;
  let failOnRowError = false;
  let skipDuplicates = false;
  let filePath: string | null = null;

  for (const arg of args) {
    switch (arg) {
      case '--execute':
        execute = true;
        continue;
      case '--dry-run':
        dryRun = true;
        continue;
      case '--fail-on-row-error':
        failOnRowError = true;
        continue;
      case '--skip-duplicates':
        skipDuplicates = true;
        continue;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown option: ${arg}`);
        }

        filePath = arg;
    }
  }

  if (filePath == null) {
    throw new Error(
      'Usage: npm run import:xlsx -- [--dry-run|--execute] [--skip-duplicates] [--fail-on-row-error] <path-to-xlsx>',
    );
  }

  if (execute && dryRun) {
    throw new Error('Use either --execute or --dry-run, not both.');
  }

  return {
    filePath,
    options: {
      execute,
      failOnRowError,
      skipDuplicates,
    },
  };
}
