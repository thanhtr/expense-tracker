'use client';

import { useEffect, useState } from 'react';
import { DashboardAggregation } from '@/lib/types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend, PieChart, Pie } from 'recharts';

const COLORS = ['#1D9E75', '#378ADD', '#D85A30', '#7F77DD', '#D4537E', '#639922', '#BA7517', '#E24B4A'];

/**
 * Get date range for a month (monthsAgo: 0 = this month, 1 = last month, etc.)
 */
function getMonthRange(monthsAgo: number): { from: string; to: string; label: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() - monthsAgo;
  const d = new Date(year, month, 1);

  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const to = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${lastDay}`;

  const monthName = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return { from, to, label: monthName };
}

export function DashboardStats() {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [dateFrom, setDateFrom] = useState(getMonthRange(0).from);
  const [dateTo, setDateTo] = useState(getMonthRange(0).to);
  const [data, setData] = useState<DashboardAggregation | null>(null);
  const [unfiltered, setUnfiltered] = useState<DashboardAggregation | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch unfiltered dashboard data to get categories for the selected date range
  useEffect(() => {
    const fetchUnfiltered = async () => {
      try {
        const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
        const res = await fetch(`/api/dashboard?${params}`);
        if (res.ok) {
          setUnfiltered(await res.json());
          setLoading(false);
        }
      } catch (error) {
        console.error('Failed to fetch unfiltered dashboard stats:', error);
        setLoading(false);
      }
    };

    fetchUnfiltered();
  }, [dateFrom, dateTo]);

  // Fetch filtered dashboard stats when category changes
  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
        if (selectedCategory) {
          params.set('category', selectedCategory);
        }

        const res = await fetch(`/api/dashboard?${params}`);
        if (res.ok) {
          setData(await res.json());
        }
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    };

    if (unfiltered) {
      fetchStats();
    }
  }, [selectedCategory, unfiltered]);

  if (loading || !unfiltered) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (!data) {
    return <div className="text-center py-8">No data available</div>;
  }

  const formatCurrency = (n: number) => {
    return new Intl.NumberFormat('fi-FI', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2
    }).format(n);
  };

  const renderPieChart = () => {
    if (data.byCategory.length === 0) {
      return (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Expenses by Category</h2>
          <div className="text-center text-gray-500 py-8">No expenses in this period</div>
        </div>
      );
    }

    // Group top 4 categories, rest into "Other"
    const chartData = data.byCategory.slice(0, 4);
    const otherAmount = data.byCategory.slice(4).reduce((sum, item) => sum + item.amount, 0);
    if (otherAmount > 0) {
      chartData.push({ category: 'Other', amount: otherAmount });
    }

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Expenses by Category</h2>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="amount"
              nameKey="category"
              cx="50%"
              cy="50%"
              outerRadius={100}
              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
            >
              {chartData.map((_, i) => (
                <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: any) => formatCurrency(value ?? 0)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderDailyChart = () => {
    if (data.byDay.length === 0) {
      return (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily Spending</h2>
          <div className="text-center text-gray-500 py-8">No expenses in this period</div>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily Spending by Category</h2>
        <ResponsiveContainer width="100%" height={Math.max(300, data.byDay.length * 20)}>
          <BarChart data={data.byDay} margin={{ left: 60, right: 20, top: 5, bottom: 35 }}>
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11 }}
              angle={-45}
              textAnchor="end"
              height={60}
              tickFormatter={(date: string) => {
                const d = new Date(date);
                return `${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })}`;
              }}
            />
            <YAxis tickFormatter={(v) => `€${v.toFixed(0)}`} width={60} />
            <Tooltip formatter={(value: any) => formatCurrency(value ?? 0)} />
            <Legend />
            {data.byCategory.map((item, i) => (
              <Bar
                key={item.category}
                dataKey={item.category}
                stackId="a"
                fill={COLORS[i % COLORS.length]}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderInsightCards = () => {
    const topCategory = data.byCategory[0];
    const dailyAverage = data.byDay.length > 0 ? data.totalExpenses / data.byDay.length : 0;

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-5 border border-gray-200">
          <div className="text-xs text-gray-500 font-medium mb-1">Top Category</div>
          <div className="text-lg font-semibold text-gray-900 mb-1">{topCategory?.category || 'N/A'}</div>
          <div className="text-sm text-gray-600">{topCategory ? formatCurrency(topCategory.amount) : '—'}</div>
        </div>

        <div className="bg-white rounded-lg p-5 border border-gray-200">
          <div className="text-xs text-gray-500 font-medium mb-1">Most Expensive</div>
          <div className="text-lg font-semibold text-gray-900 mb-1">{data.topTransaction?.merchant || 'N/A'}</div>
          <div className="text-xs text-gray-600 mb-1">{data.topTransaction?.category}</div>
          <div className="text-sm text-gray-600">{data.topTransaction ? formatCurrency(data.topTransaction.amount) : '—'}</div>
        </div>

        <div className="bg-white rounded-lg p-5 border border-gray-200">
          <div className="text-xs text-gray-500 font-medium mb-1">Daily Average</div>
          <div className="text-2xl font-semibold text-gray-900">{formatCurrency(dailyAverage)}</div>
        </div>

        <div className="bg-white rounded-lg p-5 border border-gray-200">
          <div className="text-xs text-gray-500 font-medium mb-1">Transactions</div>
          <div className="text-2xl font-semibold text-gray-900">{data.transactionCount}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Filter Bar */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              {unfiltered?.allCategories?.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-5 border border-gray-200">
          <div className="text-xs text-gray-500 font-medium mb-1">Total Expenses</div>
          <div className="text-2xl font-semibold text-gray-900">{formatCurrency(data.totalExpenses)}</div>
        </div>

        <div className="bg-white rounded-lg p-5 border border-gray-200">
          <div className="text-xs text-gray-500 font-medium mb-1">Total Income</div>
          <div className="text-2xl font-semibold text-green-600">{formatCurrency(data.totalIncome)}</div>
        </div>

        <div className="bg-white rounded-lg p-5 border border-gray-200">
          <div className="text-xs text-gray-500 font-medium mb-1">Net</div>
          <div className={`text-2xl font-semibold ${data.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(data.net)}
          </div>
        </div>

        {Object.entries(data.byAccount).map(([account, amount]) => (
          <div key={account} className="bg-white rounded-lg p-5 border border-gray-200">
            <div className="text-xs text-gray-500 font-medium mb-1">{account}</div>
            <div className="text-2xl font-semibold text-gray-900">{formatCurrency(amount)}</div>
          </div>
        ))}
      </div>

      {/* Uncategorized Warning */}
      {!selectedCategory && unfiltered.uncategorizedCount > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-sm text-yellow-800">
            ⚠️ <strong>{unfiltered.uncategorizedCount} transaction(s)</strong> have no category.
            Add keywords to categorize them.
          </div>
        </div>
      )}

      {/* Insight Cards */}
      {renderInsightCards()}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderPieChart()}
        {renderDailyChart()}
      </div>
    </div>
  );
}
