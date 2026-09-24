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
// Rent = Income transactions matching (merchant pattern and category, as in
// matchesAnyIncomeRule) IncomeRules whose label starts with the prefix.
// Fees: share = deductible fraction; cash = whether the fee is paid out of the rent
// (a rented flat's fee) or is an own-home cost that only lowers taxable rent.
export const FIRE_RENTAL = {
  incomeRuleLabelPrefix: 'Rental income',
  deductibleFees: [
    // Fully rented flat.
    { merchant: 'Säästötupa', share: 1, cash: true },
    // Own home with one short-term (Airbnb) room: the user's estimate of the
    // rented share of the maintenance fee.
    { merchant: 'Matela', share: 0.15, cash: false },
  ],
  loanPayee: 'FI73 5723 8183 6277 67',
  // Loan rate = 6-month Euribor + this margin.
  loanMargin: 0.006,
} as const;
