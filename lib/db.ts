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
      await sql`
        create table if not exists sales (
          id              bigserial primary key,
          user_key        text not null,
          machine_id      text not null,
          txn_id          text not null,
          product         text,
          amount          double precision,
          currency        text,
          payment_method  text,
          occurred_at     timestamptz,
          ingested_at     timestamptz not null default now(),
          unique (user_key, machine_id, txn_id)
        )
      `;
      await sql`create index if not exists sales_machine_time_idx on sales (user_key, machine_id, occurred_at desc)`;
      await sql`
        create table if not exists machine_settings (
          user_key    text not null,
          machine_id  text not null,
          timezone    text not null default 'America/Los_Angeles',
          updated_at  timestamptz not null default now(),
          primary key (user_key, machine_id)
        )
      `;
      await sql`
        create table if not exists tax_settings (
          user_key    text not null,
          machine_id  text not null,
          rate_pct    double precision not null default 0,
          taxable_pct double precision not null default 100,
          inclusive   boolean not null default true,
          timezone    text not null default 'America/Los_Angeles',
          updated_at  timestamptz not null default now(),
          primary key (user_key, machine_id)
        )
      `;
      await sql`
        create table if not exists mcp_activity (
          id         bigserial primary key,
          user_key   text not null,
          tool       text not null,
          client_id  text,
          created_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists mcp_activity_user_idx on mcp_activity (user_key, created_at desc)`;
      await sql`
        create table if not exists ingest_runs (
          id           bigserial primary key,
          trigger      text not null default 'cron',
          ok           boolean not null,
          connections  int not null default 0,
          machines     int not null default 0,
          ingested     int not null default 0,
          errors       int not null default 0,
          error_detail jsonb,
          duration_ms  int,
          created_at   timestamptz not null default now()
        )
      `;
      await sql`create index if not exists ingest_runs_time_idx on ingest_runs (created_at desc)`;
      await sql`
        create table if not exists alerts (
          id          bigserial primary key,
          user_key    text not null,
          machine_id  text not null,
          event_key   text not null,
          event       text,
          category    text,
          severity    text,
          occurred_at timestamptz,
          ingested_at timestamptz not null default now(),
          unique (user_key, machine_id, event_key)
        )
      `;
      await sql`create index if not exists alerts_machine_time_idx on alerts (user_key, machine_id, occurred_at desc)`;
      await sql`
        create table if not exists machine_health (
          id          bigserial primary key,
          user_key    text not null,
          machine_id  text not null,
          online      boolean,
          rssi        integer,
          temp_c      double precision,
          last_seen   text,
          captured_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists machine_health_time_idx on machine_health (user_key, machine_id, captured_at desc)`;
      await sql`
        create table if not exists machine_product_media (
          user_key    text not null,
          machine_id  text not null,
          mdb_code    integer not null,
          name        text,
          description text,
          image_url   text,
          image_path  text,
          source      text not null default 'manual',
          updated_at  timestamptz not null default now(),
          primary key (user_key, machine_id, mdb_code)
        )
      `;
      await sql`
        create table if not exists machine_landing (
          user_key       text not null,
          machine_id     text not null,
          machine_number text not null,
          slug           text,
          enabled        boolean not null default false,
          machine_name   text,
          location       text,
          published_at   timestamptz,
          updated_at     timestamptz not null default now(),
          primary key (user_key, machine_id)
        )
      `;
      await sql`create unique index if not exists machine_landing_slug_idx on machine_landing (slug) where slug is not null`;
      await sql`create unique index if not exists machine_landing_number_idx on machine_landing (machine_number)`;
      await sql`alter table machine_landing add column if not exists title text`;
      await sql`
        create table if not exists machine_landing_assets (
          asset_id    text primary key,
          user_key    text not null,
          machine_id  text not null,
          media_type  text not null,
          blob_url    text not null,
          blob_path   text not null,
          poster_url  text,
          order_idx   int not null default 0,
          created_at  timestamptz not null default now()
        )
      `;
      await sql`create index if not exists machine_landing_assets_idx on machine_landing_assets (user_key, machine_id, order_idx)`;
      await sql`
        create table if not exists landing_scans (
          id          bigserial primary key,
          user_key    text not null,
          machine_id  text not null,
          source      text not null default 'qr',
          occurred_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists landing_scans_idx on landing_scans (user_key, machine_id, occurred_at desc)`;
    })();
  }
  return _schema;
}
