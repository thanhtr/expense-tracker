import { NextRequest, NextResponse } from 'next/server';

// Reference to the keywords array (would come from persistent storage)
// For now, this is a stub - actual implementation would use database
interface Keyword {
  id: string;
  merchant: string;
  category: string;
  priority: number;
}

const keywordsMap = new Map<string, Keyword>();

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    // Stub implementation - in production this would update the database
    const keyword = keywordsMap.get(id);
    if (!keyword) {
      return NextResponse.json(
        { error: 'Keyword not found' },
        { status: 404 }
      );
    }

    const updated = { ...keyword, ...body };
    keywordsMap.set(id, updated);

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Keyword update error:', error);
    return NextResponse.json(
      { error: 'Failed to update keyword' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Stub implementation - in production this would delete from database
    if (!keywordsMap.has(id)) {
      return NextResponse.json(
        { error: 'Keyword not found' },
        { status: 404 }
      );
    }

    keywordsMap.delete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Keyword deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete keyword' },
      { status: 500 }
    );
  }
}
