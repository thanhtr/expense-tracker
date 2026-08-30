import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const BUILT_IN_PROFILES = [
  {
    fingerprint: 'builtin:op',
    bankLabel: 'OP Bank',
    isBuiltIn: true,
    columnMapping: {
      bankLabel: 'OP Bank',
      dateColumn: 'Kirjauspäivä',
      amountColumn: 'Määrä EUROA',
      merchantColumn: 'Saaja/Maksaja',
      noteColumn: 'Viesti',
      delimiter: ';',
      amountFormat: 'finnish',
      dateFormat: 'DD.MM.YYYY',
      amountSign: 'standard',
      confidence: 1.0,
    },
  },
  {
    fingerprint: 'builtin:amex',
    bankLabel: 'Amex',
    isBuiltIn: true,
    columnMapping: {
      bankLabel: 'Amex',
      dateColumn: 'Päivämäärä',
      amountColumn: 'Summa',
      merchantColumn: 'Kuvaus',
      noteColumn: null,
      delimiter: ',',
      amountFormat: 'finnish',
      dateFormat: 'DD.MM.YYYY',
      amountSign: 'inverted',
      confidence: 1.0,
    },
  },
  {
    fingerprint: 'builtin:finnair',
    bankLabel: 'Finnair Visa',
    isBuiltIn: true,
    columnMapping: {
      bankLabel: 'Finnair Visa',
      dateColumn: 'Date of payment',
      amountColumn: 'Amount',
      merchantColumn: 'Location of purchase',
      noteColumn: null,
      delimiter: ',',
      amountFormat: 'finnish',
      dateFormat: 'DD.MM.YYYY',
      amountSign: 'standard',
      confidence: 1.0,
    },
  },
];

async function main() {
  for (const profile of BUILT_IN_PROFILES) {
    await db.bankProfile.upsert({
      where: { fingerprint: profile.fingerprint },
      create: profile,
      update: { bankLabel: profile.bankLabel, columnMapping: profile.columnMapping },
    });
    console.log(`Seeded: ${profile.bankLabel}`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
