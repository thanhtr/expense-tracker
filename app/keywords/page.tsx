'use client';

import { KeywordManager } from '@/components/KeywordManager';

export default function KeywordsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Keywords Management</h1>

      <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          Manage merchant keywords for automatic categorization. Keywords are matched in priority order (top = highest priority).
        </p>
      </div>

      <KeywordManager />
    </div>
  );
}
