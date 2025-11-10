import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { migrateIfNeeded, pool } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sqlText = fs.readFileSync(schemaPath, "utf8");
  await migrateIfNeeded(sqlText);
  console.log("Migration completed.");
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
