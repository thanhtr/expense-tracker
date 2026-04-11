import { NextRequest, NextResponse } from 'next/server';

// In-memory storage for keywords (resets on deployment)
// TODO: Move to persistent database when Prisma is activated
const keywords: Array<{
  id: string;
  merchant: string;
  category: string;
  priority: number;
}> = [];

let nextId = 1;

export async function GET() {
  return NextResponse.json({ keywords });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { merchant, category } = body;

    if (!merchant || !category) {
      return NextResponse.json(
        { error: 'merchant and category are required' },
        { status: 400 }
      );
    }

    const keyword = {
      id: String(nextId++),
      merchant,
      category,
      priority: keywords.length,
    };

    keywords.push(keyword);
    return NextResponse.json(keyword, { status: 201 });
  } catch (error) {
    console.error('Keyword creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create keyword' },
      { status: 500 }
    );
  }
}
