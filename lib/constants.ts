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
  'Other',
] as const;

export type Category = typeof CATEGORIES[number];

export const DEFAULT_CATEGORY = 'Other';

export const ACCOUNT_NAMES = ["OP Bank", "Amex", "Finnair Visa"] as const;
