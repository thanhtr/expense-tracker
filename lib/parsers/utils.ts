// Utility functions for parsing CSV files

export function parseFinnishAmount(s: string): number {
  return parseFloat(
    s.trim()
      .replace(/\xa0/g, '')  // non-breaking space
      .replace(/ /g, '')
      .replace(',', '.')      // comma to dot
  );
}
