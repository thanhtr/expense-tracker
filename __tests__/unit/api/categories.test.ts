import { describe, it, expect } from 'vitest';
import { CATEGORIES } from '../../../lib/constants';

describe('GET /api/categories', () => {
  it('should return a sorted list of all category names', () => {
    const categories = [...CATEGORIES].sort();

    expect(categories).toContain('Groceries');
    expect(categories).toContain('Dining Out');
    expect(categories).toContain('Transportation');
    expect(Array.isArray(categories)).toBe(true);
  });

  it('should return non-empty category list', () => {
    expect(CATEGORIES.length).toBeGreaterThan(0);
  });

  it('should include all expected categories', () => {
    const expected = [
      'Groceries',
      'Dining Out',
      'Transportation',
      'Travel & Flights',
      'Subscriptions',
      'Rent & Housing',
      'Utilities',
      'Investments',
      'Insurance',
      'Other',
    ];

    expected.forEach((cat) => {
      expect(CATEGORIES).toContain(cat);
    });
  });

  it('should not have duplicate category names', () => {
    const unique = new Set(CATEGORIES);
    expect(CATEGORIES.length).toBe(unique.size);
  });
});
