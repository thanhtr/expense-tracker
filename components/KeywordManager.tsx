'use client';

import { useEffect, useState } from 'react';

interface Keyword {
  id: number;
  keyword: string;
  category: string;
  count?: number;
}

export function KeywordManager() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapMessage, setBootstrapMessage] = useState('');
  const [search, setSearch] = useState('');

  const fetchKeywords = async () => {
    try {
      const res = await fetch('/api/keywords');
      if (res.ok) {
        const data = await res.json();
        setKeywords(data);
      }
    } catch (error) {
      console.error('Failed to fetch keywords:', error);
      setError('Failed to load keywords');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeywords();
    fetch('/api/categories')
      .then(r => r.ok ? r.json() : { categories: [] })
      .then(data => setCategories(data.categories ?? []))
      .catch(() => {});
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim() || !newCategory.trim()) {
      setError('Please fill in both fields');
      return;
    }

    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: newKeyword.trim(),
          category: newCategory.trim()
        })
      });

      if (res.ok) {
        const keyword = await res.json();
        setKeywords([...keywords, keyword]);
        setNewKeyword('');
        setNewCategory('');
        setError('');
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to add keyword');
      }
    } catch (error) {
      console.error('Failed to add keyword:', error);
      setError('An error occurred');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this keyword?')) return;

    try {
      const res = await fetch(`/api/keywords/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setKeywords(keywords.filter(k => k.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete keyword:', error);
    }
  };

  const handleUpdateCategory = async (id: number, newCat: string) => {
    const kw = keywords.find(k => k.id === id);
    if (!kw) return;
    try {
      const res = await fetch(`/api/keywords/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw.keyword, category: newCat }),
      });
      if (res.ok) {
        setKeywords(prev => prev.map(k => k.id === id ? { ...k, category: newCat } : k));
      }
    } catch (err) {
      console.error('Failed to update category:', err);
    }
  };

  const handleBootstrap = async () => {
    setBootstrapping(true);
    setBootstrapMessage('');
    try {
      const res = await fetch('/api/keywords/bootstrap', {
        method: 'POST'
      });

      if (res.ok) {
        const data = await res.json();
        setBootstrapMessage(`✓ Bootstrapped ${data.learned} rules from history (${data.skipped} skipped)`);
        // Refresh keywords after bootstrap
        await fetchKeywords();
      } else {
        const data = await res.json();
        setBootstrapMessage(`✗ Bootstrap failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Bootstrap failed:', error);
      setBootstrapMessage('✗ Bootstrap failed');
    } finally {
      setBootstrapping(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Bootstrap Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">Seed Rules from History</h2>
        <p className="text-sm text-fg-2 mb-4">
          Analyze all categorized transactions in Splitwise and learn rules automatically.
          This will merge new rules with existing keywords (existing rules take precedence).
        </p>
        <button
          onClick={handleBootstrap}
          disabled={bootstrapping}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {bootstrapping ? 'Bootstrapping...' : 'Bootstrap from History'}
        </button>
        {bootstrapMessage && (
          <div className={`mt-3 p-3 rounded text-sm ${bootstrapMessage.startsWith('✓') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {bootstrapMessage}
          </div>
        )}
      </div>

      {/* Add New Keyword */}
      <div className="bg-surface rounded-lg border border-border-soft p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Add New Keyword</h2>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="block text-sm font-medium text-fg-2 mb-1">Keyword</label>
              <input
                type="text"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder="e.g., 'spotify'"
                className="w-full px-3 py-2 border border-border-soft rounded-md bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-sm font-medium text-fg-2 mb-1">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full px-3 py-2 border border-border-soft rounded-md bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select category…</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="sm:col-span-1 flex items-end">
              <button
                type="submit"
                className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
              >
                Add Keyword
              </button>
            </div>
          </div>
        </form>
        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
      </div>

      {/* Keywords List */}
      <div className="bg-surface rounded-lg border border-border-soft overflow-hidden">
        <div className="px-6 py-4 bg-surface-2 border-b border-border-soft">
          <h2 className="text-lg font-semibold text-foreground">Keywords ({keywords.length})</h2>
          <p className="text-xs text-fg-3 mt-1">Rules match by longest keyword — more specific rules win automatically.</p>
          <div className="mt-3 flex items-center gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search keywords or categories…"
              className="w-64 px-3 py-1.5 border border-border-soft rounded-md bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {search && (
              <span className="text-xs text-fg-3">
                {keywords.filter(k => k.keyword.toLowerCase().includes(search.toLowerCase()) || k.category.toLowerCase().includes(search.toLowerCase())).length} of {keywords.length}
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-2 border-b border-border-soft">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-fg-2">Keyword</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-fg-2">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-fg-2">Matches</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-fg-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keywords.filter(k => !search || k.keyword.toLowerCase().includes(search.toLowerCase()) || k.category.toLowerCase().includes(search.toLowerCase())).map((keyword) => (
                <tr key={keyword.id} className="border-b border-border-soft hover:bg-surface-2">
                  <td className="px-6 py-3 text-sm font-medium text-foreground">{keyword.keyword}</td>
                  <td className="px-6 py-3 text-sm">
                    <select
                      value={keyword.category}
                      onChange={(e) => handleUpdateCategory(keyword.id, e.target.value)}
                      className="cursor-pointer rounded text-sm border border-transparent px-2 py-1 bg-surface-2 hover:bg-[var(--border)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className={`px-6 py-3 text-sm ${!keyword.count || keyword.count < 5 ? 'text-fg-3' : 'text-fg-2'}`}>
                    {keyword.count ?? 1}
                  </td>
                  <td className="px-6 py-3 text-sm">
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleDelete(keyword.id)}
                        title="Delete keyword"
                        className="p-1.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
