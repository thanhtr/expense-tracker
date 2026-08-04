'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TransactionFilters } from '@/components/TransactionFilters';
import { TransactionTable } from '@/components/TransactionTable';

export default function TransactionsPage() {
  const [filters, setFilters] = useState({});

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <h1 className="text-3xl font-bold text-foreground mr-auto">Transactions</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/transactions/sellers" className="btn-ghost text-[12px]">Sellers →</Link>
          <Link href="/transactions/suggestions" className="btn-ghost text-[12px]">Suggestions →</Link>
          <Link href="/transactions/duplicates" className="btn-ghost text-[12px]">Duplicates →</Link>
        </div>
      </div>
      <TransactionFilters onFilter={setFilters} />
      <TransactionTable filters={filters} />
    </div>
  );
}
