import { parseOPBank, parseAmex, parseFinnair, detectBank } from '@/lib/parsers';
import { categorizeWithLearning } from '@/lib/categorizer';
import { upsertTransactions } from '@/lib/services/transaction-service';
import { invalidateDashboardCache } from '@/lib/services/aggregation-service';

export async function processUpload(fileContent: string, accountType: string, accountOwner: string) {
  const resolved = (accountType === 'auto' || !accountType)
    ? (detectBank(fileContent) ?? '')
    : accountType;

  let rows;
  switch (resolved) {
    case 'op':      rows = await parseOPBank(fileContent); break;
    case 'amex':    rows = await parseAmex(fileContent); break;
    case 'finnair': rows = await parseFinnair(fileContent); break;
    default:
      throw new Error('Could not detect bank type. Please select manually.');
  }

  rows = await categorizeWithLearning(rows);
  const result = await upsertTransactions(rows, accountOwner);
  invalidateDashboardCache();
  return { ...result, detectedBank: resolved };
}
