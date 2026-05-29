import "server-only";
import { cookies } from "next/headers";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { dbConfigured, getSql, ensureSchema } from "@/lib/db";
import type { NayaxConn } from "@/lib/nayax";

/**
 * Per-user Nayax connection storage.
 *
 * - With DATABASE_URL set: persisted to Neon Postgres keyed by user (the token
 *   column is AES-256-GCM encrypted at rest). Survives across devices/sessions.
 * - Without it: falls back to an httpOnly+secure cookie (per-browser) so the
 *   feature keeps working before the database is provisioned.
 *
 * The raw token is never returned to the client and never logged.
 */

const COOKIE = "nayax_conn";

type Row = { base: string; token_enc: string; machine_id: string | null };

export async function getConnection(userKey: string): Promise<NayaxConn | null> {
  if (dbConfigured()) {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      select base, token_enc, machine_id
      from nayax_connections
      where user_key = ${userKey}
      limit 1
    `) as Row[];
    if (!rows.length) return null;
    const token = decryptSecret(rows[0].token_enc);
    if (!token) return null;
    return { base: rows[0].base, token, machineId: rows[0].machine_id ?? "" };
  }

  // cookie fallback
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as {
      base?: string;
      token_enc?: string;
      machineId?: string;
    };
    const token = obj.token_enc ? decryptSecret(obj.token_enc) : null;
    if (obj.base && token) {
      return { base: obj.base, token, machineId: obj.machineId ?? "" };
    }
  } catch {
    /* malformed */
  }
  return null;
}

export async function saveConnection(
  userKey: string,
  conn: NayaxConn,
): Promise<void> {
  const token_enc = encryptSecret(conn.token);

  if (dbConfigured()) {
    await ensureSchema();
    const sql = getSql();
    await sql`
      insert into nayax_connections (user_key, base, token_enc, machine_id, updated_at)
      values (${userKey}, ${conn.base}, ${token_enc}, ${conn.machineId}, now())
      on conflict (user_key) do update
        set base = excluded.base,
            token_enc = excluded.token_enc,
            machine_id = excluded.machine_id,
            updated_at = now()
    `;
    return;
  }

  (await cookies()).set(
    COOKIE,
    JSON.stringify({ base: conn.base, token_enc, machineId: conn.machineId }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    },
  );
}

export async function deleteConnection(userKey: string): Promise<void> {
  if (dbConfigured()) {
    await ensureSchema();
    const sql = getSql();
    await sql`delete from nayax_connections where user_key = ${userKey}`;
    return;
  }
  (await cookies()).delete(COOKIE);
}

/** All stored connections (DB-only), decrypted — for the ingestion cron. */
export async function listAllConnections(): Promise<
  { userKey: string; conn: NayaxConn }[]
> {
  if (!dbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    select user_key, base, token_enc, machine_id from nayax_connections
  `) as { user_key: string; base: string; token_enc: string; machine_id: string | null }[];
  const out: { userKey: string; conn: NayaxConn }[] = [];
  for (const r of rows) {
    const token = decryptSecret(r.token_enc);
    if (token) {
      out.push({
        userKey: r.user_key,
        conn: { base: r.base, token, machineId: r.machine_id ?? "" },
      });
    }
  }
  return out;
}
