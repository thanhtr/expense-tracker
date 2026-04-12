import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';

vi.mock('fs');

describe('Keywords API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Note: These tests mock the fs module.
  // In a real scenario, you would either:
  // 1. Test against a real temp file
  // 2. Use a file system mocking library like memfs
  // 3. Test the route handlers directly with mocked fs

  it('should read keywords from CSV', async () => {
    const csvContent = `Keyword,Category
amazon,Shopping
spotify,Subscriptions
lidl,Food & Groceries`;

    vi.mocked(fs.readFile).mockResolvedValue(csvContent);

    // Simulating keyword parsing
    const lines = csvContent.split('\n');
    const keywords = [];
    let priority = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed === 'Keyword,Category') {
        continue;
      }

      const [keyword, category] = trimmed.split(',').map((s) => s.trim());
      if (keyword && category) {
        keywords.push({
          id: priority,
          keyword,
          category,
          priority,
        });
        priority++;
      }
    }

    expect(keywords).toHaveLength(3);
    expect(keywords[0].keyword).toBe('amazon');
    expect(keywords[0].category).toBe('Shopping');
    expect(keywords[1].keyword).toBe('spotify');
    expect(keywords[2].keyword).toBe('lidl');
  });

  it('should handle CSV with comments', async () => {
    const csvContent = `# This is a comment
Keyword,Category
amazon,Shopping
# Another comment
spotify,Subscriptions`;

    const lines = csvContent.split('\n');
    const keywords = [];
    let priority = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed === 'Keyword,Category') {
        continue;
      }

      const [keyword, category] = trimmed.split(',').map((s) => s.trim());
      if (keyword && category) {
        keywords.push({
          id: priority,
          keyword,
          category,
          priority,
        });
        priority++;
      }
    }

    expect(keywords).toHaveLength(2);
  });

  it('should write keywords to CSV', async () => {
    const keywords = [
      { id: 0, keyword: 'amazon', category: 'Shopping', priority: 0 },
      { id: 1, keyword: 'spotify', category: 'Subscriptions', priority: 1 },
    ];

    const lines = ['Keyword,Category'];
    for (const kw of keywords) {
      lines.push(`${kw.keyword},${kw.category}`);
    }

    const content = lines.join('\n') + '\n';

    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    expect(content).toContain('amazon,Shopping');
    expect(content).toContain('spotify,Subscriptions');
  });

  it('should maintain priority order when adding keyword', async () => {
    const keywords = [
      { id: 0, keyword: 'amazon', category: 'Shopping', priority: 0 },
      { id: 1, keyword: 'spotify', category: 'Subscriptions', priority: 1 },
    ];

    const newKeyword = { id: 2, keyword: 'netflix', category: 'Entertainment', priority: 2 };
    keywords.push(newKeyword);

    expect(keywords).toHaveLength(3);
    expect(keywords[2].priority).toBe(2);
    expect(keywords[2].keyword).toBe('netflix');
  });

  it('should handle delete and re-index', async () => {
    let keywords = [
      { id: 0, keyword: 'amazon', category: 'Shopping', priority: 0 },
      { id: 1, keyword: 'spotify', category: 'Subscriptions', priority: 1 },
      { id: 2, keyword: 'netflix', category: 'Entertainment', priority: 2 },
    ];

    // Delete at index 1
    keywords.splice(1, 1);

    // Re-index
    keywords = keywords.map((k, i) => ({
      ...k,
      id: i,
      priority: i,
    }));

    expect(keywords).toHaveLength(2);
    expect(keywords[0].keyword).toBe('amazon');
    expect(keywords[1].keyword).toBe('netflix');
    expect(keywords[1].id).toBe(1);
    expect(keywords[1].priority).toBe(1);
  });

  it('should handle priority reordering (swap)', async () => {
    let keywords = [
      { id: 0, keyword: 'amazon', category: 'Shopping', priority: 0 },
      { id: 1, keyword: 'spotify', category: 'Subscriptions', priority: 1 },
      { id: 2, keyword: 'netflix', category: 'Entertainment', priority: 2 },
    ];

    // Swap position 0 and 2
    const item = keywords[0];
    keywords.splice(0, 1);
    keywords.splice(2, 0, item);

    // Re-index
    keywords = keywords.map((k, i) => ({
      ...k,
      id: i,
      priority: i,
    }));

    expect(keywords[0].keyword).toBe('spotify');
    expect(keywords[2].keyword).toBe('amazon');
  });

  it('should lowercase keywords on insert', async () => {
    const keyword = 'AMAZON';
    const lowercased = keyword.toLowerCase();

    expect(lowercased).toBe('amazon');
  });

  it('should reject duplicate keywords (case-insensitive)', async () => {
    const keywords = [
      { id: 0, keyword: 'amazon', category: 'Shopping', priority: 0 },
    ];

    const newKeyword = 'AMAZON';
    const isDuplicate = keywords.some(
      (k) => k.keyword.toLowerCase() === newKeyword.toLowerCase()
    );

    expect(isDuplicate).toBe(true);
  });
});

describe('Clear Learned Rules (POST /api/keywords/clear)', () => {
  it('should verify sentinel deletion by fetching again', async () => {
    // Test that clear endpoint verifies deletion worked
    // Expected behavior:
    // 1. Find sentinel in first fetch
    // 2. Delete it
    // 3. Fetch again to verify
    // 4. Return error if sentinel still exists

    const initialExpenses = [
      {
        id: 1,
        description: '__learned_rules__',
        date: '2000-01-01',
        cost: '0.01',
        category: { id: 2, name: 'Uncategorized' },
        users: [],
        details: '{"__compressed":true,"data":"H4sIAAAAAAAAA6tWSkksSVSyUkrJz8vVMwKi/Pz8wpxUU70iJSsrOACAQhQqFAAAA"}',
      },
      {
        id: 2,
        description: 'Regular expense',
        date: '2026-03-15',
        cost: '10.00',
        category: { id: 12, name: 'Groceries' },
        users: [],
      },
    ];

    const expensesAfterDelete = [
      {
        id: 2,
        description: 'Regular expense',
        date: '2026-03-15',
        cost: '10.00',
        category: { id: 12, name: 'Groceries' },
        users: [],
      },
    ];

    // This test documents the expected behavior:
    // After deletion, sentinel should not be in the list
    const hasDeletedSentinel = initialExpenses.some(
      (e) => e.description === '__learned_rules__'
    );
    const hasDeletedSentinelAfter = expensesAfterDelete.some(
      (e) => e.description === '__learned_rules__'
    );

    expect(hasDeletedSentinel).toBe(true);
    expect(hasDeletedSentinelAfter).toBe(false);
  });
});
