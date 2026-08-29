'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface HouseholdMember {
  id: number;
  name: string;
  slug: string;
}

export function HouseholdManager() {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    fetch('/api/household-members')
      .then(r => r.json())
      .then(setMembers)
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/household-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        toast.error(body.error ?? 'Failed to add member');
        return;
      }
      const member = await res.json() as HouseholdMember;
      setMembers(prev => [...prev, member]);
      setNewName('');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (m: HouseholdMember) => {
    setEditingId(m.id);
    setEditName(m.name);
  };

  const handleRename = async (id: number) => {
    if (!editName.trim()) return;
    const res = await fetch(`/api/household-members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim() }),
    });
    if (res.ok) {
      const updated = await res.json() as HouseholdMember;
      setMembers(prev => prev.map(m => m.id === id ? updated : m));
      setEditingId(null);
    } else {
      toast.error('Failed to rename member');
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Remove ${name} from the household?`)) return;
    const res = await fetch(`/api/household-members/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setMembers(prev => prev.filter(m => m.id !== id));
    } else {
      toast.error('Failed to remove member');
    }
  };

  if (loading) {
    return <div className="h-24 animate-pulse rounded-lg bg-[var(--surface-2)]" />;
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-[var(--border-soft)]">
        {members.map(m => (
          <li key={m.id} className="flex items-center justify-between py-3 gap-3">
            {editingId === m.id ? (
              <form
                onSubmit={e => { e.preventDefault(); handleRename(m.id); }}
                className="flex items-center gap-2 flex-1"
              >
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="flex-1 px-2 py-1 text-[13px] border border-[var(--border-soft)] rounded bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                <span className="text-[11px] text-[var(--fg-3)] font-mono shrink-0">{m.slug}</span>
                <button type="submit" className="text-[12px] font-medium text-[var(--accent)] px-2 py-1">Save</button>
                <button type="button" onClick={() => setEditingId(null)} className="text-[12px] text-[var(--fg-3)] px-2 py-1">Cancel</button>
              </form>
            ) : (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[14px] font-medium">{m.name}</span>
                  <span className="text-[11px] text-[var(--fg-3)] font-mono">{m.slug}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(m)}
                    className="text-[12px] text-[var(--fg-3)] hover:text-[var(--foreground)] px-2 py-1 rounded"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => handleDelete(m.id, m.name)}
                    className="text-[12px] text-[var(--fg-3)] hover:text-red-500 px-2 py-1 rounded"
                  >
                    Remove
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
        {members.length === 0 && (
          <li className="py-4 text-[13px] text-[var(--fg-3)]">No members yet.</li>
        )}
      </ul>
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Member name (e.g. Alex)"
          className="flex-1 px-3 py-2 text-[13px] border border-[var(--border-soft)] rounded-md bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={adding || !newName.trim()}
          className="px-4 py-2 text-[13px] font-medium bg-[var(--accent)] text-white rounded-md disabled:opacity-40 hover:opacity-90"
        >
          {adding ? 'Adding…' : 'Add'}
        </button>
      </form>
      <p className="text-[11px] text-[var(--fg-3)]">
        The identifier shown in grey (e.g. <span className="font-mono">tung</span>) is fixed and stored on transactions — only the display name can be changed.
      </p>
    </div>
  );
}
