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
      await sql`
        create table if not exists chat_threads (
          id         text primary key,
          user_key   text not null,
          machine_id text,
          title      text not null default 'New chat',
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      await sql`
        create table if not exists chat_messages (
          id         bigserial primary key,
          thread_id  text not null references chat_threads(id) on delete cascade,
          role       text not null,
          content    text not null,
          created_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists chat_threads_user_idx on chat_threads (user_key, updated_at desc)`;
      await sql`create index if not exists chat_messages_thread_idx on chat_messages (thread_id, id)`;
    })();
  }
  return _schema;
}
