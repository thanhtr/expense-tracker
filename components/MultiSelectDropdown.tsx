'use client';

import { useEffect, useRef, useState } from 'react';

interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  id?: string;
}

export function MultiSelectDropdown({ label, options, selected, onChange, disabled, className, buttonClassName, id }: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter(o => o !== opt) : [...selected, opt]);
  };

  const summary = selected.length === 0
    ? `All ${label}`
    : selected.length === 1
      ? selected[0]
      : `${selected.length} ${label}`;

  return (
    <div ref={rootRef} className={`relative inline-block ${className ?? ''}`}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={buttonClassName ?? 'select-plain disabled:opacity-50 disabled:cursor-not-allowed text-left'}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {summary}
      </button>
      {open && !disabled && (
        <div
          role="listbox"
          className="absolute z-20 mt-1 min-w-[200px] max-h-[280px] overflow-y-auto rounded-md border shadow-lg py-1"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between px-3 py-1 text-[11px]" style={{ color: 'var(--fg-3)' }}>
            <span>{selected.length} selected</span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          {options.map(opt => (
            <label
              key={opt}
              className="flex items-center gap-2 px-3 py-[6px] text-[13px] cursor-pointer hover:bg-[var(--surface-2)]"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="w-3.5 h-3.5"
              />
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">{opt}</span>
            </label>
          ))}
          {options.length === 0 && (
            <div className="px-3 py-2 text-[12px]" style={{ color: 'var(--fg-3)' }}>No options</div>
          )}
        </div>
      )}
    </div>
  );
}
