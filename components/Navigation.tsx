'use client';

import Link from 'next/link';

export function Navigation() {
  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-gray-900">Expense Tracker</h1>
          </div>
          <div className="flex items-center space-x-6">
            <Link href="/" className="text-gray-700 hover:text-gray-900 text-sm font-medium">
              Dashboard
            </Link>
            <Link href="/transactions" className="text-gray-700 hover:text-gray-900 text-sm font-medium">
              Transactions
            </Link>
            <Link href="/upload" className="text-gray-700 hover:text-gray-900 text-sm font-medium">
              Upload
            </Link>
            <Link href="/keywords" className="text-gray-700 hover:text-gray-900 text-sm font-medium">
              Keywords
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
