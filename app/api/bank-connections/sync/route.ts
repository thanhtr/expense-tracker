import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getTransactions, EBTransaction } from '@/lib/services/enable-banking';
import { categorizeWithLearning } from '@/lib/categorizer';
import { invalidateDashboardCache } from '@/lib/services/aggregation-service';
import { ParsedTransaction } from '@/lib/types';

type MappedTransaction = ParsedTransaction & { paidBy: 'tung' | 'thuy'; dedupKey: string };

function mapTransaction(tx: EBTransaction, connection: { accountLabel: string; owner: string }): MappedTransaction {
  const rawAmount = parseFloat(tx.transaction_amount.amount);
  const amount = tx.credit_debit_indicator === 'CRDT' ? Math.abs(rawAmount) : -Math.abs(rawAmount);
  const merchant =
    tx.creditor?.name ??
    tx.debtor?.name ??
    tx.remittance_information?.[0] ??
    'Unknown';

  return {
    date: new Date(tx.booking_date),
    account: connection.accountLabel,
    merchant,
    amount,
    type: amount >= 0 ? 'Income' : 'Expense',
    note: (tx.remittance_information ?? []).join(' '),
    category: '',
    paidBy: connection.owner as 'tung' | 'thuy',
    dedupKey: `enablebanking:${tx.entry_reference ?? tx.transaction_id}`,
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const connectionId = body.connectionId as number | undefined;

  const where = connectionId
    ? { id: connectionId, status: 'active' }
    : { status: 'active' };

  const connections = await prisma.bankConnection.findMany({ where });

  if (connections.length === 0) {
    return NextResponse.json({ error: 'No active connections found' }, { status: 404 });
  }

  let totalCreated = 0;
  let totalSkipped = 0;
  const errors: string[] = [];

  for (const connection of connections) {
    if (!connection.accountId) continue;

    const dateTo = new Date().toISOString().slice(0, 10);
    const dateFrom = connection.lastSyncAt
      ? connection.lastSyncAt.toISOString().slice(0, 10)
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    try {
      const rawTxs = await getTransactions(connection.accountId, dateFrom, dateTo);
      const mapped = rawTxs.map(tx => mapTransaction(tx, connection));
      const categorized = await categorizeWithLearning(mapped);

      const data = mapped.map((orig, i) => ({
        date: orig.date,
        account: orig.account,
        merchant: orig.merchant,
        amount: orig.amount,
        note: orig.note || '',
        type: orig.type,
        category: categorized[i]?.category || '',
        paidBy: orig.paidBy,
        dedupKey: orig.dedupKey,
      }));

      const { count: created } = await prisma.transaction.createMany({ data, skipDuplicates: true });
      const skipped = data.length - created;
      totalCreated += created;
      totalSkipped += skipped;

      await prisma.bankConnection.update({
        where: { id: connection.id },
        data: { lastSyncAt: new Date() },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${connection.aspspName}: ${msg}`);
    }
  }

  invalidateDashboardCache();

  return NextResponse.json({ created: totalCreated, skipped: totalSkipped, errors });
}
