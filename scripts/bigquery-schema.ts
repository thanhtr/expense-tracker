import type { TableField } from '@google-cloud/bigquery';

export const TRANSACTIONS_SCHEMA: TableField[] = [
  { name: 'id',         type: 'INTEGER',   mode: 'REQUIRED'  },
  { name: 'split_id',   type: 'INTEGER',   mode: 'NULLABLE'  },
  { name: 'date',       type: 'DATE',      mode: 'REQUIRED'  },
  { name: 'account',    type: 'STRING',    mode: 'REQUIRED'  },
  { name: 'merchant',   type: 'STRING',    mode: 'REQUIRED'  },
  { name: 'amount',     type: 'NUMERIC',   mode: 'REQUIRED'  },
  { name: 'type',       type: 'STRING',    mode: 'REQUIRED'  },
  { name: 'category',   type: 'STRING',    mode: 'REQUIRED'  },
  { name: 'paid_by',    type: 'STRING',    mode: 'REQUIRED'  },
  { name: 'note',       type: 'STRING',    mode: 'NULLABLE'  },
  { name: 'tags',       type: 'STRING',    mode: 'REPEATED'  },
  { name: 'is_split',   type: 'BOOLEAN',   mode: 'REQUIRED'  },
  { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED'  },
  { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED'  },
  { name: 'synced_at',  type: 'TIMESTAMP', mode: 'REQUIRED'  },
];

export const ASSETS_SCHEMA: TableField[] = [
  { name: 'id',          type: 'INTEGER',   mode: 'REQUIRED' },
  { name: 'name',        type: 'STRING',    mode: 'REQUIRED' },
  { name: 'type',        type: 'STRING',    mode: 'REQUIRED' },
  { name: 'balance',     type: 'NUMERIC',   mode: 'REQUIRED' },
  { name: 'recorded_at', type: 'DATE',      mode: 'REQUIRED' },
  { name: 'created_at',  type: 'TIMESTAMP', mode: 'REQUIRED' },
  { name: 'updated_at',  type: 'TIMESTAMP', mode: 'REQUIRED' },
  { name: 'synced_at',   type: 'TIMESTAMP', mode: 'REQUIRED' },
];

export const ASSET_SNAPSHOTS_SCHEMA: TableField[] = [
  { name: 'id',          type: 'INTEGER',   mode: 'REQUIRED' },
  { name: 'asset_id',    type: 'INTEGER',   mode: 'REQUIRED' },
  { name: 'name',        type: 'STRING',    mode: 'REQUIRED' },
  { name: 'type',        type: 'STRING',    mode: 'REQUIRED' },
  { name: 'balance',     type: 'NUMERIC',   mode: 'REQUIRED' },
  { name: 'recorded_at', type: 'DATE',      mode: 'REQUIRED' },
  { name: 'created_at',  type: 'TIMESTAMP', mode: 'REQUIRED' },
  { name: 'synced_at',   type: 'TIMESTAMP', mode: 'REQUIRED' },
];
