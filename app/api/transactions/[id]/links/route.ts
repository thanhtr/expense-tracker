import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createLinkSchema, deleteLinkSchema, parseBody, parseId } from '@/lib/validation';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const idResult = parseId(idStr);
    if ('error' in idResult) return idResult.error;

    const links = await prisma.transactionLink.findMany({
      where: { expenseTransactionId: idResult.id },
      include: {
        reimbursementTransaction: {
          select: { id: true, date: true, merchant: true, amount: true },
        },
      },
      orderBy: { id: 'asc' },
    });

    const totalReimbursed = links.reduce((sum, l) => sum + l.reimbursementTransaction.amount, 0);

    return NextResponse.json({
      links: links.map(l => ({
        id: l.id,
        reimbursementTransaction: l.reimbursementTransaction,
      })),
      totalReimbursed,
    });
  } catch (error) {
    console.error('Failed to fetch links:', error);
    return NextResponse.json({ error: 'Failed to fetch links' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const idResult = parseId(idStr);
    if ('error' in idResult) return idResult.error;

    const parsed = parseBody(createLinkSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { reimbursementTransactionId } = parsed.data;

    if (reimbursementTransactionId === idResult.id) {
      return NextResponse.json({ error: 'A transaction cannot be linked to itself' }, { status: 400 });
    }

    const [expenseTx, reimbTx] = await Promise.all([
      prisma.transaction.findUnique({ where: { id: idResult.id } }),
      prisma.transaction.findUnique({ where: { id: reimbursementTransactionId } }),
    ]);

    if (!expenseTx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    if (!reimbTx) return NextResponse.json({ error: 'Reimbursement transaction not found' }, { status: 404 });

    const isPlausibleReimbursement =
      reimbTx.type === 'Income' || (reimbTx.type === 'Expense' && reimbTx.amount > 0);
    if (!isPlausibleReimbursement) {
      return NextResponse.json(
        { error: 'Only Income or positive-amount Expense transactions can be linked as reimbursements' },
        { status: 400 },
      );
    }

    try {
      const link = await prisma.transactionLink.create({
        data: {
          expenseTransactionId: idResult.id,
          reimbursementTransactionId,
        },
      });
      return NextResponse.json(link, { status: 201 });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        return NextResponse.json({ error: 'Already linked to another expense' }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    console.error('Failed to create link:', error);
    return NextResponse.json({ error: 'Failed to create link' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const idResult = parseId(idStr);
    if ('error' in idResult) return idResult.error;

    const parsed = parseBody(deleteLinkSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { reimbursementTransactionId } = parsed.data;

    const { count } = await prisma.transactionLink.deleteMany({
      where: { expenseTransactionId: idResult.id, reimbursementTransactionId },
    });

    if (count === 0) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete link:', error);
    return NextResponse.json({ error: 'Failed to delete link' }, { status: 500 });
  }
}
