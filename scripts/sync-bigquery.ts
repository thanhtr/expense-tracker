/**
 * Syncs Neon PostgreSQL → BigQuery (dataset `expense_tracker`):
 *   - transactions      ← Transaction + TransactionSplit (expanded into one row per split)
 *   - assets            ← Asset (current balances)
 *   - asset_snapshots   ← AssetSnapshot (full balance changelog per asset)
 *
 * Full replace (WRITE_TRUNCATE) per table — safe for our dataset size, simplest to operate.
 *
 * Run locally:  GCP_PROJECT_ID=... DATABASE_URL=... npx tsx scripts/sync-bigquery.ts
 * In CI:        triggered by .github/workflows/sync-bigquery.yml
 */

import { loadEnvConfig } from '@next/env';
import path from 'path';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { Client } from 'pg';
import { BigQuery, Job, TableField } from '@google-cloud/bigquery';
import { TRANSACTIONS_SCHEMA, ASSETS_SCHEMA, ASSET_SNAPSHOTS_SCHEMA } from './bigquery-schema';

loadEnvConfig(path.resolve(__dirname, '..'));

const DATASET = 'expense_tracker';

interface RawRow {
  id:             number;
  date:           Date;
  account:        string;
  merchant:       string;
  amount:         number;
  note:           string | null;
  type:           string;
  category:       string;
  paidBy:         string;
  tags:           string[];
  createdAt:      Date;
  updatedAt:      Date;
  split_id:       number | null;
  split_category: string | null;
  split_amount:   number | null;
}

interface BQRow {
  id:         number;
  split_id:   number | null;
  date:       string;
  account:    string;
  merchant:   string;
  amount:     number;
  type:       string;
  category:   string;
  paid_by:    string;
  note:       string | null;
  tags:       string[];
  is_split:   boolean;
  created_at: string;
  updated_at: string;
  synced_at:  string;
}

interface RawAssetRow {
  id:         number;
  name:       string;
  type:       string;
  balance:    number;
  recordedAt: Date;
  createdAt:  Date;
  updatedAt:  Date;
}

interface BQAssetRow {
  id:         number;
  name:       string;
  type:       string;
  balance:    number;
  recorded_at: string;
  created_at:  string;
  updated_at:  string;
  synced_at:   string;
}

interface RawAssetSnapshotRow {
  id:         number;
  assetId:    number;
  name:       string;
  type:       string;
  balance:    number;
  recordedAt: Date;
  createdAt:  Date;
}

interface BQAssetSnapshotRow {
  id:          number;
  asset_id:    number;
  name:        string;
  type:        string;
  balance:     number;
  recorded_at: string;
  created_at:  string;
  synced_at:   string;
}

function flattenToRows(rawRows: RawRow[], syncedAt: string): BQRow[] {
  // Group by transaction id preserving insertion order
  const txMap = new Map<number, { tx: RawRow; splits: { id: number; category: string; amount: number }[] }>();

  for (const row of rawRows) {
    if (!txMap.has(row.id)) {
      txMap.set(row.id, { tx: row, splits: [] });
    }
    if (row.split_id !== null && row.split_category !== null && row.split_amount !== null) {
      txMap.get(row.id)!.splits.push({
        id: row.split_id,
        category: row.split_category,
        amount: row.split_amount,
      });
    }
  }

  const bqRows: BQRow[] = [];

  for (const { tx, splits } of txMap.values()) {
    const base = {
      id:         tx.id,
      date:       tx.date.toISOString().slice(0, 10),
      account:    tx.account,
      merchant:   tx.merchant,
      type:       tx.type,
      paid_by:    tx.paidBy,
      note:       tx.note ?? null,
      tags:       tx.tags ?? [],
      created_at: tx.createdAt.toISOString(),
      updated_at: tx.updatedAt.toISOString(),
      synced_at:  syncedAt,
    };

    if (splits.length === 0) {
      bqRows.push({
        ...base,
        split_id: null,
        amount:   tx.amount,
        category: tx.category,
        is_split: false,
      });
    } else {
      for (const split of splits) {
        bqRows.push({
          ...base,
          split_id: split.id,
          amount:   Math.abs(split.amount),
          category: split.category,
          is_split: true,
        });
      }
    }
  }

  return bqRows;
}

function mapAssetRows(rawRows: RawAssetRow[], syncedAt: string): BQAssetRow[] {
  return rawRows.map(a => ({
    id:          a.id,
    name:        a.name,
    type:        a.type,
    balance:     a.balance,
    recorded_at: a.recordedAt.toISOString().slice(0, 10),
    created_at:  a.createdAt.toISOString(),
    updated_at:  a.updatedAt.toISOString(),
    synced_at:   syncedAt,
  }));
}

function mapAssetSnapshotRows(rawRows: RawAssetSnapshotRow[], syncedAt: string): BQAssetSnapshotRow[] {
  return rawRows.map(s => ({
    id:          s.id,
    asset_id:    s.assetId,
    name:        s.name,
    type:        s.type,
    balance:     s.balance,
    recorded_at: s.recordedAt.toISOString().slice(0, 10),
    created_at:  s.createdAt.toISOString(),
    synced_at:   syncedAt,
  }));
}

async function loadTable<T extends object>(
  bq: BigQuery,
  tableName: string,
  rows: T[],
  schema: TableField[],
): Promise<void> {
  const table = bq.dataset(DATASET).table(tableName);

  // Write NDJSON to a temp file — BigQuery batch load API requires a file path
  const ndjson  = rows.map(r => JSON.stringify(r)).join('\n');
  const tmpFile = `${tmpdir()}/bq-sync-${tableName}-${Date.now()}.ndjson`;
  writeFileSync(tmpFile, ndjson, 'utf-8');

  const loadOptions = {
    sourceFormat:      'NEWLINE_DELIMITED_JSON',
    writeDisposition:  'WRITE_TRUNCATE',
    schema:            { fields: schema },
    createDisposition: 'CREATE_IF_NEEDED',
    location:          'EU',
  };

  // Use callback form to get a properly typed Job, then await completion
  let job: Job;
  try {
    job = await new Promise<Job>((resolve, reject) => {
      table.createLoadJob(tmpFile, loadOptions, (err, j) => {
        if (err || !j) reject(err ?? new Error('No job returned'));
        else resolve(j);
      });
    });
  } finally {
    unlinkSync(tmpFile);
  }

  await job.promise();

  const [metadata] = await job.getMetadata();
  if (metadata.status?.errorResult) {
    throw new Error(`BigQuery job failed for ${tableName}: ${JSON.stringify(metadata.status.errorResult)}`);
  }

  const stats = metadata.statistics?.load;
  console.log(`Sync complete — ${stats?.outputRows ?? rows.length} rows loaded to ${DATASET}.${tableName}`);
}

async function main() {
  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) throw new Error('GCP_PROJECT_ID env var is required');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL env var is required');

  // Use direct (non-pooler) connection — same pattern as migration step in ci.yml
  const directUrl = dbUrl.replace('-pooler', '');

  console.log('Connecting to Neon...');
  const pg = new Client({ connectionString: directUrl });
  await pg.connect();

  console.log('Querying transactions + splits...');
  const { rows } = await pg.query<RawRow>(`
    SELECT
      t.id,
      t.date,
      t.account,
      t.merchant,
      t.amount,
      t.note,
      t.type,
      t.category,
      t."paidBy",
      t.tags,
      t."createdAt",
      t."updatedAt",
      s.id            AS split_id,
      s.category      AS split_category,
      s.amount        AS split_amount
    FROM "Transaction" t
    LEFT JOIN "TransactionSplit" s ON s."transactionId" = t.id
    ORDER BY t.id, s.id
  `);
  console.log(`Fetched ${rows.length} raw transaction rows from Neon`);

  console.log('Querying assets...');
  const { rows: assetRows } = await pg.query<RawAssetRow>(`
    SELECT id, name, type, balance, "recordedAt", "createdAt", "updatedAt"
    FROM "Asset"
    ORDER BY id
  `);
  console.log(`Fetched ${assetRows.length} asset rows from Neon`);

  console.log('Querying asset snapshots...');
  const { rows: assetSnapshotRows } = await pg.query<RawAssetSnapshotRow>(`
    SELECT id, "assetId", name, type, balance, "recordedAt", "createdAt"
    FROM "AssetSnapshot"
    ORDER BY id
  `);
  console.log(`Fetched ${assetSnapshotRows.length} asset snapshot rows from Neon`);

  await pg.end();

  const syncedAt = new Date().toISOString();
  const bqRows = flattenToRows(rows, syncedAt);
  const bqAssetRows = mapAssetRows(assetRows, syncedAt);
  const bqAssetSnapshotRows = mapAssetSnapshotRows(assetSnapshotRows, syncedAt);
  console.log(`Flattened to ${bqRows.length} transaction rows, ${bqAssetRows.length} asset rows, ${bqAssetSnapshotRows.length} asset snapshot rows`);

  const bq = new BigQuery({ projectId });

  // Ensure dataset exists
  const [datasetExists] = await bq.dataset(DATASET).exists();
  if (!datasetExists) {
    await bq.createDataset(DATASET, { location: 'EU' });
    console.log(`Created dataset ${DATASET}`);
  }

  await loadTable(bq, 'transactions', bqRows, TRANSACTIONS_SCHEMA);
  await loadTable(bq, 'assets', bqAssetRows, ASSETS_SCHEMA);
  await loadTable(bq, 'asset_snapshots', bqAssetSnapshotRows, ASSET_SNAPSHOTS_SCHEMA);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
