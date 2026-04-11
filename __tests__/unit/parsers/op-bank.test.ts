import { describe, it, expect } from 'vitest';
import { parseOPBank } from '../../../lib/parsers/op-bank';

describe('parseOPBank', () => {
  it('should parse semicolon-delimited OP Bank CSV', async () => {
    const csv = `Kirjauspäivä;Määrä EUROA;Saaja;Viesti
2026-04-10;-45,67;Amazon;Online purchase
2026-04-11;-5,50;Starbucks;Coffee`;

    const result = await parseOPBank(csv);

    expect(result).toHaveLength(2);
    expect(result[0].date).toEqual(new Date('2026-04-10'));
    expect(result[0].amount).toBe(-45.67);
    expect(result[0].merchant).toBe('Amazon');
    expect(result[0].account).toBe('OP Bank');
  });

  it('should skip income transactions (positive amounts)', async () => {
    const csv = `Kirjauspäivä;Määrä EUROA;Saaja;Viesti
2026-04-10;-45,67;Amazon;Purchase
2026-04-11;+1000,00;Employer;Salary`;

    const result = await parseOPBank(csv);

    expect(result).toHaveLength(1);
    expect(result[0].merchant).toBe('Amazon');
  });

  it('should handle Finnish amount format with comma decimal', async () => {
    const csv = `Kirjauspäivä;Määrä EUROA;Saaja;Viesti
2026-04-10;-1000,50;Store;Purchase`;

    const result = await parseOPBank(csv);

    expect(result[0].amount).toBe(-1000.5);
  });

  it('should handle fuzzy column matching', async () => {
    const csv = `Kirjauspäivä;Amount EUR;Description;Message
2026-04-10;-45,67;Amazon;Purchase`;

    const result = await parseOPBank(csv);

    expect(result).toHaveLength(1);
    expect(result[0].merchant).toBe('Amazon');
  });

  it('should set type to Expense for negative amounts', async () => {
    const csv = `Kirjauspäivä;Määrä EUROA;Saaja;Viesti
2026-04-10;-45,67;Amazon;Purchase`;

    const result = await parseOPBank(csv);

    expect(result[0].type).toBe('Expense');
  });

  it('should return empty array for CSV with no expense rows', async () => {
    const csv = `Kirjauspäivä;Määrä EUROA;Saaja;Viesti
2026-04-11;+1000,00;Employer;Salary`;

    const result = await parseOPBank(csv);

    expect(result).toEqual([]);
  });

  it('should handle non-breaking spaces in amounts', async () => {
    const csv = `Kirjauspäivä;Määrä EUROA;Saaja;Viesti
2026-04-10;-1\u00A0000,50;Store;Purchase`;

    const result = await parseOPBank(csv);

    expect(result[0].amount).toBe(-1000.5);
  });

  it('should extract merchant from description field', async () => {
    const csv = `Kirjauspäivä;Määrä EUROA;Kuvaus;Selitys
2026-04-10;-25,00;Whole Foods Market;Groceries`;

    const result = await parseOPBank(csv);

    expect(result[0].merchant).toBe('Whole Foods Market');
  });

  it('should set note field from message column', async () => {
    const csv = `Kirjauspäivä;Määrä EUROA;Saaja;Viesti
2026-04-10;-45,67;Amazon;Order #12345`;

    const result = await parseOPBank(csv);

    expect(result[0].note).toBe('Order #12345');
  });
});
