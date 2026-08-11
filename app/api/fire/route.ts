import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { runFireCalculation, type FireConfig } from '@/lib/services/fire-service';
import { fireConfigSchema, parseBody } from '@/lib/validation';

const DEFAULTS: Omit<FireConfig, never> = {
  currentAge: 36,
  retirementAge: 50,
  mortgageEndAge: 60,
  pensionAge: 65,
  lifeExpectancy: 95,
  monthlyContribution: 3000,
  accumulationReturn: 0.06,
  drawdownReturn: 0.04,
  capitalGainsTaxRate: 0.20,
  phase1aNetMonthly: 4500,
  phase1bNetMonthly: 3000,
  phase2NetMonthly: 3000,
  pensionNetMonthly: 1580,
};

async function getOrCreateConfig(): Promise<FireConfig & { id: number; updatedAt: Date }> {
  const existing = await prisma.fireConfig.findFirst({ orderBy: { id: 'asc' } });
  if (existing) return existing;
  return prisma.fireConfig.create({ data: { id: 1, ...DEFAULTS } });
}

async function getCurrentPortfolio(): Promise<number> {
  const assets = await prisma.asset.findMany({ where: { type: 'investment' } });
  return assets.reduce((sum, a) => sum + a.balance, 0);
}

export async function GET(): Promise<NextResponse> {
  try {
    const [config, currentPortfolio] = await Promise.all([
      getOrCreateConfig(),
      getCurrentPortfolio(),
    ]);

    const { id: _id, updatedAt: _ts, ...fireConfig } = config;
    const result = runFireCalculation(fireConfig, currentPortfolio);

    return NextResponse.json({ config: fireConfig, ...result });
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
      create: { id: 1, ...DEFAULTS, ...parsed.data },
    });

    const currentPortfolio = await getCurrentPortfolio();
    const { id: _id, updatedAt: _ts, ...fireConfig } = updated;
    const result = runFireCalculation(fireConfig, currentPortfolio);

    return NextResponse.json({ config: fireConfig, ...result });
  } catch (err) {
    console.error('[PUT /api/fire]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
