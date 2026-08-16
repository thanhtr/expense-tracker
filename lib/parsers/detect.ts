export function detectBank(csvContent: string): 'op' | 'amex' | 'finnair' | null {
  const firstLine = (csvContent.split('\n')[0] ?? '').toLowerCase();
  if (firstLine.includes('kirjauspäivä') || firstLine.includes('määrä euroa') || firstLine.includes('saaja/maksaja')) {
    return 'op';
  }
  if (firstLine.includes('date of payment') || firstLine.includes('location of purchase')) {
    return 'finnair';
  }
  if (firstLine.includes('päivämäärä') || firstLine.includes('kuvaus') || (firstLine.includes('date') && firstLine.includes('description'))) {
    return 'amex';
  }
  return null;
}
