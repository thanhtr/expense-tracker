'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface Category {
  id: number;
  name: string;
  sortOrder: number;
}

export function CategoryManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    fetch('/api/categories?full=1')
      .then(r => r.ok ? r.json() : null)
      .then((d: { categories: Category[] } | null) => {
        if (d) setCategories(d.categories);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const cat = await res.json() as Category;
        setCategories(prev => [...prev, cat]);
        setNewName('');
        toast.success(`Category "${name}" added`);
      } else {
        const err = await res.json() as { error: string };
        toast.error(err.error ?? 'Failed to add');
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(cat: Category) {
    const res = await fetch(`/api/categories/${cat.id}`, { method: 'DELETE' });
    if (res.ok) {
      setCategories(prev => prev.filter(c => c.id !== cat.id));
      toast.success(`"${cat.name}" removed`);
    } else {
      toast.error('Failed to delete');
    }
  }

  async function handleRename(cat: Category) {
    const name = editName.trim();
    if (!name || name === cat.name) { setEditingId(null); return; }
    const res = await fetch(`/api/categories/${cat.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const updated = await res.json() as Category;
      setCategories(prev => prev.map(c => c.id === cat.id ? updated : c));
      setEditingId(null);
      toast.success(`Renamed to "${name}"`);
    } else {
      toast.error('Failed to rename');
    }
  }

  if (loading) return (
    <div className="dash-card animate-pulse">
      <div className="p-5 space-y-3">
        {[70, 55, 80, 60, 45].map(w => (
          <div key={w} className="flex items-center justify-between">
            <div className="h-4 bg-[var(--border)] rounded" style={{ width: `${w}%` }} />
            <div className="h-6 w-16 bg-[var(--border)] rounded" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="dash-card">
      <div className="p-[16px_20px_12px] border-b border-[var(--border)]">
        <h2 className="text-[13px] font-semibold m-0">Categories</h2>
        <div className="text-[12px] text-[var(--fg-3)]">{categories.length} categories · click a name to rename</div>
      </div>

      <ul className="divide-y divide-[var(--border)]">
        {categories.map(cat => (
          <li key={cat.id} className="flex items-center justify-between gap-3 px-5 py-3">
            {editingId === cat.id ? (
              <input
                autoFocus
                className="flex-1 text-[13px] border border-[var(--border-strong)] rounded px-2 py-1 bg-[var(--surface)] text-[var(--foreground)]"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={() => handleRename(cat)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRename(cat);
                  if (e.key === 'Escape') setEditingId(null);
                }}
              />
            ) : (
              <button
                className="flex-1 text-left text-[13px] text-[var(--foreground)] hover:text-[var(--accent)] truncate"
                onClick={() => { setEditingId(cat.id); setEditName(cat.name); }}
              >
                {cat.name}
              </button>
            )}
            <button
              onClick={() => handleDelete(cat)}
              className="text-[11px] text-[var(--fg-3)] hover:text-[oklch(0.5_0.2_25)] px-2 py-1 rounded hover:bg-[var(--surface-2)] flex-shrink-0"
              aria-label={`Delete ${cat.name}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleAdd} className="flex gap-2 p-4 border-t border-[var(--border)]">
        <input
          className="flex-1 text-[13px] border border-[var(--border)] rounded px-3 py-[6px] bg-[var(--surface)] text-[var(--foreground)] placeholder:text-[var(--fg-3)]"
          placeholder="New category name…"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          maxLength={100}
        />
        <button
          type="submit"
          disabled={adding || !newName.trim()}
          className="btn-ghost disabled:opacity-40"
        >
          Add
        </button>
      </form>
    </div>
  );
}
