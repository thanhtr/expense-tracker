import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag, CACHE_TAGS, type CacheTag } from '@/lib/cache-tags';
import { requireTokenOrSession } from '@/lib/api-auth';

// Manual escape hatch for the nearly-indefinite cache (data/readings/config tags — see
// lib/services/aggregation-service.ts and friends): a Settings button for a person, or a
// CI/CD pipeline step after a direct DB migration/seed that bypasses the app's own mutation
// routes (and therefore never fires the routes' own revalidateTag calls).
export async function POST(request: NextRequest) {
  // Token auth for a pipeline step; session auth (via proxy.ts) for the Settings button.
  const authError = requireTokenOrSession(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({})) as { tags?: unknown };
  // `tags` omitted entirely -> default to all three. `tags` present but not an array (e.g. a
  // typo'd `"data"` instead of `["data"]`) is a malformed request, not "no preference" -> reject
  // rather than silently falling back to invalidating everything.
  if (body.tags !== undefined && !Array.isArray(body.tags)) {
    return NextResponse.json({ error: '"tags" must be an array of cache tags' }, { status: 400 });
  }

  if (body.tags === undefined) {
    for (const tag of CACHE_TAGS) revalidateTag(tag);
    return NextResponse.json({ success: true, invalidated: CACHE_TAGS });
  }

  // `tags: []` is an explicit, valid no-op request (not malformed). `tags` present and
  // non-empty but containing no recognized tag (e.g. `["bogus"]`) is rejected rather than
  // silently invalidating nothing.
  const requested = body.tags;
  const tags = requested.filter((t: unknown): t is CacheTag => (CACHE_TAGS as readonly string[]).includes(t as string));
  if (requested.length > 0 && tags.length === 0) {
    return NextResponse.json({ error: 'No valid tags in request' }, { status: 400 });
  }

  for (const tag of tags) revalidateTag(tag);

  return NextResponse.json({ success: true, invalidated: tags });
}
