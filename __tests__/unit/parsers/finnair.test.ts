import { describe, it, expect } from 'vitest';
import { parseFinnair } from '../../../lib/parsers/finnair';

describe('parseFinnair', () => {
  it('should parse Finnair CSV without amount inversion', async () => {
    const csv = `Payment Date,Location of purchase,Amount
2026-04-10,Helsinki Airport,-45.67
2026-04-11,Food Court,-5.50`;

    const result = await parseFinnair(csv);

    expect(result).toHaveLength(2);
    expect(result[0].date).toEqual(new Date('2026-04-10'));
    expect(result[0].amount).toBe(-45.67); // Negative stays negative (no inversion)
    expect(result[0].merchant).toBe('Helsinki Airport');
    expect(result[0].account).toBe('Finnair Visa');
  });

  it('should skip income transactions (positive amounts)', async () => {
    const csv = `Payment Date,Location of purchase,Amount
2026-04-10,-45.67,Charge
2026-04-11,+100.00,Refund`;

    const result = await parseFinnair(csv);

    expect(result).toHaveLength(1);
    expect(result[0].merchant).toMatch(/Charge|Helsinki/);
  });

  it('should handle different column names', async () => {
    const csv = `Date of payment,Merchant,Amount
2026-04-10,Store,-45.67`;

    const result = await parseFinnair(csv);

    expect(result).toHaveLength(1);
    expect(result[0].merchant).toBe('Store');
  });

  it('should set type to Expense for negative amounts', async () => {
    const csv = `Payment Date,Location of purchase,Amount
2026-04-10,Store,-45.67`;

    const result = await parseFinnair(csv);

    expect(result[0].type).toBe('Expense');
  });

  it('should return empty array for CSV with only refunds', async () => {
    const csv = `Payment Date,Location of purchase,Amount
2026-04-10,Store,+100.00`;

    const result = await parseFinnair(csv);

    expect(result).toEqual([]);
  });

  it('should handle decimal amounts without Finnish locale formatting', async () => {
    const csv = `Payment Date,Location of purchase,Amount
2026-04-10,Store,-123.45
2026-04-11,Shop,-0.99`;

    const result = await parseFinnair(csv);

    expect(result[0].amount).toBe(-123.45);
    expect(result[1].amount).toBe(-0.99);
  });

  it('should set merchant from location column', async () => {
    const csv = `Payment Date,Merchant,Amount
2026-04-10,Whole Foods Market,-45.67`;

    const result = await parseFinnair(csv);

    expect(result[0].merchant).toBe('Whole Foods Market');
  });

  it('should handle multiple transactions in correct order', async () => {
    const csv = `Payment Date,Location of purchase,Amount
2026-04-10,Store A,-100.00
2026-04-11,Store B,-50.00
2026-04-12,Store C,-25.00`;

    const result = await parseFinnair(csv);

    expect(result).toHaveLength(3);
    expect(result[0].merchant).toBe('Store A');
    expect(result[1].merchant).toBe('Store B');
    expect(result[2].merchant).toBe('Store C');
  });
});
