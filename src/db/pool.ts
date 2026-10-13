import { Pool } from 'pg';
import type { AppConfig } from '../config/env.js';

export function createPool(appConfig: AppConfig): Pool {
  return new Pool({
    connectionString: appConfig.databaseUrl,
    max: appConfig.nodeEnv === 'test' ? 5 : 20,
    idleTimeoutMillis: 30_000,
    ssl: appConfig.nodeEnv === 'production' ? { rejectUnauthorized: false } : undefined
  });
}
