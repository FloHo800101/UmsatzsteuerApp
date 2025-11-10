// services/ai-extractor/src/db.js
import { Pool } from "pg";

function needsSSL(connectionString) {
  if (String(process.env.PGSSLMODE || "").toLowerCase() === "require" ||
      String(process.env.PGSSLMODE || "").toLowerCase() === "true") {
    return true;
  }
  return /\bsslmode\s*=\s*require\b/i.test(String(connectionString || ""));
}

const connectionString = process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString,
  ssl: needsSSL(connectionString) ? { rejectUnauthorized: false } : undefined
});

export async function query(sql, params) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}
