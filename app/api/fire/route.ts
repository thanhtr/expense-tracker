import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { runFireCalculation, FIRE_DEFAULTS, type FireConfig } from '@/lib/services/fire-service';
import { fireConfigSchema, parseBody } from '@/lib/validation';

async function getOrCreateConfig(): Promise<FireConfig & { id: number; updatedAt: Date }> {
  return prisma.fireConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, ...FIRE_DEFAULTS },
  });
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
      create: { id: 1, ...FIRE_DEFAULTS, ...parsed.data },
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
