import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { runFireCalculation, FIRE_DEFAULTS, type FireConfig } from '@/lib/services/fire-service';
import { getDashboardStats } from '@/lib/services/aggregation-service';
import { fireConfigSchema, parseBody } from '@/lib/validation';

async function getOrCreateConfig(): Promise<FireConfig & { id: number; updatedAt: Date }> {
  return prisma.fireConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, ...FIRE_DEFAULTS },
  });
}

interface PortfolioBreakdown {
  currentPortfolio: number;
  investmentTotal: number;
  bankTotal: number;
  avgMonthlyIncome: number;
  bufferTarget: number;
  investableCash: number;
}

// Bank cash counts toward the FIRE portfolio only above an emergency-fund
// buffer (emergencyFundMonths x trailing-12-month average income), so a
// household's safety net isn't mistaken for FIRE progress.
async function getPortfolioBreakdown(emergencyFundMonths: number): Promise<PortfolioBreakdown> {
  const [investments, banks] = await Promise.all([
    prisma.asset.findMany({ where: { type: 'investment' } }),
    prisma.asset.findMany({ where: { type: 'bank' } }),
  ]);
  const investmentTotal = investments.reduce((sum, a) => sum + a.balance, 0);
  const bankTotal = banks.reduce((sum, a) => sum + a.balance, 0);

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const { totalIncome } = await getDashboardStats(twelveMonthsAgo, new Date());
  const avgMonthlyIncome = totalIncome / 12;

  const bufferTarget = emergencyFundMonths * avgMonthlyIncome;
  const investableCash = Math.max(0, bankTotal - bufferTarget);
  const currentPortfolio = investmentTotal + investableCash;

  return { currentPortfolio, investmentTotal, bankTotal, avgMonthlyIncome, bufferTarget, investableCash };
}

export async function GET(): Promise<NextResponse> {
  try {
    const config = await getOrCreateConfig();
    const { id: _id, updatedAt: _ts, ...fireConfig } = config;
    const breakdown = await getPortfolioBreakdown(fireConfig.emergencyFundMonths);
    const result = runFireCalculation(fireConfig, breakdown.currentPortfolio);

    return NextResponse.json({ config: fireConfig, ...breakdown, ...result });
  } catch (err) {
    console.error('[GET /api/fire]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as unknown;
    const parsed = parseBody(fireConfigSchema, body);
    if ('error' in parsed) return parsed.error;

    const updated = await prisma.fireConfig.upsert({
      where: { id: 1 },
      update: parsed.data,
      create: { id: 1, ...FIRE_DEFAULTS, ...parsed.data },
    });

    const { id: _id, updatedAt: _ts, ...fireConfig } = updated;
    const breakdown = await getPortfolioBreakdown(fireConfig.emergencyFundMonths);
    const result = runFireCalculation(fireConfig, breakdown.currentPortfolio);

    return NextResponse.json({ config: fireConfig, ...breakdown, ...result });
  } catch (err) {
    console.error('[PUT /api/fire]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
