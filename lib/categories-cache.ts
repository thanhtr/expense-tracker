import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';

// Seeding logic extracted so it can be reused
async function ensureSeededAndFetch(): Promise<string[]> {
  // import CATEGORIES from constants to seed
  const { CATEGORIES } = await import('@/lib/constants');
  const existing = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  if (existing.length === 0) {
    await prisma.category.createMany({
      data: CATEGORIES.map((name, i) => ({ name, sortOrder: i })),
      skipDuplicates: true,
    });
    return CATEGORIES as unknown as string[];
  }
  return existing.map(r => r.name);
}

export const getCategoriesCached = unstable_cache(
  ensureSeededAndFetch,
  ['categories-list'],
  { tags: ['categories'], revalidate: false },
);
