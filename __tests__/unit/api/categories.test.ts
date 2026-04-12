import { describe, it, expect } from 'vitest';
import { CATEGORY_MAP } from '../../../lib/constants';

describe('GET /api/categories', () => {
  it('should return a sorted list of all category names', () => {
    const categories = Object.keys(CATEGORY_MAP).sort();

    expect(categories).toContain('Clothing');
    expect(categories).toContain('Dining out');
    expect(categories).toContain('Transportation');
    expect(Array.isArray(categories)).toBe(true);
  });

  it('should return non-empty category list', () => {
    const categories = Object.keys(CATEGORY_MAP);
    expect(categories.length).toBeGreaterThan(0);
  });

  it('should include all expected categories from CATEGORY_MAP', () => {
    const expectedCategories = [
      'Entertainment',
      'Dining out',
      'Groceries',
      'Transportation',
      'Plane',
      'Home',
      'Utilities',
      'Rent',
      'Mortgage',
      'Insurance',
      'General',
    ];

    const categories = Object.keys(CATEGORY_MAP);

    expectedCategories.forEach((cat) => {
      expect(categories).toContain(cat);
    });
  });

  it('should not have duplicate category names', () => {
    const categories = Object.keys(CATEGORY_MAP);
    const uniqueCategories = new Set(categories);

    expect(categories.length).toBe(uniqueCategories.size);
  });
});
