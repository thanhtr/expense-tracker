import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI detection not configured' }, { status: 503 });
  }

  try {
    const formData = await request.formData();
    const content = formData.get('content') as string | null;

    if (!content) {
      return NextResponse.json({ error: 'No content provided' }, { status: 400 });
    }

    const client = new Anthropic();
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Analyze this bank statement CSV and identify column mappings. Return ONLY valid JSON, no explanation.

CSV content (first few lines):
${content}

Return JSON with these exact fields:
{
  "bankLabel": "bank name (e.g. Nordea, Danske Bank) or 'Unknown Bank'",
  "dateColumn": "exact column header for transaction date",
  "amountColumn": "exact column header for amount",
  "merchantColumn": "exact column header for merchant/description/payee",
  "noteColumn": "exact column header for note/memo/reference, or null if not present",
  "delimiter": "," or ";" or "\\t",
  "amountFormat": "standard" or "finnish" (use 'finnish' if amounts use comma as decimal separator like '1 234,56'),
  "dateFormat": format string such as "YYYY-MM-DD", "DD.MM.YYYY", "MM/DD/YYYY", "D.M.YYYY",
  "amountSign": "standard" (negative number = expense) or "inverted" (positive number = expense, like some Amex statements),
  "confidence": number between 0 and 1
}`,
        },
      ],
    });

    const text =
      message.content[0]?.type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse AI response' }, { status: 500 });
    }

    const mapping = JSON.parse(jsonMatch[0]);
    return NextResponse.json(mapping);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Detection failed';
    console.error('detect-columns error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
