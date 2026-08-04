import "server-only";
import { dbConfigured, getSql, ensureSchema } from "@/lib/db";
import { deleteConnection } from "@/lib/connections";

/**
 * Permanently delete every piece of a user's Slovend Intelligence data. Strictly scoped by
 * user_key. chat_messages is removed via the chat_threads ON DELETE CASCADE;
 * the Nayax connection (DB row + cookie fallback) is cleared via deleteConnection.
 */
export async function deleteAllUserData(userKey: string): Promise<void> {
  if (!userKey) return;
  if (dbConfigured()) {
    await ensureSchema();
    const sql = getSql();
    await sql`delete from sales where user_key = ${userKey}`;
    await sql`delete from machine_settings where user_key = ${userKey}`;
    await sql`delete from tax_settings where user_key = ${userKey}`;
    await sql`delete from chat_threads where user_key = ${userKey}`;
    await sql`delete from mcp_activity where user_key = ${userKey}`;
    await sql`delete from planogram_writes where user_key = ${userKey}`;
  }
  await deleteConnection(userKey);
}
