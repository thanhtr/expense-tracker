import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export interface SellerCategory {
  category: string;
  count: number;
}

export interface Seller {
  merchant: string;
  count: number;
  totalAmount: number;
  reimbursedAmount?: number;
  categories: SellerCategory[];  // sorted by count desc
  dominantCategory: string;
  isMixed: boolean;
}

export interface SellersResponse {
  sellers: Seller[];
  totalMerchants: number;
}

export async function GET(): Promise<NextResponse> {
  try {
    const [merchantGroups, categoryGroups, links] = await Promise.all([
      prisma.transaction.groupBy({
        by: ['merchant'],
        where: { type: 'Expense' },
        _count: { id: true },
        _sum: { amount: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      prisma.transaction.groupBy({
        by: ['merchant', 'category'],
        where: { type: 'Expense' },
        _count: { id: true },
      }),
      // Linked reimbursements, so a fronted group expense (dinner paid in full, repaid
      // gradually by others under a different merchant name) nets against the merchant
      // that was actually charged, instead of skewing that merchant's total upward.
      // Wrapped in try-catch: table may not exist during migration window.
      prisma.transactionLink.findMany({
        where: { expenseTransaction: { type: 'Expense' } },
        select: {
          expenseTransaction: { select: { merchant: true } },
          reimbursementTransaction: { select: { amount: true } },
        },
      }).catch(() => []),
    ]);

    // Build a map of merchant → category breakdown
    const catMap = new Map<string, SellerCategory[]>();
    for (const row of categoryGroups) {
      if (!catMap.has(row.merchant)) catMap.set(row.merchant, []);
      catMap.get(row.merchant)!.push({ category: row.category || '', count: row._count.id });
    }

    // Build a map of merchant → total linked reimbursement amount
    const reimbursedByMerchant = new Map<string, number>();
    for (const link of links) {
      if (!link.expenseTransaction) continue;
      const merchant = link.expenseTransaction.merchant;
      reimbursedByMerchant.set(merchant, (reimbursedByMerchant.get(merchant) ?? 0) + link.reimbursementTransaction.amount);
    }

    const sellers: Seller[] = merchantGroups.map(g => {
      const cats = (catMap.get(g.merchant) ?? []).sort((a, b) => b.count - a.count);
      const dominant = cats[0]?.category ?? '';
      const isMixed = cats.filter(c => c.category).length > 1;
      const reimbursed = reimbursedByMerchant.get(g.merchant) ?? 0;
      return {
        merchant: g.merchant,
        count: g._count.id,
        totalAmount: Math.max(0, Math.abs(g._sum.amount ?? 0) - reimbursed),
        ...(reimbursed > 0 ? { reimbursedAmount: reimbursed } : {}),
        categories: cats,
        dominantCategory: dominant,
        isMixed,
      };
    });

    return NextResponse.json({ sellers, totalMerchants: sellers.length } satisfies SellersResponse);
  } catch (error) {
    console.error('Sellers fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch sellers' }, { status: 500 });
  }
}
