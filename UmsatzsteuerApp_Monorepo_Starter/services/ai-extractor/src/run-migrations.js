import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function alreadyApplied(filename) {
  const { rows } = await query(
    'SELECT 1 FROM schema_migrations WHERE filename = $1 LIMIT 1',
    [filename]
  );
  return rows.length > 0;
}

async function applyMigration(filename, sql) {
  try {
    await query('BEGIN');
    await query(sql);
    await query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    await query('COMMIT');
    console.log(`✅ ${filename} applied`);
  } catch (e) {
    await query('ROLLBACK');
    console.error(`❌ ${filename} failed: ${e.message}`);
    throw e;
  }
}

export async function runMigrations() {
  await ensureMigrationsTable();
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort(); // alphabetisch/nummerisch

  for (const f of files) {
    if (await alreadyApplied(f)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    await applyMigration(f, sql);
  }
}
