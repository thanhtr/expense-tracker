import Papa from 'papaparse';
import { ParsedTransaction } from '@/lib/types';
import { parseFinnishAmount } from './utils';

function findColumn(row: Record<string, string>, names: string[]): string | undefined {
  const lowerNames = names.map(n => n.toLowerCase());
  for (const [key, value] of Object.entries(row)) {
    if (lowerNames.includes(key.toLowerCase())) {
      return value;
    }
  }
  return undefined;
}

export async function parseFinnair(fileContent: string): Promise<ParsedTransaction[]> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(fileContent, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows: ParsedTransaction[] = [];

        if (results.data.length === 0) {
          console.log('🔍 Finnair parser: No rows found');
          resolve(rows);
          return;
        }

        const firstRow = results.data[0];
        console.log(`🔍 Finnair parser: Found ${results.data.length} rows`);
        console.log(`   Columns: ${Object.keys(firstRow).join(', ')}`);

        for (const r of results.data) {
          try {
            const dateStr = findColumn(r, ['Date of payment', 'Payment Date', 'Päivämäärä']);
            const merchantStr = findColumn(r, ['Location of purchase', 'Merchant', 'Kuvaus']);
            const amountStr = findColumn(r, ['Amount', 'Summa']);

            if (!dateStr || !amountStr) {
              console.log(`   ⚠️ Skipping row: missing date or amount`);
              continue;
            }

            const date = new Date(dateStr.trim());
            const merchant = (merchantStr?.trim()) || 'Unknown';
            const amount = parseFinnishAmount(amountStr.trim());

            if (isNaN(date.getTime())) {
              console.log(`   ⚠️ Invalid date: ${dateStr}`);
              continue;
            }

            // Skip income transactions (positive amounts) - expense tracking only
            if (amount > 0) {
              console.log(`   ⚠️ Skipping income transaction: ${merchant} (${amount})`);
              continue;
            }

            rows.push({
              date,
              account: 'Finnair Visa',
              merchant,
              amount,
              note: '',
              type: 'Expense'
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
        console.error('❌ Finnair CSV parsing error:', error);
        resolve([]);
      }
    });
  });
}
