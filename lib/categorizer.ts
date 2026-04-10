import { promises as fs } from 'fs';
import { join } from 'path';
import { ParsedTransaction } from '@/lib/types';

let _merchantMapCache: Array<[string, string]> | null = null;

async function loadMerchantMap(): Promise<Array<[string, string]>> {
  if (_merchantMapCache !== null) {
    return _merchantMapCache;
  }

  try {
    const filePath = join(process.cwd(), 'merchant_map.csv');
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    _merchantMapCache = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed === 'Keyword,Category') {
        continue;
      }

      const [keyword, category] = trimmed.split(',').map(s => s.trim());
      if (keyword && category) {
        _merchantMapCache.push([keyword.toLowerCase(), category]);
      }
    }

    return _merchantMapCache;
  } catch (error) {
    console.error('Error loading merchant_map.csv:', error);
    return [];
  }
}

export function categorize(merchant: string, keywords: Array<[string, string]>): string {
  const m = merchant.toLowerCase();
  for (const [keyword, category] of keywords) {
    if (m.includes(keyword)) {
      return category;
    }
  }
  return '';
}

export async function categorizeTransactions(rows: ParsedTransaction[]): Promise<ParsedTransaction[]> {
  const keywords = await loadMerchantMap();

  return rows.map(row => ({
    ...row,
    category: categorize(row.merchant, keywords)
  }));
}
