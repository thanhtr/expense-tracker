import Papa from 'papaparse';
import { parseFinnishAmount, findColumn } from './utils';
import { ParsedTransaction } from '@/lib/types';

export async function parseAmex(fileContent: string): Promise<ParsedTransaction[]> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(fileContent, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows: ParsedTransaction[] = [];

        if (results.data.length === 0) {
          resolve(rows);
          return;
        }

        for (const r of results.data) {
          try {
            const dateStr = findColumn(r, ['Päivämäärä', 'Date', 'Transaction Date']);
            const merchantStr = findColumn(r, ['Kuvaus', 'Description', 'Merchant']);
            const amountStr = findColumn(r, ['Summa', 'Amount']);

            if (!dateStr || !amountStr) {
              continue;
            }

            const date = new Date(dateStr.trim());
            const merchant = (merchantStr?.trim()) || 'Unknown';
            const amount = parseFinnishAmount(amountStr);

            if (isNaN(date.getTime())) {
              continue;
            }

            rows.push({
              date,
              account: 'Amex',
              merchant,
              // CSV: positive = expense (invert), negative = income (take absolute)
              amount: amount < 0 ? Math.abs(amount) : -amount,
              note: '',
              type: amount < 0 ? 'Income' : 'Expense',
            });
          } catch {
            continue;
          }
        }

        resolve(rows);
      },
      error: (error: Error) => {
        console.error('❌ Amex CSV parsing error:', error);
        resolve([]);
      }
    });
  });
}
