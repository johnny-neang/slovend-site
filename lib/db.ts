import "server-only";
import { neon } from "@neondatabase/serverless";

/**
 * Neon Postgres client. Active only when DATABASE_URL is set (provisioned via
 * the Vercel Marketplace Neon integration). Until then, callers fall back to a
 * per-browser cookie (see lib/connections.ts).
 */
export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

let _sql: ReturnType<typeof neon> | null = null;
export function getSql() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL!);
  return _sql;
}

let _schema: Promise<void> | null = null;
export function ensureSchema(): Promise<void> {
  if (!_schema) {
    const sql = getSql();
    _schema = (async () => {
      await sql`
        create table if not exists nayax_connections (
          user_key   text primary key,
          base       text not null,
          token_enc  text not null,
          machine_id text,
          updated_at timestamptz not null default now()
        )
      `;
    })();
  }
  return _schema;
}
