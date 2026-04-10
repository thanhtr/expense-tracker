'use client';

import { useEffect, useState } from 'react';
import { TransactionRow } from './TransactionRow';
import type { TransactionFilterValues } from './TransactionFilters';

interface Transaction {
  id: number;
  date: string | Date;
  account: string;
  merchant: string;
  amount: number;
  type: string;
  category: string;
  note: string;
  paidBy: 'tung' | 'thuy' | 'other';
}

interface TransactionTableProps {
  filters?: TransactionFilterValues;
}

export function TransactionTable({ filters = {} }: TransactionTableProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', limit.toString());
      params.set('offset', offset.toString());
      params.set('sort_by', 'date');
      params.set('order', 'desc');

      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);
      if (filters.account) params.set('account', filters.account);
      if (filters.category) params.set('category', filters.category);
      if (filters.merchant) params.set('merchant', filters.merchant);
      if (filters.type) params.set('type', filters.type);
      if (filters.paidBy) params.set('paid_by', filters.paidBy);

      const res = await fetch(`/api/transactions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions);
        setTotal(data.total);
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setOffset(0);
  }, [filters]);

   
  useEffect(() => {
    fetchTransactions();
  }, [offset, filters]);

  const handleUpdate = async (id: number, category: string) => {
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category })
      });

      if (res.ok) {
        setTransactions(transactions.map(t => t.id === id ? { ...t, category } : t));
      }
    } catch (error) {
      console.error('Failed to update transaction:', error);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setTransactions(transactions.filter(t => t.id !== id));
        setTotal(total - 1);
      }
    } catch (error) {
      console.error('Failed to delete transaction:', error);
    }
  };

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set('date_from', filters.dateFrom);
    if (filters.dateTo) params.set('date_to', filters.dateTo);
    if (filters.account) params.set('account', filters.account);
    if (filters.category) params.set('category', filters.category);
    if (filters.merchant) params.set('merchant', filters.merchant);
    if (filters.type) params.set('type', filters.type);
    if (filters.paidBy) params.set('paid_by', filters.paidBy);

    const url = `/api/export?${params}`;
    window.open(url, '_blank');
  };

  if (loading && transactions.length === 0) {
    return <div className="text-center py-8">Loading...</div>;
  }

  const maxPage = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">
          Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} transactions
        </div>
        <button
          onClick={handleExport}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700"
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">Account</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">Merchant</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-700">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">Category</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">Paid By</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">Note</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center gap-2">
        <button
          onClick={() => setOffset(Math.max(0, offset - limit))}
          disabled={offset === 0}
          className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <div className="flex items-center gap-2">
          {Array.from({ length: Math.min(5, maxPage) }).map((_, i) => {
            const page = Math.max(1, currentPage - 2) + i;
            if (page > maxPage) return null;
            return (
              <button
                key={page}
                onClick={() => setOffset((page - 1) * limit)}
                className={`px-3 py-2 text-sm font-medium rounded-md ${
                  page === currentPage
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {page}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setOffset(offset + limit)}
          disabled={offset + limit >= total}
          className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
