import Papa from 'papaparse';
import { parseFinnishAmount } from './utils';
import { ParsedTransaction } from '@/lib/types';

// Helper to find column by name (case-insensitive and with variations)
function findColumn(row: Record<string, string>, names: string[]): string | undefined {
  const lowerNames = names.map(n => n.toLowerCase());
  for (const [key, value] of Object.entries(row)) {
    const lowerKey = key.toLowerCase();
    // Exact match
    if (lowerNames.includes(lowerKey)) {
      return value;
    }
    // Partial match (useful for variations like "Määrä EUROA" matching "Määrä EUR")
    for (const name of lowerNames) {
      if (lowerKey.includes(name) || name.includes(lowerKey.split(/\s+/)[0] ?? '')) {
        return value;
      }
    }
  }
  return undefined;
}

export async function parseOPBank(fileContent: string): Promise<ParsedTransaction[]> {
  return new Promise((resolve) => {
    // Try with semicolon delimiter first (standard OP Bank format)
    const delimiters = [';', ',', '\t'];

    function tryParse(delimiterIndex: number) {
      const delimiter = delimiters[delimiterIndex];
      console.log(`🔍 OP Bank parser: Attempt ${delimiterIndex + 1} with delimiter '${delimiter === '\t' ? 'TAB' : delimiter}'`);

      Papa.parse<Record<string, string>>(fileContent, {
        header: true,
        delimiter,
        skipEmptyLines: true,
        complete: (results) => {
          const rows: ParsedTransaction[] = [];

          if (results.data.length === 0) {
            console.log(`   ℹ️ No rows found with this delimiter`);
            if (delimiterIndex < delimiters.length - 1) {
              tryParse(delimiterIndex + 1);
              return;
            }
            console.log('🔍 OP Bank parser: No rows found with any delimiter');
            resolve(rows);
            return;
          }

          const firstRow = results.data[0];
          console.log(`🔍 OP Bank parser: Found ${results.data.length} rows`);
          console.log(`   Columns: ${firstRow ? Object.keys(firstRow).join(', ') : '(none)'}`);
          console.log(`   First row data: ${JSON.stringify(firstRow)}`);

          for (const r of results.data) {
            try {
              // Try to find columns by various name variations (including OP Bank Finnish names)
              const amountStr = findColumn(r, ['Määrä EUROA', 'Amount EUR', 'Määrä EUR', 'Summa', 'Amount']);
              const dateStr = findColumn(r, ['Kirjauspäivä', 'Arvopäivä', 'EntryDate', 'Päivämäärä', 'Date']);
              // Recipient/payer name — intentionally excludes generic description column names
              // (Kuvaus, Description) which in OP CSVs often hold the transaction type
              // ("TILISIIRTO", "PAYMENT") rather than the actual payee.
              const recipientStr = findColumn(r, ['Saaja/Maksaja', 'Recipient/Payer', 'Saaja', 'Maksaja']);
              // Transaction-type description — used as fallback when payee name is absent
              const descStr = findColumn(r, ['Selite', 'Kuvaus', 'Description']);
              const noteStr = findColumn(r, ['Viesti', 'Selitys', 'Message', 'Note']);

              if (!amountStr || !dateStr) {
                console.log(`   ⚠️ Skipping row: missing amount or date`);
                continue;
              }

              const amount = parseFinnishAmount(amountStr);
              const date = new Date(dateStr.replace(/"/g, ''));
              const recipient = (recipientStr?.trim() || '').replace(/"/g, '');
              const desc = (descStr?.trim() || '').replace(/"/g, '');
              // Prefer the actual payee name; fall back to the transaction-type description
              const merchant = recipient || desc || 'Unknown';
              const note = (noteStr?.replace(/"/g, '').trim()) || '';

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
                account: 'OP Bank',
                merchant,
                amount,
                note,
                type: 'Expense'
              });
            } catch (error) {
              console.log(`   ⚠️ Parse error: ${error instanceof Error ? error.message : String(error)}`);
              continue; // Skip invalid rows
            }
          }

          console.log(`   ✓ Parsed ${rows.length} valid transactions`);
          resolve(rows);
        },
        error: (error: Error) => {
          console.error('❌ CSV parsing error:', error);
          if (delimiterIndex < delimiters.length - 1) {
            tryParse(delimiterIndex + 1);
            return;
          }
          resolve([]);
        }
      });
    }

    tryParse(0);
  });
}
