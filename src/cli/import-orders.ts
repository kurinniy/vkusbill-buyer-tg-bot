import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { PrismaImportStore } from '../db/repositories/index.js';
import { ImportService } from '../domain/imports/index.js';

const args = process.argv.slice(2);
const { filePath, options } = parseArgs(args);
const absolutePath = path.resolve(filePath);
const fileContent = await readFile(absolutePath, 'utf8');
const checksum = createHash('sha256').update(fileContent).digest('hex');

const service = new ImportService(new PrismaImportStore());
const result = await service.importCsv({
  checksum,
  text: fileContent,
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
      'Usage: npm run import:csv -- [--dry-run|--execute] [--skip-duplicates] [--fail-on-row-error] <path-to-csv>',
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
