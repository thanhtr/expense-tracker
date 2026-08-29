import Papa from 'papaparse';
import { parseFinnishAmount, findColumn } from './utils';
import { ParsedTransaction } from '@/lib/types';

export async function parseOPBank(fileContent: string): Promise<ParsedTransaction[]> {
  return new Promise((resolve, reject) => {
    // Try with semicolon delimiter first (standard OP Bank format)
    const delimiters = [';', ',', '\t'];

    function tryParse(delimiterIndex: number) {
      const delimiter = delimiters[delimiterIndex];

      Papa.parse<Record<string, string>>(fileContent, {
        header: true,
        delimiter,
        skipEmptyLines: true,
        complete: (results) => {
          const rows: ParsedTransaction[] = [];

          if (results.data.length === 0) {
            if (delimiterIndex < delimiters.length - 1) {
              tryParse(delimiterIndex + 1);
              return;
            }
            resolve(rows);
            return;
          }

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
                continue;
              }

              const amount = parseFinnishAmount(amountStr);
              if (amount > 0) continue; // skip income — expense tracker only
              const date = new Date(dateStr.replace(/"/g, ''));
              const recipient = (recipientStr?.trim() || '').replace(/"/g, '');
              const desc = (descStr?.trim() || '').replace(/"/g, '');
              // Prefer the actual payee name; fall back to the transaction-type description
              let merchant = recipient || desc || 'Unknown';
              const note = (noteStr?.replace(/"/g, '').trim()) || '';

              // Incoming MobilePay: OP Bank puts "MobilePay" in Saaja/Maksaja and buries
              // the sender name in Viesti as:
              // "SEPA INSTANT CREDIT TRANSFER <ref> Message: MobilePay <Name> <BIC>"
              // Extract the name and use it as merchant instead.
              // BIC codes are 8–11 chars: 4-letter bank + 2-letter country + 2-char location + optional 3-char branch
              const mobilePayMatch = note.match(
                /Message:\s+MobilePay\s+(.+?)\s+[A-Z]{6}[A-Z0-9]{2,5}$/
              );
              if (mobilePayMatch?.[1]) {
                merchant = mobilePayMatch[1].trim();
              }

              if (isNaN(date.getTime())) {
                continue;
              }

              rows.push({
                date,
                account: 'OP Bank',
                merchant,
                amount,
                note,
                type: 'Expense',
              });
            } catch {
              continue;
            }
          }

          resolve(rows);
        },
        error: (error: Error) => {
          if (delimiterIndex < delimiters.length - 1) {
            tryParse(delimiterIndex + 1);
            return;
          }
          reject(new Error(`Failed to parse OP Bank CSV: ${error.message}`));
        }
      });
    }

    tryParse(0);
  });
}
