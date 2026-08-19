// Utility functions for parsing CSV files

export function findColumn(row: Record<string, string>, names: string[]): string | undefined {
  const lowerNames = names.map(n => n.toLowerCase());
  for (const [key, value] of Object.entries(row)) {
    const lowerKey = key.toLowerCase();
    if (lowerNames.includes(lowerKey)) return value;
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
      .replace(',', '.')      // comma to dot
  );
}
