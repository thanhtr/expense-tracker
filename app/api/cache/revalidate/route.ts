import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

const CACHE_TAGS = ['data', 'readings', 'config'] as const;
type CacheTag = typeof CACHE_TAGS[number];

// Manual escape hatch for the nearly-indefinite cache (data/readings/config tags — see
// lib/services/aggregation-service.ts and friends): a Settings button for a person, or a
// CI/CD pipeline step after a direct DB migration/seed that bypasses the app's own mutation
// routes (and therefore never fires the routes' own revalidateTag calls).
export async function POST(request: NextRequest) {
  // Token auth for a pipeline step; session auth (via proxy.ts) for the Settings button.
  // Checked by presence (`.has`), not truthiness of the value (`.get` alone) — proxy.ts's own
  // gate skips the session check whenever the header is merely *present*, so an empty-but-present
  // `x-api-token:` header must still be rejected here rather than treated as "no token supplied".
  if (request.headers.has('x-api-token')) {
    const token = request.headers.get('x-api-token');
    if (token !== process.env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const body = await request.json().catch(() => ({})) as { tags?: unknown };
  const requested = Array.isArray(body.tags) ? body.tags : CACHE_TAGS;
  const tags = requested.filter((t): t is CacheTag => (CACHE_TAGS as readonly string[]).includes(t as string));

  if (tags.length === 0) {
    return NextResponse.json({ error: 'No valid tags in request' }, { status: 400 });
  }

  for (const tag of tags) revalidateTag(tag, { expire: 0 });

  return NextResponse.json({ success: true, invalidated: tags });
}
