'use client';

import { Suspense, useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { TransactionFilters } from '@/components/TransactionFilters';
import { TransactionTable } from '@/components/TransactionTable';
import type { TransactionFilterValues } from '@/lib/types';

function TransactionsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [filters, setFilters] = useState<TransactionFilterValues>(() => {
    const f: TransactionFilterValues = {};
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const account = searchParams.get('account');
    const type = searchParams.get('type');
    const category = searchParams.get('category');
    const paidBy = searchParams.get('paid_by');
    const merchant = searchParams.get('merchant');
    const amountMin = searchParams.get('amt_min');
    const amountMax = searchParams.get('amt_max');
    const tag = searchParams.get('tag');
    if (from) f.dateFrom = from;
    if (to) f.dateTo = to;
    if (account) f.account = account;
    if (type) f.type = type;
    if (category) f.category = category;
    if (paidBy) f.paidBy = paidBy;
    if (merchant) f.merchant = merchant;
    if (amountMin) f.amountMin = amountMin;
    if (amountMax) f.amountMax = amountMax;
    if (tag) f.tag = tag;
    return f;
  });

  const handleFilter = useCallback((newFilters: TransactionFilterValues) => {
    setFilters(newFilters);
    const params = new URLSearchParams();
    if (newFilters.dateFrom) params.set('from', newFilters.dateFrom);
    if (newFilters.dateTo) params.set('to', newFilters.dateTo);
    if (newFilters.account) params.set('account', newFilters.account);
    if (newFilters.type) params.set('type', newFilters.type);
    if (newFilters.category) params.set('category', newFilters.category);
    if (newFilters.paidBy) params.set('paid_by', newFilters.paidBy);
    if (newFilters.merchant) params.set('merchant', newFilters.merchant);
    if (newFilters.amountMin) params.set('amt_min', newFilters.amountMin);
    if (newFilters.amountMax) params.set('amt_max', newFilters.amountMax);
    if (newFilters.tag) params.set('tag', newFilters.tag);
    const qs = params.toString();
    router.replace(qs ? `/transactions?${qs}` : '/transactions', { scroll: false });
  }, [router]);

  return (
    <>
      <TransactionFilters onFilter={handleFilter} initialFilters={filters} />
      <TransactionTable filters={filters} />
    </>
  );
}

export default function TransactionsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <h1 className="text-3xl font-bold text-foreground mr-auto">Transactions</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/transactions/sellers" className="btn-ghost text-[12px]">Sellers →</Link>
        </div>
      </div>
      <Suspense fallback={<div className="text-fg-3 text-sm">Loading filters…</div>}>
        <TransactionsContent />
      </Suspense>
    </div>
  );
}
