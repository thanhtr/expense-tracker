'use client';

import { useState } from 'react';
import { TransactionFilters } from '@/components/TransactionFilters';
import { TransactionTable } from '@/components/TransactionTable';

export default function TransactionsPage() {
  const [filters, setFilters] = useState({});

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-foreground mb-8">Transactions</h1>
      <TransactionFilters onFilter={setFilters} />
      <TransactionTable filters={filters} />
    </div>
  );
}
