import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { loadEnvConfig } from '@next/env';
import path from 'path';

loadEnvConfig(path.resolve(__dirname, '..'));

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  await prisma.householdMember.upsert({ where: { slug: 'tung' }, update: {}, create: { name: 'Tung', slug: 'tung' } });
  await prisma.householdMember.upsert({ where: { slug: 'thuy' }, update: {}, create: { name: 'Thuy', slug: 'thuy' } });
  console.log('Seeded household members: Tung, Thuy');
  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
