import "server-only";
import { dbConfigured, getSql, ensureSchema } from "@/lib/db";

/** Fire-and-forget: record one MCP tool call so the dashboard can show usage. */
export async function logMcpCall(userKey: string, tool: string, clientId: string): Promise<void> {
  if (!dbConfigured() || !userKey) return;
  try {
    await ensureSchema();
    const sql = getSql();
    await sql`insert into mcp_activity (user_key, tool, client_id) values (${userKey}, ${tool}, ${clientId})`;
  } catch (e) {
    console.error("logMcpCall failed", e);
  }
}

export type McpStatus = {
  totalCalls: number;
  last7d: number;
  lastCall: string | null;
  lastClient: string | null;
  recentTools: { tool: string; n: number }[];
};

const EMPTY: McpStatus = {
  totalCalls: 0,
  last7d: 0,
  lastCall: null,
  lastClient: null,
  recentTools: [],
};

export async function getMcpStatus(userKey: string): Promise<McpStatus> {
  if (!dbConfigured() || !userKey) return EMPTY;
  try {
    await ensureSchema();
    const sql = getSql();
    const totals = (await sql`
      select count(*)::int as total,
             count(*) filter (where created_at >= now() - interval '7 days')::int as last7,
             to_char(max(created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as last_call
      from mcp_activity where user_key = ${userKey}
    `) as { total: number; last7: number; last_call: string | null }[];
    const lastClient = (await sql`
      select client_id from mcp_activity where user_key = ${userKey}
      order by created_at desc limit 1
    `) as { client_id: string | null }[];
    const tools = (await sql`
      select tool, count(*)::int as n from mcp_activity
      where user_key = ${userKey} and created_at >= now() - interval '30 days'
      group by tool order by n desc limit 8
    `) as { tool: string; n: number }[];
    const t = totals[0] ?? { total: 0, last7: 0, last_call: null };
    return {
      totalCalls: t.total,
      last7d: t.last7,
      lastCall: t.last_call,
      lastClient: lastClient[0]?.client_id ?? null,
      recentTools: tools,
    };
  } catch (e) {
    console.error("getMcpStatus failed", e);
    return EMPTY;
  }
}
