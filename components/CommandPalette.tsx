'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Result {
  id: number;
  merchant: string;
  amount: number;
  category: string;
  date: string;
  type: string;
}

function fmtAmount(amount: number, type: string) {
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat('fi-FI', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(abs).replace(/ /g, ' ');
  return type === 'Income' ? `+${formatted}` : `-${formatted}`;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults([]);
    setCursor(0);
  }, []);

  // ⌘K / Ctrl+K to open
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => {
          if (o) { close(); return false; }
          return true;
        });
      }
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close]);

  // Focus input when opened
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) { setResults([]); setLoading(false); return; }

    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ merchant: query.trim(), limit: '10' });
        const res = await fetch(`/api/transactions?${params}`);
        if (res.ok) {
          const data = await res.json() as { transactions: Result[] };
          setResults(data.transactions ?? []);
          setCursor(0);
        }
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, open]);

  function selectResult(r: Result) {
    const params = new URLSearchParams({ merchant: r.merchant });
    router.push(`/transactions?${params}`);
    close();
  }

  function onKeyDownInput(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor(c => Math.min(c + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(c => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      const r = results[cursor];
      if (r) selectResult(r);
      else if (query.trim()) {
        const params = new URLSearchParams({ merchant: query.trim() });
        router.push(`/transactions?${params}`);
        close();
      }
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open search (⌘K)"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[13px] text-fg-2 hover:text-foreground hover:bg-surface-2 border border-border focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <span className="hidden md:inline">Search</span>
        <kbd className="hidden md:inline text-[11px] font-mono text-fg-3 bg-surface-2 border border-border rounded px-1 py-0.5 ml-1">⌘K</kbd>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
        onClick={close}
        aria-hidden="true"
      />

      {/* Palette */}
      <div
        role="dialog"
        aria-label="Search transactions"
        aria-modal="true"
        className="fixed left-1/2 top-[10vh] z-50 w-full max-w-lg -translate-x-1/2 rounded-xl border border-border bg-surface shadow-2xl"
      >
        {/* Input row */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <svg className="w-4 h-4 shrink-0 text-fg-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDownInput}
            placeholder="Search transactions by merchant…"
            className="flex-1 bg-transparent text-[14px] text-foreground placeholder:text-fg-3 outline-none"
          />
          {loading && (
            <span className="text-[11px] text-fg-3 animate-pulse">Searching…</span>
          )}
          <kbd
            className="text-[11px] font-mono text-fg-3 bg-surface-2 border border-border rounded px-1.5 py-0.5 cursor-pointer"
            onClick={close}
          >
            Esc
          </kbd>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
            {results.map((r, i) => (
              <li
                key={r.id}
                role="option"
                aria-selected={i === cursor}
                onClick={() => selectResult(r)}
                onMouseEnter={() => setCursor(i)}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer text-[13px] ${
                  i === cursor ? 'bg-surface-2' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-foreground truncate">{r.merchant}</div>
                  <div className="text-[11px] text-fg-3">{r.category} · {r.date.slice(0, 10)}</div>
                </div>
                <div className={`font-mono text-[13px] shrink-0 ${
                  r.type === 'Income' ? 'text-[var(--pos)]' : 'text-[var(--neg)]'
                }`}>
                  {fmtAmount(r.amount, r.type)}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* No results hint */}
        {!loading && query.trim() && results.length === 0 && (
          <div className="px-4 py-6 text-center text-[13px] text-fg-3">
            No transactions found for &ldquo;{query}&rdquo;
          </div>
        )}

        {/* Footer hint */}
        {results.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[11px] text-fg-3">
            <span><kbd className="font-mono bg-surface-2 border border-border rounded px-1">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono bg-surface-2 border border-border rounded px-1">↵</kbd> open in Transactions</span>
          </div>
        )}
      </div>
    </>
  );
}
