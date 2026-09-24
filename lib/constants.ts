export const CATEGORIES = [
  'Groceries',
  'Dining Out',
  'Transportation',
  'Travel & Flights',
  'Pharmacy',
  'Sports',
  'Shopping',
  'Electronics',
  'Home Supplies',
  'Rent & Housing',
  'Utilities',
  'Subscriptions',
  'Entertainment',
  'Gifts & Charity',
  'Memberships',
  'Investments',
  'Insurance',
  'Car',
  'Internal Transfer',
  'Other',
] as const;

export type Category = typeof CATEGORIES[number];

export const ACCOUNT_NAMES = ["OP Bank", "Amex", "Finnair Visa"] as const;

export const PAID_BY = ['tung', 'thuy', 'other'] as const;
export type PaidBy = typeof PAID_BY[number];

export const TRANSACTION_TYPES = ['Income', 'Expense'] as const;
export type TransactionType = typeof TRANSACTION_TYPES[number];

export const ASSET_TYPES = ['bank', 'investment', 'property', 'crypto', 'liability'] as const;
export type AssetType = typeof ASSET_TYPES[number];

export const TAGS = [
  'reimbursable',
  'work',
  'holiday',
  'shared',
  'one-time',
  'recurring',
] as const;

export type Tag = typeof TAGS[number];

// FIRE: how rental income and its deductible costs are recognised in transactions.
// Rent = Income transactions matching IncomeRules whose label starts with the prefix.
// Costs = housing-company fees (share = deductible fraction) and the rental loan.
export const FIRE_RENTAL = {
  incomeRuleLabelPrefix: 'Rental income',
  deductibleFees: [
    // Fully rented flat.
    { merchant: 'Säästötupa', share: 1 },
    // Own home with one short-term (Airbnb) room: the user's estimate of the
    // rented share of the maintenance fee.
    { merchant: 'Matela', share: 0.15 },
  ],
  loanPayee: 'FI73 5723 8183 6277 67',
  // Loan rate = 6-month Euribor + this margin.
  loanMargin: 0.006,
} as const;
