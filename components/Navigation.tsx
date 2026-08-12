'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CommandPalette } from '@/components/CommandPalette';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/transactions/sellers', label: 'Sellers' },
  { href: '/transactions/suggestions', label: 'Suggestions' },
  { href: '/transactions/duplicates', label: 'Duplicates' },
  { href: '/transactions/recurring', label: 'Recurring' },
  { href: '/upload', label: 'Upload' },
  { href: '/keywords', label: 'Keywords' },
  { href: '/settings', label: 'Settings' },
  { href: '/fire', label: 'FIRE' },
];

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <nav className="bg-surface border-b border-border-soft">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-foreground">Expense Tracker</h1>
          </div>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center space-x-4">
            {NAV_LINKS.map(({ href, label }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={
                    isActive
                      ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 pb-0.5 text-sm font-semibold'
                      : 'text-fg-2 hover:text-foreground text-sm font-medium'
                  }
                >
                  {label}
                </Link>
              );
            })}
            <CommandPalette />
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="text-fg-2 hover:text-foreground text-sm font-medium"
              aria-label="Sign out"
            >
              Sign out
            </button>
          </div>

          {/* Hamburger button (mobile only) */}
          <div className="flex items-center gap-1 sm:hidden">
            <CommandPalette />
            <ThemeToggle />
            <button
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Toggle menu"
              className="p-2 rounded-md text-fg-2 hover:text-foreground hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {menuOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="sm:hidden border-t border-border-soft bg-surface">
          <div className="px-4 py-2 space-y-1">
            {NAV_LINKS.map(({ href, label }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`block px-3 py-2 rounded-md text-sm font-medium ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400'
                      : 'text-fg-2 hover:bg-surface-2 hover:text-foreground'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
            <button
              onClick={handleLogout}
              className="block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-fg-2 hover:bg-surface-2 hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
