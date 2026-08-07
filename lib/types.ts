export interface Transaction {
  id: number;
  date: string | Date;
  account: string;
  merchant: string;
  amount: number;
  type: string;
  category: string;
  note: string;
  paidBy: 'tung' | 'thuy' | 'other';
  tags: string[];
}

export interface TransactionFilterValues {
  dateFrom?: string;
  dateTo?: string;
  account?: string;
  type?: string;
  category?: string;
  paidBy?: string;
  merchant?: string;
  amountMin?: string;
  amountMax?: string;
  tag?: string;
}

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
  tags: string[];
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
  byCategoryMonth: { month: string; [key: string]: number | string }[];
  byDay: { day: string; [key: string]: number | string }[];
  uncategorizedCount: number;
  allCategories: string[];
  topTransaction: { merchant: string; amount: number; category: string; date: string } | null;
  transactionCount: number;
  byIncomeSource: { merchant: string; amount: number }[];
}
