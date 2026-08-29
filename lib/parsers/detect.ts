export function detectBank(csvContent: string): 'op' | 'amex' | 'finnair' | null {
  const firstLine = (csvContent.split('\n')[0] ?? '').toLowerCase();
  // Finnish column names (older export) or English column names (newer export)
  if (
    firstLine.includes('kirjauspäivä') ||
    firstLine.includes('määrä euroa') ||
    firstLine.includes('saaja/maksaja') ||
    firstLine.includes('recipient/payer') ||
    firstLine.includes('entrydate') ||
    firstLine.includes('filing id') ||
    firstLine.includes('amount eur')
  ) {
    return 'op';
  }
  if (firstLine.includes('date of payment') || firstLine.includes('location of purchase')) {
    return 'finnair';
  }
  if (firstLine.includes('päivämäärä') || firstLine.includes('kuvaus')) {
    return 'amex';
  }
  return null;
}
