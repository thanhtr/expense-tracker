import { describe, it, expect } from 'vitest';
import { detectColumnMapping } from '../../../lib/parsers/heuristic';

// Helpers
const csv = (header: string, ...rows: string[]) => [header, ...rows].join('\n');

describe('detectColumnMapping — delimiter detection', () => {
  it('detects semicolon delimiter', () => {
    const result = detectColumnMapping(
      csv('Date;Amount;Description', '2024-01-15;-3.50;Coffee'),
    );
    expect(result.delimiter).toBe(';');
  });

  it('detects comma delimiter', () => {
    const result = detectColumnMapping(
      csv('Date,Amount,Description', '2024-01-15,-3.50,Coffee'),
    );
    expect(result.delimiter).toBe(',');
  });

  it('detects tab delimiter', () => {
    const result = detectColumnMapping(
      csv('Date\tAmount\tDescription', '2024-01-15\t-3.50\tCoffee'),
    );
    expect(result.delimiter).toBe('\t');
  });
});

describe('detectColumnMapping — column identification by header name', () => {
  it('identifies English "Date", "Amount", "Description" columns', () => {
    const result = detectColumnMapping(
      csv('Date,Amount,Description', '2024-01-15,-3.50,Coffee Shop'),
    );
    expect(result.dateColumn).toBe('Date');
    expect(result.amountColumn).toBe('Amount');
    expect(result.merchantColumn).toBe('Description');
  });

  it('identifies Finnish header names (Kirjauspäivä, Summa, Saaja)', () => {
    const result = detectColumnMapping(
      csv('Kirjauspäivä;Summa;Saaja', '2024-01-15;-3,50;Kahvila'),
    );
    expect(result.dateColumn).toBe('Kirjauspäivä');
    expect(result.amountColumn).toBe('Summa');
    expect(result.merchantColumn).toBe('Saaja');
  });

  it('identifies "Transaction Date", "Amount EUR", "Merchant" columns', () => {
    const result = detectColumnMapping(
      csv('Transaction Date;Amount EUR;Merchant;Reference',
        '15.01.2024;-45,00;Supermarket;REF001'),
    );
    expect(result.dateColumn).toBe('Transaction Date');
    expect(result.amountColumn).toBe('Amount EUR');
    expect(result.merchantColumn).toBe('Merchant');
  });

  it('identifies note column from "Reference" header', () => {
    const result = detectColumnMapping(
      csv('Date;Amount;Description;Reference', '2024-01-15;-3.50;Coffee;REF123'),
    );
    expect(result.noteColumn).toBe('Reference');
  });

  it('identifies note column from "Message" header', () => {
    const result = detectColumnMapping(
      csv('Date;Amount;Payee;Message', '2024-01-15;-3.50;Amazon;Order 123'),
    );
    expect(result.noteColumn).toBe('Message');
  });

  it('leaves noteColumn null when no note-like column present', () => {
    const result = detectColumnMapping(
      csv('Date,Amount,Description', '2024-01-15,-3.50,Coffee'),
    );
    expect(result.noteColumn).toBeNull();
  });
});

describe('detectColumnMapping — amount format detection', () => {
  it('detects Finnish amount format when values use comma as decimal', () => {
    const result = detectColumnMapping(
      csv('Date;Amount;Description',
        '2024-01-15;-3,50;Coffee',
        '2024-01-16;-45,00;Store'),
    );
    expect(result.amountFormat).toBe('finnish');
  });

  it('detects standard amount format when values use dot as decimal', () => {
    const result = detectColumnMapping(
      csv('Date,Amount,Description',
        '2024-01-15,-3.50,Coffee',
        '2024-01-16,-45.00,Store'),
    );
    expect(result.amountFormat).toBe('standard');
  });
});

describe('detectColumnMapping — amount sign detection', () => {
  it('detects standard sign (negative values present)', () => {
    const result = detectColumnMapping(
      csv('Date;Amount;Description', '2024-01-15;-3,50;Coffee'),
    );
    expect(result.amountSign).toBe('standard');
  });

  it('detects inverted sign when all amounts are positive (Amex-style)', () => {
    const result = detectColumnMapping(
      csv('Date,Amount,Description',
        '2024-01-15,3.50,Coffee',
        '2024-01-16,45.00,Store'),
    );
    expect(result.amountSign).toBe('inverted');
  });
});

describe('detectColumnMapping — date format detection', () => {
  it('detects YYYY-MM-DD format', () => {
    const result = detectColumnMapping(
      csv('Date,Amount,Description', '2024-01-15,-3.50,Coffee'),
    );
    expect(result.dateFormat).toBe('YYYY-MM-DD');
  });

  it('detects DD.MM.YYYY format', () => {
    const result = detectColumnMapping(
      csv('Date;Amount;Description', '15.01.2024;-3,50;Kahvila'),
    );
    expect(result.dateFormat).toBe('DD.MM.YYYY');
  });

  it('detects MM/DD/YYYY format', () => {
    const result = detectColumnMapping(
      csv('Date,Amount,Description', '01/15/2024,-3.50,Coffee'),
    );
    expect(result.dateFormat).toBe('MM/DD/YYYY');
  });
});

describe('detectColumnMapping — returns all headers for dropdowns', () => {
  it('includes all column names in headers array', () => {
    const result = detectColumnMapping(
      csv('Date;Amount;Description;Balance;Reference',
        '2024-01-15;-3,50;Coffee;996,50;REF1'),
    );
    expect(result.headers).toEqual(['Date', 'Amount', 'Description', 'Balance', 'Reference']);
  });
});

describe('detectColumnMapping — sample rows', () => {
  it('returns up to 3 raw sample rows', () => {
    const result = detectColumnMapping(
      csv('Date,Amount,Description',
        '2024-01-15,-3.50,Coffee',
        '2024-01-16,-45.00,Store',
        '2024-01-17,-12.00,Pharmacy',
        '2024-01-18,-8.00,Bakery'),
    );
    expect(result.sampleRows).toHaveLength(3);
    expect(result.sampleRows[0]?.['Description']).toBe('Coffee');
  });
});

describe('detectColumnMapping — edge cases', () => {
  it('returns empty result for a single-column CSV', () => {
    const result = detectColumnMapping('JustOneColumn\nvalue1\nvalue2');
    // Should not crash; date/amount/merchant may be the same single column
    expect(result.headers.length).toBeGreaterThanOrEqual(1);
  });

  it('returns low confidence for empty CSV', () => {
    const result = detectColumnMapping('');
    expect(result.headers).toHaveLength(0);
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('handles CSV with many columns gracefully (no crash)', () => {
    const headers = Array.from({ length: 20 }, (_, i) => `Col${i}`).join(',');
    const row = Array.from({ length: 20 }, (_, i) => `val${i}`).join(',');
    expect(() => detectColumnMapping(csv(headers, row))).not.toThrow();
  });
});

describe('detectColumnMapping — realistic bank formats', () => {
  it('handles Nordea-style CSV (Date, Amount, Transaction)', () => {
    const result = detectColumnMapping(
      csv('Date;Payee;Memo;Amount',
        '2024-01-15;Coffee Shop;Online;-3.50',
        '2024-01-16;Salary;Monthly;2000.00'),
    );
    expect(result.dateColumn).toBe('Date');
    expect(result.amountColumn).toBe('Amount');
    expect(result.merchantColumn).toBe('Payee');
    expect(result.noteColumn).toBe('Memo');
  });

  it('handles Danske Bank-style CSV (Booking date, Amount, Text)', () => {
    const result = detectColumnMapping(
      csv('Booking date;Text;Amount;Balance',
        '15.01.2024;Supermarket;-45,00;954,00',
        '16.01.2024;Salary;2000,00;2954,00'),
    );
    expect(result.dateColumn).toBe('Booking date');
    expect(result.amountColumn).toBe('Amount');
    expect(result.merchantColumn).toBe('Text');
    expect(result.delimiter).toBe(';');
    expect(result.amountFormat).toBe('finnish');
  });
});
