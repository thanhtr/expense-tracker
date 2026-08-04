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
        <Link
          href="/transactions/suggestions"
          className="btn-ghost text-[12px]"
        >
          Review suggestions →
        </Link>
      </div>
      <TransactionFilters onFilter={setFilters} />
      <TransactionTable filters={filters} />
    </div>
  );
}
