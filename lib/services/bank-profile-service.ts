import { prisma } from '@/lib/db';
import type { ColumnMapping } from '@/lib/parsers';

export async function getAllBankProfiles(): Promise<{ fingerprint: string; bankLabel: string; columnMapping: ColumnMapping; isBuiltIn: boolean }[]> {
  const rows = await prisma.bankProfile.findMany({ orderBy: { bankLabel: 'asc' } });
  return rows.map(r => ({
    fingerprint: r.fingerprint,
    bankLabel: r.bankLabel,
    columnMapping: r.columnMapping as unknown as ColumnMapping,
    isBuiltIn: r.isBuiltIn,
  }));
}

export async function upsertBankProfile(fingerprint: string, mapping: ColumnMapping): Promise<void> {
  await prisma.bankProfile.upsert({
    where: { fingerprint },
    create: { fingerprint, bankLabel: mapping.bankLabel, columnMapping: mapping as object, isBuiltIn: false },
    update: { bankLabel: mapping.bankLabel, columnMapping: mapping as object },
  });
}
