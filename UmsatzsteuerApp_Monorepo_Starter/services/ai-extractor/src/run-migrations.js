// services/ai-extractor/src/run-migrations.js
import { query } from "./db.js";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGR_DIR = path.join(__dirname, "..", "migrations");

async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedSet() {
  const { rows } = await query(`SELECT filename FROM schema_migrations`);
  return new Set(rows.map(r => r.filename));
}

async function applyMigration(fileName, sql) {
  console.log(`Applying migration ${fileName}...`);
  await query("BEGIN");
  try {
    await query(sql);
    await query(`INSERT INTO schema_migrations(filename) VALUES ($1)`, [fileName]);
    await query("COMMIT");
    console.log(`✅ ${fileName} applied`);
  } catch (e) {
    await query("ROLLBACK");
    console.error(`❌ ${fileName} failed:`, e.message);
    throw e;
  }
}

export default async function runMigrations() {
  await ensureMigrationsTable();
  const files = (await readdir(MIGR_DIR))
    .filter(f => f.endsWith(".sql"))
    .sort();
  const done = await appliedSet();

  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await readFile(path.join(MIGR_DIR, f), "utf8");
    await applyMigration(f, sql);
  }
}

// Allow CLI run: node src/run-migrations.js
if (process.argv[1] && process.argv[1].endsWith("run-migrations.js")) {
  runMigrations().catch(err => {
    console.error("Migration error:", err);
    process.exit(1);
  });
}
