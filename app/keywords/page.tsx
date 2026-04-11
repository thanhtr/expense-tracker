'use client';

import KeywordManager from '@/components/KeywordManager';

export default function KeywordsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Keyword Management</h1>
        <KeywordManager />
      </div>
    </div>
  );
}
