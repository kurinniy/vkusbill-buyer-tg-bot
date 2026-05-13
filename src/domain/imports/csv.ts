export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvMatrix(text).filter((row) => row.some((cell) => cell.trim().length > 0));

  if (rows.length === 0) {
    return [];
  }

  const [header, ...dataRows] = rows;

  if (header == null) {
    return [];
  }

  return dataRows.map((row) => {
    const record: Record<string, string> = {};

    for (const [index, column] of header.entries()) {
      if (column.length === 0) {
        continue;
      }

      record[column] = row[index] ?? '';
    }

    return record;
  });
}

function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (character === ',' && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1;
      }

      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += character;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}
