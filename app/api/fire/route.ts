import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache, revalidateTag } from 'next/cache';
import { prisma } from '@/lib/db';
import { runFireCalculation, FIRE_DEFAULTS, type StoredFireConfig } from '@/lib/services/fire-service';
import { runMonteCarlo } from '@/lib/services/fire-monte-carlo';
import { deriveFireInputsCached } from '@/lib/services/fire-inputs-service';
import { getDashboardStats } from '@/lib/services/aggregation-service';
import { computeInvestableCash } from '@/lib/services/buffer-service';
import { fireConfigSchema, parseBody } from '@/lib/validation';

async function getOrCreateConfig(): Promise<StoredFireConfig & { id: number; updatedAt: Date }> {
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

interface PortfolioData {
  investmentTotal: number;
  bankTotal: number;
  avgMonthlyIncome: number;
}

// `dayKey` is unused inside the body — present only so unstable_cache's argument-based cache key
// rolls over once per day, since `today`/`twelveMonthsAgo` are computed internally rather than
// taken as arguments (same idiom as forecast-service.ts's monthKey).
async function fetchPortfolioDataUncached(dayKey: string): Promise<PortfolioData> {
  void dayKey;
  // Truncate to a day boundary (not the exact request timestamp) so repeated
  // calls within the same day share a cache key in aggregation-service's
  // dashboard cache, instead of missing on every single request.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const twelveMonthsAgo = new Date(today);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const [investments, banks, stats] = await Promise.all([
    prisma.asset.findMany({ where: { type: 'investment' } }),
    prisma.asset.findMany({ where: { type: 'bank' } }),
    getDashboardStats(twelveMonthsAgo, today),
  ]);
  const investmentTotal = investments.reduce((sum, a) => sum + a.balance, 0);
  const bankTotal = banks.reduce((sum, a) => sum + a.balance, 0);
  // Divide by the number of months actually covered by income data, not a
  // fixed 12 — otherwise less than a year of history understates the average
  // (and therefore the buffer), counting more of the emergency fund as FIRE
  // progress than it should.
  const avgMonthlyIncome = stats.totalIncome / Math.max(1, stats.byMonthIncome.length);

  return { investmentTotal, bankTotal, avgMonthlyIncome };
}

const fetchPortfolioDataCached = unstable_cache(
  fetchPortfolioDataUncached,
  ['fire-portfolio-data'],
  // 'data' (transactions, via getDashboardStats), 'readings' (Asset rows).
  { tags: ['data', 'readings'], revalidate: false },
);

// Independent of FireConfig, so this can run concurrently with the config
// upsert/fetch instead of serializing after it.
async function fetchPortfolioData(): Promise<PortfolioData> {
  return fetchPortfolioDataCached(new Date().toISOString().slice(0, 10));
}

// Bank cash counts toward the FIRE portfolio only above an emergency-fund buffer, so a
// household's safety net isn't mistaken for FIRE progress.
function computeBreakdown(data: PortfolioData, emergencyFundMonths: number): PortfolioBreakdown {
  const { bufferTarget, investableCash } = computeInvestableCash({
    bankTotal: data.bankTotal,
    avgMonthlyIncome: data.avgMonthlyIncome,
    emergencyFundMonths,
  });
  const currentPortfolio = data.investmentTotal + investableCash;

  return { currentPortfolio, ...data, bufferTarget, investableCash };
}

// Combines the saved settings with inputs derived from transaction data and runs the model.
async function respond(stored: StoredFireConfig, portfolioData: PortfolioData): Promise<NextResponse> {
  const derived = await deriveFireInputsCached(stored);
  const fireConfig = { ...stored, ...derived.inputs };
  const breakdown = computeBreakdown(portfolioData, fireConfig.emergencyFundMonths);
  const result = runFireCalculation(fireConfig, breakdown.currentPortfolio);
  const monteCarlo = runMonteCarlo(fireConfig, breakdown.currentPortfolio);

  return NextResponse.json({
    config: fireConfig,
    derived: { earnings: derived.earnings, rental: derived.rental },
    ...breakdown,
    ...result,
    monteCarlo,
  });
}

function storedFields(row: StoredFireConfig & { id: number; updatedAt: Date }): StoredFireConfig {
  const { id: _id, updatedAt: _ts, ...stored } = row;
  return stored;
}

export async function GET(): Promise<NextResponse> {
  try {
    const [config, portfolioData] = await Promise.all([getOrCreateConfig(), fetchPortfolioData()]);
    return await respond(storedFields(config), portfolioData);
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

    const [updated, portfolioData] = await Promise.all([
      prisma.fireConfig.upsert({
        where: { id: 1 },
        update: parsed.data,
        create: { id: 1, ...FIRE_DEFAULTS, ...parsed.data },
      }),
      fetchPortfolioData(),
    ]);
    revalidateTag('config', 'max');

    return await respond(storedFields(updated), portfolioData);
  } catch (err) {
    console.error('[PUT /api/fire]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
