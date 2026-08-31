import { loadEnvConfig } from '@next/env';

const { combinedEnv } = loadEnvConfig(process.cwd());

const config = {
  datasource: {
    url: combinedEnv.DATABASE_URL,
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
};

export default config;
