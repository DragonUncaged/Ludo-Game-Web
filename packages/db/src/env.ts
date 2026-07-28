import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** Load the repo-root .env (if present) into process.env. No-op when vars are already set. */
export function loadRootEnv(): void {
  if (process.env.DATABASE_URL) return;
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const envPath = join(root, '.env');
  if (existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath);
    } catch {
      /* best-effort */
    }
  }
}
