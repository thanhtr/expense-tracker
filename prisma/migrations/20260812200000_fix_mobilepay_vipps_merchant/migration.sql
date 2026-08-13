-- Fix incoming MobilePay transactions where OP Bank set merchant to "VIPPS MOBILEPAY AS,"
-- (the actual Saaja/Maksaja value in OP Bank CSVs for incoming MobilePay).
-- The previous migration only targeted merchant = 'MobilePay' and missed these rows.
-- Extract the actual sender name from the SEPA note field.
BEGIN;

UPDATE "Transaction"
SET merchant = (
  regexp_match(note, 'Message:\s+MobilePay\s+(.+?)\s+[A-Z]{6}[A-Z0-9]{2,5}$')
)[1]
WHERE merchant ILIKE '%mobilepay%'
  AND note ~ 'Message:\s+MobilePay\s+.+\s+[A-Z]{6}[A-Z0-9]{2,5}$';

COMMIT;
