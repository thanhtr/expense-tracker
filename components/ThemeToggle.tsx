'use client';

import { useSyncExternalStore } from 'react';

type Theme = 'system' | 'light' | 'dark';

const LIGHT_COLOR = '#f9f9f3';
const DARK_COLOR = '#141418';

function subscribe(cb: () => void) {
  // Only this component's own toggle() below changes the stored theme (within this tab),
  // so a same-tab custom event is enough — plus 'storage' for cross-tab consistency.
  window.addEventListener('themechange', cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener('themechange', cb);
    window.removeEventListener('storage', cb);
  };
}
function getSnapshot(): Theme {
  try {
    const t = localStorage.getItem('theme');
    return t === 'dark' || t === 'light' ? t : 'system';
  } catch {
    return 'system';
  }
}
function getServerSnapshot(): Theme {
  return 'system';
}

// Mirrors the metas fixed up by the inline bootstrap script in app/layout.tsx: an explicit
// preference collapses to one static tag, "system" restores the two media-conditioned ones
// (matching the `viewport.themeColor` array in layout.tsx) so the browser tracks OS changes.
function applyThemeColorMeta(theme: Theme) {
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
  if (theme === 'system') {
    const light = document.createElement('meta');
    light.name = 'theme-color';
    light.content = LIGHT_COLOR;
    light.setAttribute('media', '(prefers-color-scheme: light)');
    const dark = document.createElement('meta');
    dark.name = 'theme-color';
    dark.content = DARK_COLOR;
    dark.setAttribute('media', '(prefers-color-scheme: dark)');
    document.head.append(light, dark);
  } else {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = theme === 'dark' ? DARK_COLOR : LIGHT_COLOR;
    document.head.appendChild(meta);
  }
}

const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = NEXT[theme];
    try {
      if (next === 'system') localStorage.removeItem('theme');
      else localStorage.setItem('theme', next);
    } catch { /* ignore */ }

    document.documentElement.classList.remove('dark', 'light');
    if (next !== 'system') document.documentElement.classList.add(next);
    applyThemeColorMeta(next);
    window.dispatchEvent(new Event('themechange'));
  }

  return (
    <button
      onClick={toggle}
      aria-label={`Theme: ${LABEL[theme]} (click for ${LABEL[NEXT[theme]]})`}
      title={`Theme: ${LABEL[theme]}`}
      className="p-2 rounded-md text-fg-2 hover:text-foreground hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {theme === 'dark' ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="5" />
          <path strokeLinecap="round" d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      ) : theme === 'light' ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path strokeLinecap="round" d="M8 20h8M12 17v3" />
        </svg>
      )}
    </button>
  );
}
