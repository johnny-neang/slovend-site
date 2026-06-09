import "server-only";
import { dbConfigured, getSql, ensureSchema } from "@/lib/db";
import { sqlTz } from "@/lib/settings";
import type { Win } from "@/lib/window";

export type Severity = "high" | "med" | "low";

export type AlertFilter = {
  q?: string;
  severity?: Severity;
  category?: string;
};

export type AlertEventRow = {
  time: string; // local wall-clock "YYYY-MM-DD HH:MM:SS" in the machine timezone
  severity: string;
  category: string;
  event: string;
};

export const ALERTS_PAGE_SIZE = 100;

export type AlertsSummary = {
  hasData: boolean;
  total: number; // total matching events in the window (across all pages)
  bySeverity: { high: number; med: number; low: number };
  byCategory: { category: string; n: number }[];
  rows: AlertEventRow[]; // just the requested page
};

const EMPTY: AlertsSummary = {
  hasData: false,
  total: 0,
  bySeverity: { high: 0, med: 0, low: 0 },
  byCategory: [],
  rows: [],
};

const SEVERITIES: Severity[] = ["high", "med", "low"];

/**
 * Build the shared WHERE clause + bound params. Time bounds are evaluated in the
 * machine's local timezone (matches reports/tax). Text search is ILIKE on event
 * and category; severity/category are equality filters. The tz literal `Z` is
 * whitelisted and inlined (AT TIME ZONE can't take a bound param).
 */
function buildWhere(
  userKey: string,
  machineId: string,
  win: Win,
  Z: string,
  filter: AlertFilter,
): { where: string; params: unknown[] } {
  const params: unknown[] = [userKey, machineId, win.fromDate, win.toDate];
  let where =
    `user_key = $1 and machine_id = $2 ` +
    `and occurred_at >= ($3::date)::timestamp at time zone ${Z} ` +
    `and occurred_at <  (($4::date + 1)::timestamp) at time zone ${Z}`;

  const q = (filter.q ?? "").trim();
  if (q) {
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    where += ` and (event ilike ${p} or category ilike ${p})`;
  }
  if (filter.severity && SEVERITIES.includes(filter.severity)) {
    params.push(filter.severity);
    where += ` and severity = $${params.length}`;
  }
  const cat = (filter.category ?? "").trim();
  if (cat) {
    params.push(cat);
    where += ` and coalesce(nullif(category,''),'—') = $${params.length}`;
  }
  return { where, params };
}

export async function alertsSummary(
  userKey: string,
  machineId: string,
  win: Win,
  timezone: string,
  filter: AlertFilter = {},
  page = 1,
  pageSize = ALERTS_PAGE_SIZE,
): Promise<AlertsSummary> {
  if (!dbConfigured() || !machineId) return EMPTY;
  await ensureSchema();
  const sql = getSql();
  const Z = sqlTz(timezone);
  const { where, params } = buildWhere(userKey, machineId, win, Z, filter);
  const size = Math.max(1, Math.min(500, Math.floor(pageSize)));
  const offset = Math.max(0, (Math.max(1, Math.floor(page)) - 1) * size);

  try {
    const sevRows = (await sql.query(
      `select coalesce(nullif(severity,''),'low') as severity, count(*)::int as n
       from alerts where ${where} group by 1`,
      params,
    )) as { severity: string; n: number }[];
    const bySeverity = { high: 0, med: 0, low: 0 };
    let total = 0;
    for (const r of sevRows) {
      total += r.n;
      if (r.severity === "high" || r.severity === "med" || r.severity === "low")
        bySeverity[r.severity] += r.n;
    }
    if (!total) return EMPTY;

    const byCategory = (await sql.query(
      `select coalesce(nullif(category,''),'—') as category, count(*)::int as n
       from alerts where ${where} group by 1 order by n desc limit 12`,
      params,
    )) as { category: string; n: number }[];

    const pageParams = [...params, size, offset];
    const rawRows = (await sql.query(
      `select to_char(occurred_at at time zone ${Z}, 'YYYY-MM-DD HH24:MI:SS') as local_time,
              coalesce(nullif(severity,''),'low') as severity,
              coalesce(nullif(category,''),'') as category,
              coalesce(nullif(event,''),'Event') as event
       from alerts where ${where}
       order by occurred_at desc nulls last
       limit $${params.length + 1} offset $${params.length + 2}`,
      pageParams,
    )) as { local_time: string | null; severity: string; category: string; event: string }[];

    return {
      hasData: true,
      total,
      bySeverity,
      byCategory,
      rows: rawRows.map((r) => ({
        time: r.local_time ?? "",
        severity: r.severity,
        category: r.category,
        event: r.event,
      })),
    };
  } catch (e) {
    console.error("alertsSummary query failed", e);
    return EMPTY;
  }
}

export async function alertsForExport(
  userKey: string,
  machineId: string,
  win: Win,
  timezone: string,
  filter: AlertFilter = {},
): Promise<AlertEventRow[]> {
  if (!dbConfigured() || !machineId) return [];
  await ensureSchema();
  const sql = getSql();
  const Z = sqlTz(timezone);
  const { where, params } = buildWhere(userKey, machineId, win, Z, filter);
  const rows = (await sql.query(
    `select to_char(occurred_at at time zone ${Z}, 'YYYY-MM-DD HH24:MI:SS') as local_time,
            coalesce(nullif(severity,''),'low') as severity,
            coalesce(nullif(category,''),'') as category,
            coalesce(nullif(event,''),'Event') as event
     from alerts where ${where}
     order by occurred_at desc nulls last
     limit 5000`,
    params,
  )) as { local_time: string | null; severity: string; category: string; event: string }[];
  return rows.map((r) => ({
    time: r.local_time ?? "",
    severity: r.severity,
    category: r.category,
    event: r.event,
  }));
}

/** Count of high-severity ("critical") events in the last `hours` (default 24). */
export async function countCriticalAlerts(
  userKey: string,
  machineId: string,
  hours = 24,
): Promise<number> {
  if (!dbConfigured() || !userKey || !machineId) return 0;
  await ensureSchema();
  const sql = getSql();
  const h = Math.max(1, Math.min(8760, Math.floor(hours)));
  try {
    const rows = (await sql`
      select count(*)::int as n from alerts
      where user_key = ${userKey} and machine_id = ${machineId}
        and severity = 'high'
        and occurred_at >= now() - (${h} || ' hours')::interval
    `) as { n: number }[];
    return rows[0]?.n ?? 0;
  } catch (e) {
    console.error("countCriticalAlerts failed", e);
    return 0;
  }
}

/**
 * The latest high-severity ("critical") events for a machine, newest first,
 * across all time (not date-bounded). Used by the Overview summary panel.
 */
export async function recentCriticalAlerts(
  userKey: string,
  machineId: string,
  timezone: string,
  limit = 5,
): Promise<AlertEventRow[]> {
  if (!dbConfigured() || !userKey || !machineId) return [];
  await ensureSchema();
  const sql = getSql();
  const Z = sqlTz(timezone);
  const n = Math.max(1, Math.min(20, Math.floor(limit)));
  try {
    const rows = (await sql.query(
      `select to_char(occurred_at at time zone ${Z}, 'YYYY-MM-DD HH24:MI:SS') as local_time,
              coalesce(nullif(severity,''),'low') as severity,
              coalesce(nullif(category,''),'') as category,
              coalesce(nullif(event,''),'Event') as event
       from alerts
       where user_key = $1 and machine_id = $2 and severity = 'high'
       order by occurred_at desc nulls last
       limit $3`,
      [userKey, machineId, n],
    )) as { local_time: string | null; severity: string; category: string; event: string }[];
    return rows.map((r) => ({
      time: r.local_time ?? "",
      severity: r.severity,
      category: r.category,
      event: r.event,
    }));
  } catch (e) {
    console.error("recentCriticalAlerts failed", e);
    return [];
  }
}
