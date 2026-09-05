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
