import { describe, it, expect } from 'vitest';
import { CATEGORY_MAP } from '../../../lib/constants';

describe('GET /api/categories', () => {
  it('should return a sorted list of all category names', () => {
    const categories = Object.keys(CATEGORY_MAP).sort();

    expect(categories).toContain('Shopping');
    expect(categories).toContain('Food & Dining');
    expect(categories).toContain('Transport');
    expect(Array.isArray(categories)).toBe(true);
  });

  it('should return categories in alphabetical order', () => {
    const categories = Object.keys(CATEGORY_MAP).sort();

    for (let i = 0; i < categories.length - 1; i++) {
      expect(categories[i].localeCompare(categories[i + 1])).toBeLessThanOrEqual(0);
    }
  });

  it('should include all expected categories from CATEGORY_MAP', () => {
    const expectedCategories = [
      'Entertainment',
      'Food & Dining',
      'Food & Groceries',
      'Dining Out',
      'Transport',
      'Travel',
      'Subscriptions',
      'Healthcare',
      'Fitness',
      'Hobbies',
      'Utilities',
      'Home',
      'Rent',
      'Shopping',
      'Personal Care',
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
