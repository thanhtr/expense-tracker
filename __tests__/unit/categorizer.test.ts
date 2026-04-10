import { describe, it, expect } from 'vitest';
import { categorize } from '../../lib/categorizer';

describe('categorize', () => {
  const keywords: Array<[string, string]> = [
    ['amazon', 'Shopping'],
    ['starbucks', 'Food & Dining'],
    ['whole foods', 'Food & Groceries'],
    ['uber', 'Transport'],
    ['spotify', 'Subscriptions'],
  ];

  it('should match exact keyword (case-insensitive)', () => {
    expect(categorize('Amazon Order', keywords)).toBe('Shopping');
    expect(categorize('AMAZON order', keywords)).toBe('Shopping');
    expect(categorize('amazon', keywords)).toBe('Shopping');
  });

  it('should match partial merchant name containing keyword', () => {
    expect(categorize('Starbucks Coffee #123', keywords)).toBe('Food & Dining');
    expect(categorize('Order from Whole Foods Market', keywords)).toBe('Food & Groceries');
  });

  it('should return empty string when no keyword matches', () => {
    expect(categorize('Random Store ABC', keywords)).toBe('');
    expect(categorize('Unknown Merchant', keywords)).toBe('');
  });

  it('should return first matching category when multiple keywords could match', () => {
    const multiKeywords: Array<[string, string]> = [
      ['store', 'General'],
      ['market', 'Food & Groceries'],
    ];
    // 'Whole Foods Market' - 'store' doesn't match, 'market' matches
    expect(categorize('Whole Foods Market', multiKeywords)).toBe('Food & Groceries');
  });

  it('should be case-insensitive for merchant name', () => {
    expect(categorize('SPOTIFY MONTHLY', keywords)).toBe('Subscriptions');
    expect(categorize('sPOTIFY monthly', keywords)).toBe('Subscriptions');
  });

  it('should handle empty merchant string', () => {
    expect(categorize('', keywords)).toBe('');
  });

  it('should handle empty keywords array', () => {
    expect(categorize('Amazon Order', [])).toBe('');
  });
});
