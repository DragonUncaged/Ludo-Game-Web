import { Pool } from 'pg';
import type { PoolClient } from 'pg';

let pool: Pool | null = null;

export function dbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    pool = new Pool({ connectionString, max: 5 });
    pool.on('error', (err) => console.error('[db] idle client error', err));
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** For writes the game loop fires and forgets: a slow or failing DB is logged, never thrown. */
export async function safeWrite(label: string, fn: () => Promise<unknown>): Promise<void> {
  if (!dbEnabled()) return;
  try {
    await fn();
  } catch (err) {
    console.error(`[db] ${label} failed`, err);
  }
}
