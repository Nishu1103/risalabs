/**
 * npm run seed
 * Applies supabase/schema.sql (drops & recreates tables) then loads `data/Sponsor Dataset.xlsx`.
 */
import "./env";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getPool } from "../lib/db";
import { resetDatabase } from "../lib/seed";

async function main() {
  const pool = getPool();
  const sql = readFileSync(path.join(process.cwd(), "supabase", "schema.sql"), "utf8");
  await pool.query(sql);
  console.log("✓ schema applied");
  const r = await resetDatabase();
  console.log("✓ dataset loaded", JSON.stringify(r, null, 2));
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
