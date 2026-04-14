import { NextResponse } from 'next/server';
import { forecastNextMonth } from '@/lib/services/forecast-service';

export async function GET() {
  try {
    const result = await forecastNextMonth();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Forecast error:', error);
    return NextResponse.json(
      { error: 'Failed to compute forecast' },
      { status: 500 }
    );
  }
}
