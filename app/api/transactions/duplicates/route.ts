import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export interface DuplicateRow {
  id: number;
  account: string;
  paidBy: string;
  category: string;
  dedupKey: string | null;
  createdAt: string;
}

export interface DuplicateGroup {
  date: string;
  merchant: string;
  amount: number;
  rows: DuplicateRow[];
}

export interface DuplicatesResponse {
  total: number;
  groups: DuplicateGroup[];
}

export async function GET(): Promise<NextResponse> {
  // Find all (date, merchant, amount) combos with more than one row
  const groups = await prisma.$queryRaw<{
    date: Date;
    merchant: string;
    amt: number;
    ids: number[];
  }[]>`
    SELECT
      date::date AS date,
      merchant,
      ABS(amount) AS amt,
      array_agg(id ORDER BY id) AS ids
    FROM "Transaction"
    WHERE type = 'Expense'
    GROUP BY date::date, merchant, ABS(amount)
    HAVING COUNT(*) > 1
    ORDER BY date DESC
  `;

  if (groups.length === 0) {
    return NextResponse.json({ total: 0, groups: [] } satisfies DuplicatesResponse);
  }

  // Fetch full detail for all IDs in one query
  const allIds = groups.flatMap(g => g.ids);
  const rows = await prisma.transaction.findMany({
    where: { id: { in: allIds } },
    select: { id: true, account: true, paidBy: true, category: true, dedupKey: true, createdAt: true },
  });
  const rowMap = new Map(rows.map(r => [r.id, r]));

  const result: DuplicateGroup[] = groups.map(g => ({
    date: g.date.toISOString().slice(0, 10),
    merchant: g.merchant,
    amount: Number(g.amt),
    rows: g.ids.map(id => {
      const r = rowMap.get(id)!;
      return {
        id,
        account: r.account,
        paidBy: r.paidBy,
        category: r.category,
        dedupKey: r.dedupKey,
        createdAt: r.createdAt.toISOString(),
      };
    }),
  }));

  return NextResponse.json({ total: result.length, groups: result } satisfies DuplicatesResponse);
}
