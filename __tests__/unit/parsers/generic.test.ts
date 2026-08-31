import { describe, it, expect } from 'vitest';
import { parseGeneric } from '../../../lib/parsers/generic';
import type { ColumnMapping } from '../../../lib/parsers/generic';

const baseMapping: ColumnMapping = {
  bankLabel: 'Test Bank',
  dateColumn: 'Date',
  amountColumn: 'Amount',
  merchantColumn: 'Description',
  noteColumn: null,
  delimiter: ',',
  amountFormat: 'standard',
  dateFormat: 'YYYY-MM-DD',
  amountSign: 'standard',
  confidence: 0.9,
};

describe('parseGeneric — basic parsing', () => {
  it('parses a simple CSV with standard format', async () => {
    const csv = `Date,Amount,Description
2024-01-15,-3.50,Coffee Shop
2024-01-16,-45.00,Supermarket`;

    const result = await parseGeneric(csv, baseMapping);

    expect(result).toHaveLength(2);
    expect(result[0]?.date).toEqual(new Date('2024-01-15'));
    expect(result[0]?.amount).toBe(-3.5);
    expect(result[0]?.merchant).toBe('Coffee Shop');
    expect(result[0]?.account).toBe('Test Bank');
    expect(result[0]?.type).toBe('Expense');
  });

  it('sets account to bankLabel', async () => {
    const csv = `Date,Amount,Description\n2024-01-15,-3.50,Store`;
    const result = await parseGeneric(csv, { ...baseMapping, bankLabel: 'Nordea' });
    expect(result[0]?.account).toBe('Nordea');
  });

  it('parses income rows (positive amounts) correctly', async () => {
    const csv = `Date,Amount,Description
2024-01-15,2000.00,Salary
2024-01-16,-45.00,Store`;

    const result = await parseGeneric(csv, baseMapping);

    const income = result.find(r => r.merchant === 'Salary');
    const expense = result.find(r => r.merchant === 'Store');
    expect(income?.type).toBe('Income');
    expect(income?.amount).toBe(2000);
    expect(expense?.type).toBe('Expense');
  });
});

describe('parseGeneric — Finnish amount format', () => {
  it('parses Finnish comma-decimal amounts', async () => {
    const csv = `Date;Amount;Description
2024-01-15;-3,50;Coffee
2024-01-16;-1 234,56;Supermarket`;

    const result = await parseGeneric(csv, {
      ...baseMapping,
      delimiter: ';',
      amountFormat: 'finnish',
    });

    expect(result[0]?.amount).toBe(-3.5);
    expect(result[1]?.amount).toBe(-1234.56);
  });
});

describe('parseGeneric — amount sign convention', () => {
  it('inverts amounts for Amex-style CSVs (positive = expense)', async () => {
    const csv = `Date,Amount,Description
2024-01-15,3.50,Coffee
2024-01-16,-100.00,Refund`;

    const result = await parseGeneric(csv, {
      ...baseMapping,
      amountSign: 'inverted',
    });

    const expense = result.find(r => r.merchant === 'Coffee');
    const income = result.find(r => r.merchant === 'Refund');
    expect(expense?.amount).toBe(-3.5);
    expect(expense?.type).toBe('Expense');
    expect(income?.amount).toBe(100);
    expect(income?.type).toBe('Income');
  });
});

describe('parseGeneric — date formats', () => {
  it('parses DD.MM.YYYY dates', async () => {
    const csv = `Date;Amount;Description\n15.01.2024;-3,50;Coffee`;

    const result = await parseGeneric(csv, {
      ...baseMapping,
      delimiter: ';',
      amountFormat: 'finnish',
      dateFormat: 'DD.MM.YYYY',
    });

    expect(result[0]?.date).toEqual(new Date('2024-01-15'));
  });

  it('parses MM/DD/YYYY dates', async () => {
    const csv = `Date,Amount,Description\n01/15/2024,-3.50,Coffee`;

    const result = await parseGeneric(csv, {
      ...baseMapping,
      dateFormat: 'MM/DD/YYYY',
    });

    expect(result[0]?.date).toEqual(new Date('2024-01-15'));
  });

  it('parses YYYY-MM-DD dates (ISO)', async () => {
    const csv = `Date,Amount,Description\n2024-01-15,-3.50,Coffee`;
    const result = await parseGeneric(csv, baseMapping);
    expect(result[0]?.date).toEqual(new Date('2024-01-15'));
  });
});

describe('parseGeneric — note column', () => {
  it('populates note field when noteColumn is set', async () => {
    const csv = `Date,Amount,Description,Reference
2024-01-15,-3.50,Coffee,REF123`;

    const result = await parseGeneric(csv, { ...baseMapping, noteColumn: 'Reference' });
    expect(result[0]?.note).toBe('REF123');
  });

  it('leaves note empty when noteColumn is null', async () => {
    const csv = `Date,Amount,Description\n2024-01-15,-3.50,Coffee`;
    const result = await parseGeneric(csv, baseMapping);
    expect(result[0]?.note).toBe('');
  });
});

describe('parseGeneric — row skipping', () => {
  it('skips rows with missing date', async () => {
    const csv = `Date,Amount,Description
,-3.50,Coffee
2024-01-16,-45.00,Store`;

    const result = await parseGeneric(csv, baseMapping);
    expect(result).toHaveLength(1);
    expect(result[0]?.merchant).toBe('Store');
  });

  it('skips rows with missing amount', async () => {
    const csv = `Date,Amount,Description
2024-01-15,,Coffee
2024-01-16,-45.00,Store`;

    const result = await parseGeneric(csv, baseMapping);
    expect(result).toHaveLength(1);
  });

  it('skips rows with unparseable date', async () => {
    const csv = `Date,Amount,Description
not-a-date,-3.50,Coffee
2024-01-16,-45.00,Store`;

    const result = await parseGeneric(csv, baseMapping);
    expect(result).toHaveLength(1);
  });

  it('skips rows with non-numeric amount', async () => {
    const csv = `Date,Amount,Description
2024-01-15,N/A,Coffee
2024-01-16,-45.00,Store`;

    const result = await parseGeneric(csv, baseMapping);
    expect(result).toHaveLength(1);
  });

  it('returns empty array for empty CSV', async () => {
    const result = await parseGeneric('Date,Amount,Description\n', baseMapping);
    expect(result).toHaveLength(0);
  });
});

describe('parseGeneric — delimiter variants', () => {
  it('parses semicolon-delimited CSV', async () => {
    const csv = `Date;Amount;Description\n2024-01-15;-3.50;Coffee`;
    const result = await parseGeneric(csv, { ...baseMapping, delimiter: ';' });
    expect(result).toHaveLength(1);
    expect(result[0]?.amount).toBe(-3.5);
  });

  it('parses tab-delimited CSV', async () => {
    const csv = `Date\tAmount\tDescription\n2024-01-15\t-3.50\tCoffee`;
    const result = await parseGeneric(csv, { ...baseMapping, delimiter: '\t' });
    expect(result).toHaveLength(1);
    expect(result[0]?.merchant).toBe('Coffee');
  });
});

describe('parseGeneric — merchant fallback', () => {
  it('falls back to "Unknown" when merchant column is empty', async () => {
    const csv = `Date,Amount,Description\n2024-01-15,-3.50,`;
    const result = await parseGeneric(csv, baseMapping);
    expect(result[0]?.merchant).toBe('Unknown');
  });
});

describe('parseGeneric — realistic Nordea CSV', () => {
  it('parses a realistic Nordea-style export', async () => {
    const csv = `Booking date;Payee;Memo;Amount
15.01.2024;K-Supermarket;Groceries;-45,00
16.01.2024;Employer;January salary;2500,00
17.01.2024;Netflix;;-15,99`;

    const mapping: ColumnMapping = {
      bankLabel: 'Nordea',
      dateColumn: 'Booking date',
      amountColumn: 'Amount',
      merchantColumn: 'Payee',
      noteColumn: 'Memo',
      delimiter: ';',
      amountFormat: 'finnish',
      dateFormat: 'DD.MM.YYYY',
      amountSign: 'standard',
      confidence: 0.9,
    };

    const result = await parseGeneric(csv, mapping);

    expect(result).toHaveLength(3);
    expect(result[0]?.merchant).toBe('K-Supermarket');
    expect(result[0]?.amount).toBe(-45);
    expect(result[0]?.type).toBe('Expense');
    expect(result[0]?.note).toBe('Groceries');
    expect(result[0]?.account).toBe('Nordea');
    expect(result[1]?.merchant).toBe('Employer');
    expect(result[1]?.amount).toBe(2500);
    expect(result[1]?.type).toBe('Income');
    expect(result[2]?.note).toBe('');
  });
});

describe('parseGeneric — realistic Danske Bank CSV', () => {
  it('parses a Danske Bank-style export with inverted amount sign', async () => {
    const csv = `Date,Description,Debit,Credit
01/15/2024,Coffee Shop,3.50,
01/16/2024,Refund,,10.00`;

    // Some banks have separate debit/credit columns — this is a simplification
    // using a single Amount column here for test clarity
    const csv2 = `Date,Amount,Description
01/15/2024,3.50,Coffee Shop
01/16/2024,-10.00,Refund`;

    const mapping: ColumnMapping = {
      bankLabel: 'Danske Bank',
      dateColumn: 'Date',
      amountColumn: 'Amount',
      merchantColumn: 'Description',
      noteColumn: null,
      delimiter: ',',
      amountFormat: 'standard',
      dateFormat: 'MM/DD/YYYY',
      amountSign: 'inverted',
      confidence: 0.85,
    };

    const result = await parseGeneric(csv2, mapping);

    expect(result[0]?.amount).toBe(-3.5);
    expect(result[0]?.type).toBe('Expense');
    expect(result[1]?.amount).toBe(10);
    expect(result[1]?.type).toBe('Income');
  });
});
