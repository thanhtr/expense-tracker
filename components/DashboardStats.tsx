'use client';

import { useEffect, useState } from 'react';
import { DashboardAggregation } from '@/lib/types';
import { ForecastResult } from '@/lib/services/forecast-service';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend, PieChart, Pie } from 'recharts';

const COLORS = ['#1D9E75', '#378ADD', '#D85A30', '#7F77DD', '#D4537E', '#639922', '#BA7517', '#E24B4A'];

/**
 * Get date range for a calendar month (monthsAgo: 0 = this month, 1 = last month, etc.)
 */
function getMonthRange(monthsAgo: number): { from: string; to: string; label: string } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);

  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const to = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${lastDay}`;
  const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return { from, to, label };
}

type QuickFilter = 'this-month' | 'last-month' | 'last-3m' | 'this-year' | 'custom';

const QUICK_FILTERS: { id: QuickFilter; label: string }[] = [
  { id: 'this-month', label: 'This Month' },
  { id: 'last-month', label: 'Last Month' },
  { id: 'last-3m', label: 'Last 3 Months' },
  { id: 'this-year', label: 'This Year' },
];

function getQuickFilterRange(id: QuickFilter): { from: string; to: string } {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  switch (id) {
    case 'this-month':
      return { from: getMonthRange(0).from, to: getMonthRange(0).to };
    case 'last-month':
      return { from: getMonthRange(1).from, to: getMonthRange(1).to };
    case 'last-3m': {
      const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return {
        from: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-01`,
        to: today,
      };
    }
    case 'this-year':
      return { from: `${now.getFullYear()}-01-01`, to: today };
    default:
      return { from: getMonthRange(0).from, to: getMonthRange(0).to };
  }
}

export function DashboardStats() {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [dateFrom, setDateFrom] = useState(getMonthRange(0).from);
  const [dateTo, setDateTo] = useState(getMonthRange(0).to);
  const [activeQuickFilter, setActiveQuickFilter] = useState<QuickFilter>('this-month');
  const [data, setData] = useState<DashboardAggregation | null>(null);
  const [unfiltered, setUnfiltered] = useState<DashboardAggregation | null>(null);
  const [loading, setLoading] = useState(true);
  // Categories toggled OFF in the bar chart (independent of the global category filter)
  const [hiddenBarCategories, setHiddenBarCategories] = useState<Set<string>>(new Set());
  const [forecast, setForecast] = useState<ForecastResult | null>(null);

  const applyQuickFilter = (id: QuickFilter) => {
    const { from, to } = getQuickFilterRange(id);
    setActiveQuickFilter(id);
    setDateFrom(from);
    setDateTo(to);
    setSelectedCategory('');
    setHiddenBarCategories(new Set());
  };

  const handleDateChange = (field: 'from' | 'to', value: string) => {
    if (field === 'from') setDateFrom(value);
    else setDateTo(value);
    setActiveQuickFilter('custom');
  };

  const toggleBarCategory = (category: string) => {
    setHiddenBarCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  // Fetch unfiltered data when date range changes. Resets category to keep
  // the dropdown and charts consistent with the new range.
  useEffect(() => {
    setSelectedCategory('');
    setData(null);
    setUnfiltered(null);
    setLoading(true);

    const fetchUnfiltered = async () => {
      try {
        const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
        const res = await fetch(`/api/dashboard?${params}`);
        if (res.ok) {
          const result = await res.json();
          setUnfiltered(result);
          setData(result); // reuse for the "all categories" view — no second fetch needed
        }
      } catch (error) {
        console.error('Failed to fetch unfiltered dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUnfiltered();
  }, [dateFrom, dateTo]);

  // Fetch forecast once on mount — it's date-range independent (always uses last 6 months)
  useEffect(() => {
    const fetchForecast = async () => {
      try {
        const res = await fetch('/api/forecast');
        if (res.ok) setForecast(await res.json());
      } catch (error) {
        console.error('Failed to fetch forecast:', error);
      }
    };
    fetchForecast();
  }, []);

  // Fetch filtered data only when a specific category is selected.
  // When category is cleared, reuse the already-fetched unfiltered result.
  useEffect(() => {
    if (!selectedCategory) {
      if (unfiltered) setData(unfiltered); // instant, no network call
      return;
    }

    setLoading(true);
    const fetchFiltered = async () => {
      try {
        const params = new URLSearchParams({
          date_from: dateFrom,
          date_to: dateTo,
          category: selectedCategory,
        });
        const res = await fetch(`/api/dashboard?${params}`);
        if (res.ok) setData(await res.json());
      } catch (error) {
        console.error('Failed to fetch filtered dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFiltered();
  }, [selectedCategory, dateFrom, dateTo]);

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
            <Tooltip formatter={(value: unknown) => formatCurrency((value as number) ?? 0)} />
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

    // Categories present in this period (from filtered data)
    const allCategories = data.byCategory.map(c => c.category);
    const visibleCategories = allCategories.filter(c => !hiddenBarCategories.has(c));

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Daily Spending by Category</h2>
          {hiddenBarCategories.size > 0 && (
            <button
              onClick={() => setHiddenBarCategories(new Set())}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Show all
            </button>
          )}
        </div>

        {/* Category toggles for the bar chart */}
        <div className="flex flex-wrap gap-2 mb-4">
          {allCategories.map((cat, i) => {
            const isVisible = !hiddenBarCategories.has(cat);
            return (
              <button
                key={cat}
                onClick={() => toggleBarCategory(cat)}
                title={isVisible ? `Hide ${cat}` : `Show ${cat}`}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-opacity ${
                  isVisible ? 'opacity-100' : 'opacity-40'
                }`}
                style={{
                  borderColor: COLORS[i % COLORS.length],
                  color: isVisible ? COLORS[i % COLORS.length] : '#6b7280',
                  backgroundColor: isVisible ? `${COLORS[i % COLORS.length]}18` : 'transparent',
                }}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                {cat}
              </button>
            );
          })}
        </div>

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
            <Tooltip formatter={(value: unknown) => formatCurrency((value as number) ?? 0)} />
            <Legend />
            {visibleCategories.map((cat) => (
              <Bar
                key={cat}
                dataKey={cat}
                stackId="a"
                fill={COLORS[allCategories.indexOf(cat) % COLORS.length]}
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

  const renderForecast = () => {
    if (!forecast) return null;

    const trendIcon = (trend: 'up' | 'down' | 'stable') => {
      if (trend === 'up') return <span className="text-red-500">↑</span>;
      if (trend === 'down') return <span className="text-green-500">↓</span>;
      return <span className="text-gray-400">→</span>;
    };

    const monthLabel = (() => {
      const [year, month] = forecast.forecastMonth.split('-');
      return new Date(parseInt(year), parseInt(month) - 1, 1)
        .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    })();

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Forecast: {monthLabel}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              EMA prediction based on {forecast.basedOnMonths} month{forecast.basedOnMonths !== 1 ? 's' : ''} of history
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500 font-medium">Estimated Total</div>
            <div className="text-2xl font-semibold text-gray-900">{formatCurrency(forecast.nextMonthTotal)}</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 text-xs font-medium text-gray-500">Category</th>
                <th className="text-right py-2 text-xs font-medium text-gray-500">Last Month</th>
                <th className="text-right py-2 text-xs font-medium text-gray-500">Forecast</th>
                <th className="text-right py-2 text-xs font-medium text-gray-500">Trend</th>
              </tr>
            </thead>
            <tbody>
              {forecast.byCategory.slice(0, 8).map((row) => (
                <tr key={row.category} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 text-gray-700">{row.category}</td>
                  <td className="py-2 text-right text-gray-500">
                    {row.lastMonthActual > 0 ? formatCurrency(row.lastMonthActual) : '—'}
                  </td>
                  <td className="py-2 text-right font-medium text-gray-900">
                    {formatCurrency(row.forecast)}
                  </td>
                  <td className="py-2 text-right">{trendIcon(row.trend)}</td>
                </tr>
              ))}
              {forecast.byCategory.length > 8 && (
                <tr>
                  <td colSpan={4} className="py-2 text-xs text-gray-400 text-center">
                    +{forecast.byCategory.length - 8} more categories
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Filter Bar */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        {/* Quick filter buttons */}
        <div className="flex flex-wrap gap-2">
          {QUICK_FILTERS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => applyQuickFilter(id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeQuickFilter === id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
          {activeQuickFilter === 'custom' && (
            <span className="px-3 py-1.5 rounded-md text-sm font-medium bg-blue-600 text-white">
              Custom
            </span>
          )}
        </div>

        {/* Manual date + category row */}
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
              onChange={(e) => handleDateChange('from', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => handleDateChange('to', e.target.value)}
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

      {/* Forecast */}
      {renderForecast()}
    </div>
  );
}
