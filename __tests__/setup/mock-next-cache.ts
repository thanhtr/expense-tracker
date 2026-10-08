// vitest runs route handlers and service functions directly in plain Node, with no Next.js
// request-scoped cache handler — so `unstable_cache`/`revalidateTag`/`revalidatePath` need a
// test-mode replacement. `unstable_cache` is a pass-through (always calls the wrapped function
// fresh): that's the *correct* test behavior, since existing tests already rely on a fresh
// `mockResolvedValueOnce` chain per call, and an in-memory cache across unrelated test cases
// would cause cross-test pollution. `revalidateTag`/`revalidatePath` are tracked no-ops so a
// mutation route's call to them can still be asserted on.
import { vi } from 'vitest';

vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));
