import { describe, it, expect } from 'vitest';
import { parseFinnishAmount } from '../../../lib/parsers/utils';

describe('parseFinnishAmount', () => {
  it('should parse Finnish decimal format (comma as decimal separator)', () => {
    expect(parseFinnishAmount('10,50')).toBe(10.5);
    expect(parseFinnishAmount('100,99')).toBe(100.99);
  });

  it('should parse amounts without decimals', () => {
    expect(parseFinnishAmount('100')).toBe(100);
    expect(parseFinnishAmount('1000')).toBe(1000);
  });

  it('should strip non-breaking spaces (U+00A0)', () => {
    // Non-breaking space in 1 000,50 format
    expect(parseFinnishAmount('1\u00A0000,50')).toBe(1000.5);
    expect(parseFinnishAmount('10\u00A0000')).toBe(10000);
  });

  it('should handle regular spaces', () => {
    expect(parseFinnishAmount('1 000,50')).toBe(1000.5);
  });

  it('should return NaN for invalid input', () => {
    expect(parseFinnishAmount('not a number')).toBeNaN();
    expect(parseFinnishAmount('')).toBeNaN();
  });

  it('should handle negative amounts', () => {
    expect(parseFinnishAmount('-10,50')).toBe(-10.5);
    expect(parseFinnishAmount('-100')).toBe(-100);
  });

  it('should preserve scientific notation edge cases', () => {
    // This tests the actual behavior - parseFloat handles it
    const result = parseFinnishAmount('1e2');
    expect(result).toBe(100);
  });
});
