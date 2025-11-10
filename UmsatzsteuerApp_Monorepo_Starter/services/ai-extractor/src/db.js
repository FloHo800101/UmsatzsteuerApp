import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[db] Missing env DATABASE_URL');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false } // Render-Postgres mit sslmode=require
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function getClient() {
  return pool.connect();
}
