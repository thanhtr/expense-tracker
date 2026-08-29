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
    expect(result[0].type).toBe('Expense');
  });

  it('should return empty array for income-only CSV', async () => {
    const csv = `Kirjauspäivä;Määrä EUROA;Saaja;Viesti
2026-04-11;+1000,00;Employer;Salary`;

    const result = await parseOPBank(csv);

    expect(result).toHaveLength(0);
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

  it('should set type to Expense for all parsed rows', async () => {
    const csv = `Kirjauspäivä;Määrä EUROA;Saaja;Viesti
2026-04-10;-45,67;Amazon;Purchase`;

    const result = await parseOPBank(csv);

    expect(result[0].type).toBe('Expense');
  });

  it('should handle non-breaking spaces in amounts', async () => {
    const csv = `Kirjauspäivä;Määrä EUROA;Saaja;Viesti
2026-04-10;-1 000,50;Store;Purchase`;

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

  it('should skip incoming MobilePay (positive amount = income)', async () => {
    const csv = `Kirjauspäivä;Määrä EUROA;Saaja/Maksaja;Viesti
2026-05-01;+25,00;MobilePay;SEPA INSTANT CREDIT TRANSFER SCIDABAFIHHFFHODH3PVI1B Message: MobilePay Hieu Nguyen Dinh DABAFIHHXXX`;

    const result = await parseOPBank(csv);

    expect(result).toHaveLength(0);
  });

  it('should parse outgoing MobilePay (negative amount = expense) with correct merchant', async () => {
    const csv = `Kirjauspäivä;Määrä EUROA;Saaja/Maksaja;Viesti
2026-05-03;-15,00;Erika Virtanen;MobilePay`;

    const result = await parseOPBank(csv);

    expect(result[0].merchant).toBe('Erika Virtanen');
    expect(result[0].type).toBe('Expense');
  });

  it('should parse English-format OP Bank CSV (new export format)', async () => {
    const csv = `"EntryDate";"ValueDate";"Amount EUR";"Code";"Description";"Recipient/Payer";"Message";"Filing id"
"2026-08-03";"2026-08-03";-140,80;"106";"BANK TRANSFER";"As Oy Matela";"ref=00000000000000010003";"20211017/593619/0P9103"
"2026-08-03";"2026-08-03";-6,75;"162";"CARD PAYMENT";"MOB.PAY*THI MAI TRA HELSINKI";"";"20260803/5EQEO3/992297"`;

    const result = await parseOPBank(csv);

    expect(result).toHaveLength(2);
    expect(result[0].account).toBe('OP Bank');
    expect(result[0].merchant).toBe('As Oy Matela');
    expect(result[0].amount).toBe(-140.80);
    expect(result[1].merchant).toBe('MOB.PAY*THI MAI TRA HELSINKI');
  });

  it('should skip income rows in English-format OP CSV', async () => {
    const csv = `"EntryDate";"ValueDate";"Amount EUR";"Code";"Description";"Recipient/Payer";"Message";"Filing id"
"2026-08-01";"2026-08-01";4,00;"506";"BANK TRANSFER";"VIPPS MOBILEPAY AS,";"SEPA INSTANT CREDIT TRANSFER Message: MobilePay Vinh Phuc Doan DABAFIHHXXX";"20260801/5OPF00/043313"
"2026-08-03";"2026-08-03";380,45;"521";"BENEFIT";"Kansaneläkelaitos";"Message: ASUMISTUKI 380,45 E/KK";"20260730/5UTH00/103033"
"2026-08-03";"2026-08-03";-140,80;"106";"BANK TRANSFER";"As Oy Matela";"ref=00000000000000010003";"20211017/593619/0P9103"`;

    const result = await parseOPBank(csv);

    expect(result).toHaveLength(1);
    expect(result[0].merchant).toBe('As Oy Matela');
  });
});
