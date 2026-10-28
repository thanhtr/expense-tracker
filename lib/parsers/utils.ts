// Utility functions for parsing CSV files

export function findColumn(row: Record<string, string>, names: string[]): string | undefined {
  const lowerNames = names.map(n => n.toLowerCase());
  const entries = Object.entries(row);

  // Exact match first: a looser column (e.g. "Transaction amount") can otherwise
  // shadow an exact one (e.g. "Amount") that appears later, since both satisfy the
  // substring check below. This matters for CSVs like Finnair's that have both an
  // original-currency "Transaction amount" and a EUR-converted "Amount" column.
  for (const [key, value] of entries) {
    if (lowerNames.includes(key.toLowerCase())) return value;
  }

  for (const [key, value] of entries) {
    const lowerKey = key.toLowerCase();
    for (const name of lowerNames) {
      if (lowerKey.includes(name) || name.includes(lowerKey.split(/\s+/)[0] ?? '')) {
        return value;
      }
    }
  }
  return undefined;
}

export function parseFinnishAmount(s: string): number {
  return parseFloat(
    s.trim()
      .replace(/\xa0/g, '')  // non-breaking space
      .replace(/ /g, '')
      .replace(/[‐-―−]/g, '-')  // unicode dashes/minus (e.g. Amex's "−339,90") to ASCII hyphen
      .replace(',', '.')      // comma to dot
  );
}
