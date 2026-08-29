import Papa from 'papaparse';
import type { ColumnMapping } from './generic';

export interface HeuristicResult extends ColumnMapping {
  headers: string[];
  sampleRows: Record<string, string>[];
}

const DATE_KEYWORDS = ['date', 'datum', 'päivä', 'booking', 'posting', 'value', 'transaction', 'kirjaus', 'arvopäivä'];
const AMOUNT_KEYWORDS = ['amount', 'sum', 'summa', 'belopp', 'betrag', 'summe', 'charge', 'debit', 'credit', 'kredit', 'debet', 'määrä', 'euro'];
const MERCHANT_KEYWORDS = ['description', 'merchant', 'payee', 'beneficiary', 'recipient', 'saaja', 'kuvaus', 'selite', 'text', 'narrative', 'memo', 'details', 'maksaja', 'location', 'purchase'];
const NOTE_KEYWORDS = ['note', 'message', 'viesti', 'reference', 'ref', 'info', 'selitys', 'viite', 'additional'];

function scores(header: string, keywords: string[]): number {
  const h = header.toLowerCase();
  return keywords.reduce((acc, kw) => acc + (h.includes(kw) ? 1 : 0), 0);
}

function looksLikeDate(val: string): boolean {
  if (!val) return false;
  return /^\d{1,4}[-./]\d{1,2}[-./]\d{1,4}/.test(val.trim());
}

function looksLikeNumber(val: string): boolean {
  if (!val) return false;
  return /^-?\s*[\d\s]+[,.]?\d*$/.test(val.trim().replace(/\xa0/g, ''));
}

function detectDelimiter(first500: string): ',' | ';' | '\t' {
  const counts = {
    ';': (first500.split('\n')[0] ?? '').split(';').length - 1,
    ',': (first500.split('\n')[0] ?? '').split(',').length - 1,
    '\t': (first500.split('\n')[0] ?? '').split('\t').length - 1,
  };
  if (counts[';'] >= counts[','] && counts[';'] >= counts['\t']) return ';';
  if (counts['\t'] >= counts[',']) return '\t';
  return ',';
}

function detectDateFormat(sample: string): string {
  const s = sample.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return 'YYYY-MM-DD';
  if (/^\d{1,2}\.\d{1,2}\.\d{4}/.test(s)) return 'DD.MM.YYYY';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) return 'MM/DD/YYYY';
  if (/^\d{4}\/\d{2}\/\d{2}/.test(s)) return 'YYYY/MM/DD';
  return 'YYYY-MM-DD';
}

function detectAmountFormat(samples: string[]): 'finnish' | 'standard' {
  // Finnish: uses comma as decimal separator, e.g. "1 234,56" or "-3,50"
  return samples.some(s => /\d,\d\d$/.test(s.trim())) ? 'finnish' : 'standard';
}

function detectAmountSign(samples: string[]): 'standard' | 'inverted' {
  // If there are negative values we assume standard (negative = expense)
  const hasNegative = samples.some(s => /^-/.test(s.trim().replace(/\s/g, '')));
  return hasNegative ? 'standard' : 'inverted';
}

function bestColumn(headers: string[], rows: Record<string, string>[], keywords: string[], valuePredicate?: (v: string) => boolean): string {
  let best = '';
  let bestScore = -1;

  for (const h of headers) {
    let s = scores(h, keywords) * 2;
    if (valuePredicate) {
      const hits = rows.slice(0, 5).filter(r => valuePredicate(r[h] ?? '')).length;
      s += hits;
    }
    if (s > bestScore) {
      bestScore = s;
      best = h;
    }
  }
  return best;
}

export function detectColumnMapping(csvContent: string): HeuristicResult {
  const delimiter = detectDelimiter(csvContent.slice(0, 500));

  let headers: string[] = [];
  let sampleRows: Record<string, string>[] = [];

  Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    delimiter,
    skipEmptyLines: true,
    preview: 5,
    complete: (results) => {
      headers = results.meta.fields ?? [];
      sampleRows = results.data.slice(0, 3);
    },
  });

  if (headers.length === 0) {
    return {
      headers: [],
      sampleRows: [],
      bankLabel: 'Unknown Bank',
      dateColumn: '',
      amountColumn: '',
      merchantColumn: '',
      noteColumn: null,
      delimiter,
      amountFormat: 'standard',
      dateFormat: 'YYYY-MM-DD',
      amountSign: 'standard',
      confidence: 0,
    };
  }

  const dateCol = bestColumn(headers, sampleRows, DATE_KEYWORDS, looksLikeDate);
  const amountCol = bestColumn(headers, sampleRows, AMOUNT_KEYWORDS, looksLikeNumber);

  // Merchant: exclude already-picked columns
  const remaining = headers.filter(h => h !== dateCol && h !== amountCol);
  const merchantCol = bestColumn(remaining, sampleRows, MERCHANT_KEYWORDS);

  // Note: optional, from what's left
  const remaining2 = remaining.filter(h => h !== merchantCol);
  const noteCandidates = remaining2.filter(h => scores(h, NOTE_KEYWORDS) > 0);
  const noteCol = noteCandidates[0] ?? null;

  // Date format from sample values
  const dateSamples = sampleRows.map(r => r[dateCol] ?? '').filter(Boolean);
  const dateFormat = dateSamples.length > 0 ? detectDateFormat(dateSamples[0]!) : 'YYYY-MM-DD';

  // Amount format + sign from sample values
  const amountSamples = sampleRows.map(r => r[amountCol] ?? '').filter(Boolean);
  const amountFormat = detectAmountFormat(amountSamples);
  const amountSign = detectAmountSign(amountSamples);

  return {
    headers,
    sampleRows,
    bankLabel: 'Unknown Bank',
    dateColumn: dateCol,
    amountColumn: amountCol,
    merchantColumn: merchantCol,
    noteColumn: noteCol,
    delimiter,
    amountFormat,
    dateFormat,
    amountSign,
    confidence: dateCol && amountCol && merchantCol ? 0.8 : 0.4,
  };
}
