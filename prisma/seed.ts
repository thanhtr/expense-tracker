import { Client } from 'pg';
import { config } from 'dotenv';
import { join } from 'path';

// Load environment variables from .env.local
config({ path: join(process.cwd(), '.env.local') });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Insert some sample merchant keywords
    const keywords = [
      { keyword: 'amazon', category: 'Shopping' },
      { keyword: 'starbucks', category: 'Coffee' },
      { keyword: 'shell', category: 'Gas' },
      { keyword: 'whole foods', category: 'Groceries' },
      { keyword: 'spotify', category: 'Entertainment' },
      { keyword: 'netflix', category: 'Entertainment' },
      { keyword: 'uber', category: 'Transport' },
    ];

    let count = 0;
    for (const kw of keywords) {
      try {
        await client.query(
          `INSERT INTO merchant_keywords (keyword, category, created_at, updated_at)
           VALUES ($1, $2, NOW(), NOW())
           ON CONFLICT (keyword) DO UPDATE SET category = $2, updated_at = NOW()`,
          [kw.keyword, kw.category]
        );
        count++;
      } catch (error) {
        console.warn(`Failed to insert keyword: ${kw.keyword}`, (error as Error).message);
      }
    }

    if (count > 0) {
      console.log(`✓ Seeded ${count} merchant keywords`);
    } else {
      console.log('No keywords were inserted');
    }
  } catch (error) {
    console.error('Database error:', error);
  } finally {
    await client.end();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
