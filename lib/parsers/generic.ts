import Papa from 'papaparse';
import { ParsedTransaction } from '@/lib/types';
import { parseFinnishAmount } from './utils';

export interface ColumnMapping {
  bankLabel: string;
  dateColumn: string;
  amountColumn: string;
  merchantColumn: string;
  noteColumn?: string | null;
  delimiter: ',' | ';' | '\t';
  amountFormat: 'finnish' | 'standard';
  dateFormat: string;
  amountSign: 'standard' | 'inverted';
  confidence: number;
}

function parseDate(str: string, format: string): Date {
  const s = str.trim();
  if (format.startsWith('YYYY')) {
    return new Date(s);
  }
  const sep = format.includes('.') ? '.' : format.includes('/') ? '/' : '-';
  const parts = s.split(sep);
  if (format.startsWith('DD') || format.startsWith('D')) {
    const [d, m, y] = parts;
    return new Date(`${y}-${(m ?? '').padStart(2, '0')}-${(d ?? '').padStart(2, '0')}`);
  }
  if (format.startsWith('MM')) {
    const [m, d, y] = parts;
    return new Date(`${y}-${(m ?? '').padStart(2, '0')}-${(d ?? '').padStart(2, '0')}`);
  }
  return new Date(s);
}

export async function parseGeneric(
  fileContent: string,
  mapping: ColumnMapping,
): Promise<ParsedTransaction[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(fileContent, {
      header: true,
      delimiter: mapping.delimiter,
      skipEmptyLines: true,
      complete: (results) => {
        const rows: ParsedTransaction[] = [];
        for (const r of results.data) {
          try {
            const dateStr = r[mapping.dateColumn];
            const amountStr = r[mapping.amountColumn];
            const merchantStr = r[mapping.merchantColumn];
            const noteStr = mapping.noteColumn ? r[mapping.noteColumn] : undefined;

            if (!dateStr || !amountStr) continue;

            const date = parseDate(dateStr, mapping.dateFormat);
            if (isNaN(date.getTime())) continue;

            const rawAmount =
              mapping.amountFormat === 'finnish'
                ? parseFinnishAmount(amountStr)
                : parseFloat(amountStr.trim().replace(/\s/g, '').replace(',', '.'));

            if (isNaN(rawAmount)) continue;

            // inverted: positive number = expense (like Amex)
            const amount =
              mapping.amountSign === 'inverted'
                ? rawAmount < 0
                  ? Math.abs(rawAmount)
                  : -rawAmount
                : rawAmount;

            rows.push({
              date,
              account: mapping.bankLabel,
              merchant: merchantStr?.trim() || 'Unknown',
              amount,
              note: noteStr?.trim() || '',
              type: amount > 0 ? 'Income' : 'Expense',
            });
          } catch {
            continue;
          }
        }
        resolve(rows);
      },
      error: (error: Error) => {
        reject(new Error(`Failed to parse CSV: ${error.message}`));
      },
    });
  });
}
