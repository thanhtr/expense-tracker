'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TransactionFilters } from '@/components/TransactionFilters';
import { TransactionTable } from '@/components/TransactionTable';

export default function TransactionsPage() {
  const [filters, setFilters] = useState({});

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-foreground">Transactions</h1>
        <div className="flex gap-2">
          <Link href="/transactions/sellers" className="btn-ghost text-[12px]">Sellers →</Link>
          <Link href="/transactions/suggestions" className="btn-ghost text-[12px]">Suggestions →</Link>
        </div>
      </div>
      <TransactionFilters onFilter={setFilters} />
      <TransactionTable filters={filters} />
    </div>
  );
}
