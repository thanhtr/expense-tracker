import { NextResponse } from 'next/server';
import { getAllExpenses } from '@/lib/splitwise';
import { USER_ID, WIFE_ID, GROUP_ID } from '@/lib/constants';

interface TestResult {
  status: 'OK' | 'ERROR';
  expenses_found?: number;
  message?: string;
  error?: string;
}

interface HealthCheck {
  timestamp: string;
  status: 'HEALTHY' | 'UNHEALTHY';
  environment: {
    SPLITWISE_API_KEY_SET: boolean;
    SPLITWISE_USER_ID: string;
    SPLITWISE_WIFE_ID: string;
    SPLITWISE_GROUP_ID: string;
  };
  tests: Record<string, TestResult>;
}

export async function GET() {
  const checks: HealthCheck = {
    timestamp: new Date().toISOString(),
    environment: {
      SPLITWISE_API_KEY_SET: !!process.env.SPLITWISE_API_KEY,
      SPLITWISE_USER_ID: USER_ID,
      SPLITWISE_WIFE_ID: WIFE_ID,
      SPLITWISE_GROUP_ID: GROUP_ID,
    },
    tests: {},
  };

  // Test 1: Can we fetch from Splitwise?
  try {
    console.log('🏥 Health check: Testing Splitwise API...');
    const expenses = await getAllExpenses({ datedAfter: '2020-01-01' });
    checks.tests.splitwise_api = {
      status: 'OK',
      expenses_found: expenses.length,
      message: `Successfully fetched ${expenses.length} expenses from Splitwise`,
    };
  } catch (error) {
    checks.tests.splitwise_api = {
      status: 'ERROR',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // Overall status
  const allOk = Object.values(checks.tests).every((t) => t.status === 'OK');
  checks.status = allOk ? 'HEALTHY' : 'UNHEALTHY';

  return NextResponse.json(checks, {
    status: allOk ? 200 : 500,
  });
}
