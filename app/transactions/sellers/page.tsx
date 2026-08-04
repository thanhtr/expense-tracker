import { SellerTable } from '@/components/SellerTable';

export const metadata = {
  title: 'Sellers',
  description: 'Browse and categorize transactions grouped by merchant',
};

export default function SellersPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Sellers</h1>
        <p className="text-fg-2">
          All merchants grouped by transaction history. Pick a category and apply it to every transaction from that merchant in one click.
        </p>
      </div>
      <SellerTable />
    </div>
  );
}
