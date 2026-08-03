export interface ParsedTransaction {
  date: Date;
  account: string;
  merchant: string;
  amount: number;
  note: string;
  type: 'Income' | 'Expense';
  category?: string;
}

export interface TransactionWithId extends ParsedTransaction {
  id: number;
  paidBy: 'tung' | 'thuy' | 'other';
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardAggregation {
  totalExpenses: number;
  totalIncome: number;
  net: number;
  byCategory: { category: string; amount: number }[];
  byAccount: Record<string, number>;
  byPerson: { person: string; amount: number }[];
  byMonth: { month: string; amount: number }[];
  byDay: { day: string; [key: string]: number | string }[];
  uncategorizedCount: number;
  allCategories: string[];
  topTransaction: { merchant: string; amount: number; category: string; date: string } | null;
  transactionCount: number;
}
