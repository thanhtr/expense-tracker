import { describe, it, expect } from 'vitest';
import { makeDedupKey, buildExistingKeys, parseExpenseDetails } from '../../lib/splitwise';

describe('Splitwise utilities', () => {
  describe('makeDedupKey', () => {
    it('should create dedup key from date, merchant, and cost', () => {
      const key = makeDedupKey('2026-04-10', 'Amazon', '45.67');
      expect(key).toBe('2026-04-10|Amazon|45.67');
    });

    it('should preserve exact merchant name', () => {
      const key = makeDedupKey('2026-04-10', 'Starbucks Coffee Shop #123', '5.50');
      expect(key).toBe('2026-04-10|Starbucks Coffee Shop #123|5.50');
    });

    it('should preserve cost precision', () => {
      const key = makeDedupKey('2026-04-10', 'Item', '100.00');
      expect(key).toBe('2026-04-10|Item|100.00');
    });
  });

  describe('buildExistingKeys', () => {
    it('should build set of dedup keys from expenses array', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const expenses: any[] = [
        {
          id: 1,
          date: '2026-04-10T12:00:00Z',
          description: 'Amazon',
          cost: '45.67',
          deleted_at: null,
        },
        {
          id: 2,
          date: '2026-04-11T12:00:00Z',
          description: 'Starbucks',
          cost: '5.50',
          deleted_at: null,
        },
      ];

      const keys = buildExistingKeys(expenses);
      expect(keys.has('2026-04-10|Amazon|45.67')).toBe(true);
      expect(keys.has('2026-04-11|Starbucks|5.50')).toBe(true);
    });

    it('should skip deleted expenses', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const expenses: any[] = [
        {
          id: 1,
          date: '2026-04-10T12:00:00Z',
          description: 'Amazon',
          cost: '45.67',
          deleted_at: null,
        },
        {
          id: 2,
          date: '2026-04-11T12:00:00Z',
          description: 'Deleted Item',
          cost: '100.00',
          deleted_at: '2026-04-12T12:00:00Z',
        },
      ];

      const keys = buildExistingKeys(expenses);
      expect(keys.has('2026-04-10|Amazon|45.67')).toBe(true);
      expect(keys.has('2026-04-11|Deleted Item|100.00')).toBe(false);
    });

    it('should return empty set for empty array', () => {
      const keys = buildExistingKeys([]);
      expect(keys.size).toBe(0);
    });
  });

  describe('parseExpenseDetails', () => {
    it('should parse valid JSON details string', () => {
      const details = JSON.stringify({ account: 'OP Bank', category: 'Food & Dining' });
      const result = parseExpenseDetails(details);
      expect(result).toEqual({ account: 'OP Bank', category: 'Food & Dining' });
    });

    it('should parse details with only account field', () => {
      const details = JSON.stringify({ account: 'Amex' });
      const result = parseExpenseDetails(details);
      expect(result).toEqual({ account: 'Amex' });
    });

    it('should parse details with only category field', () => {
      const details = JSON.stringify({ category: 'Transport' });
      const result = parseExpenseDetails(details);
      expect(result).toEqual({ category: 'Transport' });
    });

    it('should return empty object for malformed JSON', () => {
      const result = parseExpenseDetails('not valid json');
      expect(result).toEqual({});
    });

    it('should return empty object for undefined input', () => {
      const result = parseExpenseDetails(undefined);
      expect(result).toEqual({});
    });

    it('should return empty object for empty string', () => {
      const result = parseExpenseDetails('');
      expect(result).toEqual({});
    });

    it('should ignore extra fields in details JSON', () => {
      const details = JSON.stringify({
        account: 'OP Bank',
        category: 'Food & Dining',
        extraField: 'ignored',
      });
      const result = parseExpenseDetails(details);
      expect(result).toEqual({ account: 'OP Bank', category: 'Food & Dining', extraField: 'ignored' });
    });
  });
});
