import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getPool, closePool } from './pool.js';
import { loadRootEnv } from './env.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrate(): Promise<string[]> {
  const pool = getPool();
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())'
  );
  const applied = new Set(
    (await pool.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version as string)
  );
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      ran.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  return ran;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  loadRootEnv();
  migrate()
    .then((ran) => {
      console.log(ran.length ? `applied: ${ran.join(', ')}` : 'nothing to apply');
      return closePool();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
