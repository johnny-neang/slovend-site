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

export type AlertsSummary = {
  hasData: boolean;
  total: number;
  bySeverity: { high: number; med: number; low: number };
  byCategory: { category: string; n: number }[];
  byDay: { label: string; n: number }[];
  rows: AlertEventRow[];
};

const EMPTY: AlertsSummary = {
  hasData: false,
  total: 0,
  bySeverity: { high: 0, med: 0, low: 0 },
  byCategory: [],
  byDay: [],
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
): Promise<AlertsSummary> {
  if (!dbConfigured() || !machineId) return EMPTY;
  await ensureSchema();
  const sql = getSql();
  const Z = sqlTz(timezone);
  const { where, params } = buildWhere(userKey, machineId, win, Z, filter);

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

    const dayRows = (await sql.query(
      `select to_char(date_trunc('day', occurred_at at time zone ${Z}), 'YYYY-MM-DD') as d,
              count(*)::int as n
       from alerts where ${where}
       group by 1 order by 1`,
      params,
    )) as { d: string; n: number }[];

    const rawRows = (await sql.query(
      `select to_char(occurred_at at time zone ${Z}, 'YYYY-MM-DD HH24:MI:SS') as local_time,
              coalesce(nullif(severity,''),'low') as severity,
              coalesce(nullif(category,''),'') as category,
              coalesce(nullif(event,''),'Event') as event
       from alerts where ${where}
       order by occurred_at desc nulls last
       limit 500`,
      params,
    )) as { local_time: string | null; severity: string; category: string; event: string }[];

    return {
      hasData: true,
      total,
      bySeverity,
      byCategory,
      byDay: fillDays(dayRows, win.fromDate, win.toDate),
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

function shortMD(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** Fill every day in the window (zeros for quiet days); bucket weekly past ~45 days. */
function fillDays(
  rows: { d: string; n: number }[],
  fromDate: string,
  toDate: string,
): { label: string; n: number }[] {
  const map = new Map(rows.map((r) => [r.d, r.n]));
  const days: { date: string; n: number }[] = [];
  let t = Date.parse(`${fromDate}T00:00:00Z`);
  const end = Date.parse(`${toDate}T00:00:00Z`);
  while (t <= end) {
    const iso = new Date(t).toISOString().slice(0, 10);
    days.push({ date: iso, n: map.get(iso) ?? 0 });
    t += 86400000;
  }
  if (days.length <= 45) return days.map((d) => ({ label: shortMD(d.date), n: d.n }));
  const out: { label: string; n: number }[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const grp = days.slice(i, i + 7);
    out.push({ label: shortMD(grp[0].date), n: grp.reduce((s, x) => s + x.n, 0) });
  }
  return out;
}
