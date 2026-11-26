import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global {
  var __risaPool: Pool | undefined;
}

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and add your Supabase connection string.");
  }
  if (!global.__risaPool) {
    const url = process.env.DATABASE_URL;
    const local = /localhost|127\.0\.0\.1/.test(url);
    global.__risaPool = new Pool({
      connectionString: url,
      ssl: local ? undefined : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return global.__risaPool;
}

export async function q<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await getPool().query<T>(text, params);
  return res.rows;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
