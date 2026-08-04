import { DuplicateReview } from '@/components/DuplicateReview';

export const metadata = {
  title: 'Duplicate Transactions',
  description: 'Review and delete suspected duplicate transactions',
};

export default function DuplicatesPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Duplicate Transactions</h1>
        <p className="text-fg-2">
          Transactions with the same date, merchant, and amount. Review each group and delete the ones that are genuine duplicates.
        </p>
      </div>
      <DuplicateReview />
    </div>
  );
}
