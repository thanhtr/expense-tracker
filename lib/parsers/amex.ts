import Papa from 'papaparse';
import { parseFinnishAmount } from './utils';
import { ParsedTransaction } from '@/lib/types';

function findColumn(row: Record<string, string>, names: string[]): string | undefined {
  const lowerNames = names.map(n => n.toLowerCase());
  for (const [key, value] of Object.entries(row)) {
    if (lowerNames.includes(key.toLowerCase())) {
      return value;
    }
  }
  return undefined;
}

export async function parseAmex(fileContent: string): Promise<ParsedTransaction[]> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(fileContent, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows: ParsedTransaction[] = [];

        if (results.data.length === 0) {
          console.log('🔍 Amex parser: No rows found');
          resolve(rows);
          return;
        }

        const firstRow = results.data[0];
        console.log(`🔍 Amex parser: Found ${results.data.length} rows`);
        console.log(`   Columns: ${firstRow ? Object.keys(firstRow).join(', ') : '(none)'}`);

        for (const r of results.data) {
          try {
            const dateStr = findColumn(r, ['Päivämäärä', 'Date', 'Transaction Date']);
            const merchantStr = findColumn(r, ['Kuvaus', 'Description', 'Merchant']);
            const amountStr = findColumn(r, ['Summa', 'Amount']);

            if (!dateStr || !amountStr) {
              console.log(`   ⚠️ Skipping row: missing date or amount`);
              continue;
            }

            const date = new Date(dateStr.trim());
            const merchant = (merchantStr?.trim()) || 'Unknown';
            const amount = parseFinnishAmount(amountStr);

            if (isNaN(date.getTime())) {
              console.log(`   ⚠️ Invalid date: ${dateStr}`);
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
          } catch (error) {
            console.log(`   ⚠️ Parse error: ${error instanceof Error ? error.message : String(error)}`);
            continue;
          }
        }

        console.log(`   ✓ Parsed ${rows.length} valid transactions`);
        resolve(rows);
      },
      error: (error: Error) => {
        console.error('❌ Amex CSV parsing error:', error);
        resolve([]);
      }
    });
  });
}
