import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

interface TestResult {
  status: 'OK' | 'ERROR';
  message?: string;
  error?: string;
  count?: number;
}

interface HealthCheck {
  timestamp: string;
  status: 'HEALTHY' | 'UNHEALTHY';
  environment: {
    DATABASE_URL_SET: boolean;
  };
  tests: Record<string, TestResult>;
}

export async function GET() {
  const checks: HealthCheck = {
    timestamp: new Date().toISOString(),
    status: 'UNHEALTHY',
    environment: {
      DATABASE_URL_SET: !!process.env.DATABASE_URL,
    },
    tests: {},
  };

  try {
    const count = await prisma.transaction.count();
    checks.tests.database = {
      status: 'OK',
      message: `Database connected, ${count} transactions`,
      count,
    };
  } catch (error) {
    checks.tests.database = {
      status: 'ERROR',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const allOk = Object.values(checks.tests).every((t) => t.status === 'OK');
  checks.status = allOk ? 'HEALTHY' : 'UNHEALTHY';

  return NextResponse.json(checks, { status: allOk ? 200 : 500 });
}
