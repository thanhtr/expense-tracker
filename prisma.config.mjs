import { loadEnvConfig } from '@next/env';

const { combinedEnv } = loadEnvConfig(process.cwd());

const config = {
  datasource: {
    url: combinedEnv.DATABASE_URL,
  },
};

export default config;
