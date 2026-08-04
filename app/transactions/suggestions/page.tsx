import { SuggestionReview } from '@/components/SuggestionReview';

export const metadata = {
  title: 'Re-categorize Suggestions',
  description: 'Review and apply category suggestions for existing transactions',
};

export default function SuggestionsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Re-categorize Suggestions</h1>
        <p className="text-fg-2">
          Transactions whose current category doesn&apos;t match your learned rules — or are still uncategorized.
          Accept suggestions in bulk or adjust them individually.
        </p>
      </div>
      <SuggestionReview />
    </div>
  );
}
