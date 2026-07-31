'use client';

import { useEffect, useState } from 'react';

interface Keyword {
  id: number;
  keyword: string;
  category: string;
  priority: number;
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

  const handleUpdatePriority = async (id: number, direction: 'up' | 'down') => {
    const index = keywords.findIndex(k => k.id === id);
    if (index === -1) return;

    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === keywords.length - 1) return;

    const newKeywords = [...keywords];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    // Swap priorities
    const temp = newKeywords[index].priority;
    newKeywords[index].priority = newKeywords[targetIndex].priority;
    newKeywords[targetIndex].priority = temp;

    setKeywords(newKeywords);

    // Update both
    try {
      await Promise.all([
        fetch(`/api/keywords/${newKeywords[index].id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keyword: newKeywords[index].keyword,
            category: newKeywords[index].category,
            priority: newKeywords[index].priority
          })
        }),
        fetch(`/api/keywords/${newKeywords[targetIndex].id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keyword: newKeywords[targetIndex].keyword,
            category: newKeywords[targetIndex].category,
            priority: newKeywords[targetIndex].priority
          })
        })
      ]);
    } catch (error) {
      console.error('Failed to update priority:', error);
      fetchKeywords(); // Refresh on error
    }
  };

  const handleUpdateCategory = async (id: number, newCat: string) => {
    const kw = keywords.find(k => k.id === id);
    if (!kw) return;
    try {
      const res = await fetch(`/api/keywords/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw.keyword, category: newCat, priority: kw.priority }),
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
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Seed Rules from History</h2>
        <p className="text-sm text-gray-600 mb-4">
          Analyze all categorized transactions in Splitwise and learn rules automatically.
          This will merge new rules with existing keywords (existing rules take precedence).
        </p>
        <button
          onClick={handleBootstrap}
          disabled={bootstrapping}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400"
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
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Add New Keyword</h2>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Keyword</label>
              <input
                type="text"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder="e.g., 'spotify'"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Keywords ({keywords.length})</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700">Keyword</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700">Priority</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keywords.map((keyword) => (
                <tr key={keyword.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">{keyword.keyword}</td>
                  <td className="px-6 py-3 text-sm">
                    <select
                      value={keyword.category}
                      onChange={(e) => handleUpdateCategory(keyword.id, e.target.value)}
                      className="cursor-pointer rounded text-sm border border-transparent px-2 py-1 bg-gray-100 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-600">{keyword.priority}</td>
                  <td className="px-6 py-3 text-sm">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdatePriority(keyword.id, 'up')}
                        disabled={keywords[0].id === keyword.id}
                        className="text-blue-600 hover:text-blue-800 disabled:text-gray-300 font-medium"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => handleUpdatePriority(keyword.id, 'down')}
                        disabled={keywords[keywords.length - 1].id === keyword.id}
                        className="text-blue-600 hover:text-blue-800 disabled:text-gray-300 font-medium"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => handleDelete(keyword.id)}
                        className="text-red-600 hover:text-red-800 font-medium"
                      >
                        Delete
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
