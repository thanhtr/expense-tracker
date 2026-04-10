import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const keywords = await prisma.merchantKeyword.findMany({
      orderBy: { priority: 'asc' }
    });

    return NextResponse.json(keywords);
  } catch (error) {
    console.error('Get keywords error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch keywords' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { keyword, category } = await request.json();

    const newKeyword = await prisma.merchantKeyword.create({
      data: {
        keyword: keyword.toLowerCase().trim(),
        category: category.trim(),
        priority: Date.now() // Use timestamp for new keywords
      }
    });

    return NextResponse.json(newKeyword);
  } catch (error) {
    console.error('Create keyword error:', error);
    return NextResponse.json(
      { error: 'Failed to create keyword' },
      { status: 500 }
    );
  }
}
