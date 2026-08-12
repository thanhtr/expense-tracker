-- Fix incoming MobilePay transactions where OP Bank set merchant to "MobilePay"
-- and buried the sender name in the note as:
--   "SEPA INSTANT CREDIT TRANSFER <ref> Message: MobilePay <Name> <BIC>"
-- Extract the name and write it to the merchant column.
UPDATE "Transaction"
SET merchant = (
  regexp_match(note, 'Message:\s+MobilePay\s+(.+?)\s+[A-Z]{6}[A-Z0-9]{2,5}$')
)[1]
WHERE merchant = 'MobilePay'
  AND note ~ 'Message:\s+MobilePay\s+.+\s+[A-Z]{6}[A-Z0-9]{2,5}$';
