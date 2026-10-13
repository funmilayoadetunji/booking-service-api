import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { config } from '../config/env.js';
import { createPool } from './pool.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultMigrationsDirectory = path.join(currentDirectory, 'migrations');

type Queryable = Pick<Pool, 'query'>;

export async function runMigrations(
  database: Queryable,
  migrationsDirectory = defaultMigrationsDirectory
): Promise<string[]> {
  await database.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const applied: string[] = [];

  for (const file of files) {
    const alreadyApplied = await database.query<{ id: string }>(
      'SELECT id FROM schema_migrations WHERE id = $1',
      [file]
    );
    if (alreadyApplied.rowCount) continue;

    const sql = await readFile(path.join(migrationsDirectory, file), 'utf8');
    await database.query('BEGIN');
    try {
      await database.query(sql);
      await database.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
      await database.query('COMMIT');
      applied.push(file);
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  }

  return applied;
}

async function main(): Promise<void> {
  const pool = createPool(config);
  try {
    const applied = await runMigrations(pool);
    console.log(applied.length ? `Applied migrations: ${applied.join(', ')}` : 'Database is up to date.');
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error: unknown) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  });
}
