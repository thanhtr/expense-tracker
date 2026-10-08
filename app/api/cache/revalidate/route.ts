import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireTokenOrSession } from '@/lib/api-auth';

const CACHE_TAGS = ['data', 'readings', 'config'] as const;
type CacheTag = typeof CACHE_TAGS[number];

// Manual escape hatch for the nearly-indefinite cache (data/readings/config tags — see
// lib/services/aggregation-service.ts and friends): a Settings button for a person, or a
// CI/CD pipeline step after a direct DB migration/seed that bypasses the app's own mutation
// routes (and therefore never fires the routes' own revalidateTag calls).
export async function POST(request: NextRequest) {
  // Token auth for a pipeline step; session auth (via proxy.ts) for the Settings button.
  const authError = requireTokenOrSession(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({})) as { tags?: unknown };
  const requested = Array.isArray(body.tags) ? body.tags : CACHE_TAGS;
  const tags = requested.filter((t): t is CacheTag => (CACHE_TAGS as readonly string[]).includes(t as string));

  if (tags.length === 0) {
    return NextResponse.json({ error: 'No valid tags in request' }, { status: 400 });
  }

  for (const tag of tags) revalidateTag(tag, { expire: 0 });

  return NextResponse.json({ success: true, invalidated: tags });
}
