import { NextRequest, NextResponse } from 'next/server';
import { getAllBankProfiles, upsertBankProfile } from '@/lib/services/bank-profile-service';
import { parseBody } from '@/lib/validation';
import { z } from 'zod';



export async function GET() {
  try {
    const profiles = await getAllBankProfiles();
    return NextResponse.json(profiles);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch bank profiles' }, { status: 500 });
  }
}

const upsertSchema = z.object({
  fingerprint: z.string().min(1),
  mapping: z.object({
    bankLabel: z.string(),
    dateColumn: z.string().min(1),
    amountColumn: z.string().min(1),
    merchantColumn: z.string().min(1),
    noteColumn: z.string().nullable().optional(),
    delimiter: z.enum([',', ';', '\t']),
    amountFormat: z.enum(['standard', 'finnish']),
    dateFormat: z.string(),
    amountSign: z.enum(['standard', 'inverted']),
    confidence: z.number(),
  }),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = parseBody(upsertSchema, body);
  if ('error' in parsed) {
    return parsed.error;
  }

  const { fingerprint, mapping } = parsed.data;

  if (fingerprint.startsWith('builtin:')) {
    return NextResponse.json({ error: 'Built-in profiles are read-only' }, { status: 400 });
  }

  try {
    await upsertBankProfile(fingerprint, mapping);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to save bank profile' }, { status: 500 });
  }
}
