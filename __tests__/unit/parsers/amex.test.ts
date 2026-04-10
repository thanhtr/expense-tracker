import { describe, it, expect } from 'vitest';
import { parseAmex } from '../../../lib/parsers/amex';

describe('parseAmex', () => {
  it('should parse Amex CSV with amount inversion', async () => {
    const csv = `Date,Description,Amount
2026-04-10,Amazon Purchase,45.67
2026-04-11,Starbucks,5.50`;

    const result = await parseAmex(csv);

    expect(result).toHaveLength(2);
    expect(result[0].date).toEqual(new Date('2026-04-10'));
    expect(result[0].amount).toBe(-45.67); // Inverted: positive in CSV -> negative
    expect(result[0].merchant).toBe('Amazon Purchase');
    expect(result[0].account).toBe('Amex');
  });

  it('should skip income rows (negative amounts in CSV)', async () => {
    const csv = `Date,Description,Amount
2026-04-10,Amazon Purchase,45.67
2026-04-11,Refund,-100.00`;

    const result = await parseAmex(csv);

    expect(result).toHaveLength(1);
    expect(result[0].merchant).toBe('Amazon Purchase');
  });

  it('should handle different date formats', async () => {
    const csv = `Päivämäärä,Kuvaus,Summa
2026-04-10,Store,45.67`;

    const result = await parseAmex(csv);

    expect(result[0].date).toEqual(new Date('2026-04-10'));
  });

  it('should set type to Expense for inverted amounts', async () => {
    const csv = `Date,Description,Amount
2026-04-10,Purchase,45.67`;

    const result = await parseAmex(csv);

    expect(result[0].type).toBe('Expense');
  });

  it('should return empty array for CSV with no expense rows', async () => {
    const csv = `Date,Description,Amount
2026-04-10,Refund,-100.00`;

    const result = await parseAmex(csv);

    expect(result).toEqual([]);
  });

  it('should handle decimal amounts correctly', async () => {
    const csv = `Date,Description,Amount
2026-04-10,Store,123.45
2026-04-11,Shop,0.99`;

    const result = await parseAmex(csv);

    expect(result[0].amount).toBe(-123.45);
    expect(result[1].amount).toBe(-0.99);
  });

  it('should set merchant from description column', async () => {
    const csv = `Date,Merchant,Amount
2026-04-10,Whole Foods Market,45.67`;

    const result = await parseAmex(csv);

    expect(result[0].merchant).toBe('Whole Foods Market');
  });

  it('should handle empty description gracefully', async () => {
    const csv = `Date,Description,Amount
2026-04-10,,45.67`;

    const result = await parseAmex(csv);

    expect(result).toHaveLength(1);
    expect(result[0].merchant).toBe('');
  });
});
