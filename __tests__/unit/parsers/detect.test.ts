import { describe, it, expect } from 'vitest';
import { detectBank } from '../../../lib/parsers/detect';

describe('detectBank', () => {
  it('should detect Finnish-format OP Bank CSV', () => {
    const csv = `Kirjauspäivä;Arvopäivä;Määrä EUROA;Selite;Saaja/Maksaja;Viesti
2026-04-10;2026-04-10;-45,67;KORTTIMAKSU;Amazon;Purchase`;
    expect(detectBank(csv)).toBe('op');
  });

  it('should detect English-format OP Bank CSV (new export format)', () => {
    const csv = `"EntryDate";"ValueDate";"Amount EUR";"Code";"Description";"Recipient/Payer";"Message";"Filing id"
"2026-08-03";"2026-08-03";-140,80;"106";"BANK TRANSFER";"As Oy Matela";"ref=00000";"20211017/0P9103"`;
    expect(detectBank(csv)).toBe('op');
  });

  it('should detect OP Bank by entrydate column alone', () => {
    const csv = `"EntryDate";"Amount";"Description"
"2026-08-03";-45.00;"Store"`;
    expect(detectBank(csv)).toBe('op');
  });

  it('should detect Finnair CSV', () => {
    const csv = `Date of payment,Location of purchase,Cardholder,Transaction amount,Currency,Amount,Currency
2026-08-27,VFI*LIENFATH OY,TRINH,-53.70,EUR,-53.70,EUR`;
    expect(detectBank(csv)).toBe('finnair');
  });

  it('should detect Amex CSV by päivämäärä', () => {
    const csv = `Päivämäärä,Kuvaus,Kortinhaltija,Tili,Summa
08/27/2026,K-supermarket,TRINH,-01002,"29,60"`;
    expect(detectBank(csv)).toBe('amex');
  });

  it('should detect Amex CSV by kuvaus', () => {
    const csv = `Date,Kuvaus,Amount
08/27/2026,Store,-29.60`;
    expect(detectBank(csv)).toBe('amex');
  });

  it('should NOT misidentify OP English CSV as Amex', () => {
    // OP header has "description" and "date" (inside entrydate/valuedate),
    // which the old Amex catch-all (date && description) would have triggered
    const csv = `"EntryDate";"ValueDate";"Amount EUR";"Code";"Description";"Recipient/Payer";"Message";"Filing id"
"2026-08-03";"2026-08-03";380,45;"521";"BENEFIT";"Kansaneläkelaitos";"";""`;
    expect(detectBank(csv)).toBe('op');
    expect(detectBank(csv)).not.toBe('amex');
  });

  it('should return null for unknown CSV format', () => {
    const csv = `Transaction,Value,Date
Store,-10.00,2026-01-01`;
    expect(detectBank(csv)).toBeNull();
  });
});
