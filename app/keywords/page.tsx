import { KeywordManager } from '@/components/KeywordManager';

export const metadata = {
  title: 'Keyword Rules',
  description: 'Manage keyword-based category rules',
};

export default function KeywordsPage() {
  return (
    <main className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Keyword Rules</h1>
        <p className="text-gray-600">
          Manage keyword-to-category rules for automatic transaction categorization.
          Rules are applied in priority order (top to bottom).
        </p>
      </div>

      <KeywordManager />
    </main>
  );
}
