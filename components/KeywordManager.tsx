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
  const [newKeyword, setNewKeyword] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);

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

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
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
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="e.g., 'Subscriptions'"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
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
                  <td className="px-6 py-3 text-sm text-gray-700">{keyword.category}</td>
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
