import "server-only";
import { randomUUID } from "crypto";
import { getSql, ensureSchema, dbConfigured } from "@/lib/db";

export type ThreadRow = {
  id: string;
  machine_id: string | null;
  title: string;
  updated_at: string;
};
export type MsgRow = { role: "user" | "assistant"; content: string };

export function chatConfigured(): boolean {
  return dbConfigured();
}

export async function listThreads(userKey: string): Promise<ThreadRow[]> {
  if (!dbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();
  return (await sql`
    select id, machine_id, title, updated_at
    from chat_threads where user_key = ${userKey}
    order by updated_at desc limit 50
  `) as ThreadRow[];
}

export async function createThread(userKey: string, machineId: string): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const id = randomUUID();
  await sql`insert into chat_threads (id, user_key, machine_id) values (${id}, ${userKey}, ${machineId})`;
  return id;
}

export async function ownThread(userKey: string, threadId: string): Promise<ThreadRow | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    select id, machine_id, title, updated_at
    from chat_threads where id = ${threadId} and user_key = ${userKey} limit 1
  `) as ThreadRow[];
  return rows[0] ?? null;
}

export async function getMessages(threadId: string): Promise<MsgRow[]> {
  await ensureSchema();
  const sql = getSql();
  return (await sql`
    select role, content from chat_messages where thread_id = ${threadId} order by id asc
  `) as MsgRow[];
}

export async function addMessage(threadId: string, role: string, content: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`insert into chat_messages (thread_id, role, content) values (${threadId}, ${role}, ${content})`;
  await sql`update chat_threads set updated_at = now() where id = ${threadId}`;
}

export async function setTitleIfNew(threadId: string, title: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`update chat_threads set title = ${title} where id = ${threadId} and title = 'New chat'`;
}

export async function deleteThread(userKey: string, threadId: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`delete from chat_threads where id = ${threadId} and user_key = ${userKey}`;
}
