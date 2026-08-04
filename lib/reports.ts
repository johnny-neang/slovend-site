import "server-only";
import {
  dbConfigured,
  getSql,
  ensureSchema,
  SALE_IS_VEND,
  SALE_IS_VEND_AS,
} from "@/lib/db";
import { sqlTz } from "@/lib/settings";
import { mdbToSlot } from "@/lib/slot-code";
import type { Win } from "@/lib/window";

export type ReportSummary = {
  hasData: boolean;
  vends: number;
  revenue: number;
  activeDays: number;
  byDay: { label: string; vends: number; revenue: number }[];
  topProducts: { product: string; vends: number; revenue: number }[];
  payMix: { method: string; n: number }[];
  hours: { hr: number; n: number }[];
};

const EMPTY: ReportSummary = {
  hasData: false,
  vends: 0,
  revenue: 0,
  activeDays: 0,
  byDay: [],
  topProducts: [],
  payMix: [],
  hours: [],
};

export async function reportSummary(
  userKey: string,
  machineId: string,
  win: Win,
  timezone: string,
): Promise<ReportSummary> {
  if (!dbConfigured() || !machineId) return EMPTY;
  await ensureSchema();
  const sql = getSql();
  const Z = sqlTz(timezone); // whitelisted, inlined as a literal (not a bound param)
  const from = win.fromDate;
  const to = win.toDate;
  const P = [userKey, machineId, from, to];
  // Rows ingested before the ingest-side noise filter are still in the table, so
  // every read carries SALE_IS_VEND.
  const bounds =
    `user_key = $1 and machine_id = $2 and ${SALE_IS_VEND} ` +
    `and occurred_at >= ($3::date)::timestamp at time zone ${Z} ` +
    `and occurred_at <  (($4::date + 1)::timestamp) at time zone ${Z}`;

  // Buckets/bounds are evaluated in the machine's local timezone so the day and
  // hour-of-day charts line up with the operator's clock (matches the Tax page).
  try {
    const totals = (await sql.query(
      `select count(*)::int as vends,
              coalesce(sum(amount),0)::float as revenue,
              count(distinct date_trunc('day', occurred_at at time zone ${Z}))::int as active_days
       from sales where ${bounds}`,
      P,
    )) as { vends: number; revenue: number; active_days: number }[];

    const t = totals[0] ?? { vends: 0, revenue: 0, active_days: 0 };
    if (!t.vends) return EMPTY;

    const dayRows = (await sql.query(
      `select to_char(date_trunc('day', occurred_at at time zone ${Z}), 'YYYY-MM-DD') as d,
              count(*)::int as vends,
              coalesce(sum(amount),0)::float as revenue
       from sales where ${bounds}
       group by date_trunc('day', occurred_at at time zone ${Z})
       order by date_trunc('day', occurred_at at time zone ${Z})`,
      P,
    )) as { d: string; vends: number; revenue: number }[];
    const byDay = bucketSeries(dayRows, from, to);

    // Grouped by slot, not by the raw Lynx label. Lynx names every row
    // "Unknown(1031 = 7.00)", so grouping on the label splits one slot across
    // every price it has ever sold at and shows the operator nothing readable.
    // mdb_code collapses those into one row per physical selection; rows with no
    // decodable code fall back to the label so nothing is silently dropped.
    // min(product) rather than a bare column: the grouping key for unattributable
    // rows is the label itself, so min() is that same label, and for slot-grouped
    // rows the label is discarded in favour of "Slot NNN". A bare `product` here
    // is not functionally dependent on the GROUP BY and Postgres rejects it.
    const topRows = (await sql.query(
      `select mdb_code,
              min(coalesce(nullif(product,''),'—')) as product,
              count(*)::int as vends,
              coalesce(sum(amount),0)::float as revenue
       from sales where ${bounds}
       group by mdb_code, case when mdb_code is null then product else '' end
       order by revenue desc limit 10`,
      P,
    )) as { mdb_code: number | null; product: string; vends: number; revenue: number }[];
    const topProducts = topRows.map((r) => ({
      product: r.mdb_code != null && r.mdb_code > 0 ? `Slot ${mdbToSlot(r.mdb_code)}` : r.product,
      vends: r.vends,
      revenue: r.revenue,
    }));

    const payMix = (await sql.query(
      `select coalesce(nullif(payment_method,''),'Unknown') as method, count(*)::int as n
       from sales where ${bounds}
       group by 1 order by n desc`,
      P,
    )) as { method: string; n: number }[];

    const hours = (await sql.query(
      `select extract(hour from occurred_at at time zone ${Z})::int as hr, count(*)::int as n
       from sales where ${bounds}
       group by 1 order by 1`,
      P,
    )) as { hr: number; n: number }[];

    return {
      hasData: true,
      vends: t.vends,
      revenue: t.revenue,
      activeDays: t.active_days,
      byDay,
      topProducts,
      payMix,
      hours,
    };
  } catch (e) {
    console.error("reportSummary query failed", e);
    return EMPTY;
  }
}

function shortMD(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/**
 * Fill every day in [fromDate, toDate] (zeros for days with no sales) so the chart
 * spans the whole selected window, then bucket: daily for short ranges, weekly once
 * a range exceeds ~6 weeks so the bars stay readable.
 */
function bucketSeries(
  rows: { d: string; vends: number; revenue: number }[],
  fromDate: string,
  toDate: string,
): { label: string; vends: number; revenue: number }[] {
  const map = new Map(rows.map((r) => [r.d, r]));
  const days: { date: string; vends: number; revenue: number }[] = [];
  let t = Date.parse(`${fromDate}T00:00:00Z`);
  const end = Date.parse(`${toDate}T00:00:00Z`);
  while (t <= end) {
    const iso = new Date(t).toISOString().slice(0, 10);
    const r = map.get(iso);
    days.push({ date: iso, vends: r?.vends ?? 0, revenue: r?.revenue ?? 0 });
    t += 86400000;
  }
  if (days.length <= 45) {
    return days.map((d) => ({ label: shortMD(d.date), vends: d.vends, revenue: d.revenue }));
  }
  const out: { label: string; vends: number; revenue: number }[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const grp = days.slice(i, i + 7);
    out.push({
      label: shortMD(grp[0].date),
      vends: grp.reduce((s, x) => s + x.vends, 0),
      revenue: grp.reduce((s, x) => s + x.revenue, 0),
    });
  }
  return out;
}

export type SlotVends = {
  mdb: number;
  slot: string;
  vends: number;
  revenue: number;
  lastSold: string | null;
};

/**
 * Vends per slot over a rolling window, busiest first — the demand half of the
 * restock pick list. Only rows with a decodable MDB are returned: a slot is the
 * unit an operator physically refills, and an unattributable sale can't be
 * assigned to one.
 */
export async function vendsBySlot(
  userKey: string,
  machineId: string,
  days = 7,
  limit = 12,
): Promise<SlotVends[]> {
  if (!dbConfigured() || !machineId) return [];
  await ensureSchema();
  const sql = getSql();
  try {
    const rows = (await sql`
      select mdb_code,
             count(*)::int as vends,
             coalesce(sum(amount),0)::float as revenue,
             max(occurred_at) as last_sold
        from sales
       where user_key = ${userKey} and machine_id = ${machineId}
         and mdb_code is not null and mdb_code > 0
         and occurred_at >= now() - make_interval(days => ${days})
       group by mdb_code
       order by vends desc, revenue desc
       limit ${limit}
    `) as { mdb_code: number; vends: number; revenue: number; last_sold: string | null }[];
    return rows.map((r) => ({
      mdb: r.mdb_code,
      slot: mdbToSlot(r.mdb_code),
      vends: r.vends,
      revenue: r.revenue,
      lastSold: r.last_sold,
    }));
  } catch (e) {
    console.error("vendsBySlot failed", e);
    return [];
  }
}

/**
 * Share of vends that happen at or after `hour` (machine-local), over a rolling
 * window. Drives the restock-timing hint — computed, never hardcoded, so the
 * advice tracks the machine's real pattern instead of asserting a stale finding.
 */
export async function shareOfVendsAfter(
  userKey: string,
  machineId: string,
  timezone: string,
  hour = 12,
  days = 90,
): Promise<{ pct: number; vends: number } | null> {
  if (!dbConfigured() || !machineId) return null;
  await ensureSchema();
  const sql = getSql();
  const Z = sqlTz(timezone);
  try {
    const rows = (await sql.query(
      `select count(*)::int as total,
              count(*) filter (
                where extract(hour from occurred_at at time zone ${Z}) >= $3
              )::int as after
         from sales
        where user_key = $1 and machine_id = $2 and ${SALE_IS_VEND}
          and occurred_at >= now() - make_interval(days => $4)`,
      [userKey, machineId, hour, days],
    )) as { total: number; after: number }[];
    const r = rows[0];
    if (!r || !r.total) return null;
    return { pct: Math.round((r.after / r.total) * 100), vends: r.total };
  } catch (e) {
    console.error("shareOfVendsAfter failed", e);
    return null;
  }
}

/** Time-boxed totals for the overview: last 24 hours and last 7 days. */
export async function overviewTotals(
  userKey: string,
  machineId: string,
): Promise<{ rev24: number; v24: number; rev7: number; v7: number }> {
  const zero = { rev24: 0, v24: 0, rev7: 0, v7: 0 };
  if (!dbConfigured() || !machineId) return zero;
  await ensureSchema();
  const sql = getSql();
  try {
    const rows = (await sql`
      select
        coalesce(sum(amount) filter (where occurred_at >= now() - interval '24 hours'), 0)::float as rev24,
        count(*) filter (where occurred_at >= now() - interval '24 hours')::int as v24,
        coalesce(sum(amount), 0)::float as rev7,
        count(*)::int as v7
      from sales
      where user_key = ${userKey} and machine_id = ${machineId}
        and not (coalesce(amount,0) = 0 and coalesce(mdb_code,0) = -1)
        and occurred_at >= now() - interval '7 days'
    `) as { rev24: number; v24: number; rev7: number; v7: number }[];
    return rows[0] ?? zero;
  } catch (e) {
    console.error("overviewTotals failed", e);
    return zero;
  }
}

export type HourBucket = { hod: number; revenue: number; vends: number };

/**
 * Revenue + vend count per hour for the last 24 rolling hours, in the machine's
 * local timezone. Always returns exactly 24 buckets (zeros for quiet hours),
 * oldest → newest. Used by the Overview "last 24h" chart.
 */
export async function salesByHourLast24h(
  userKey: string,
  machineId: string,
  timezone: string,
): Promise<HourBucket[]> {
  if (!dbConfigured() || !machineId) return [];
  await ensureSchema();
  const sql = getSql();
  const Z = sqlTz(timezone); // whitelisted, inlined literal
  try {
    const rows = (await sql.query(
      `with hours as (
         select generate_series(
           date_trunc('hour', (now() at time zone ${Z})) - interval '23 hours',
           date_trunc('hour', (now() at time zone ${Z})),
           interval '1 hour'
         ) as h
       )
       select extract(hour from hours.h)::int as hod,
              count(s.id)::int as vends,
              coalesce(sum(s.amount), 0)::float as revenue
       from hours
       left join sales s
         on s.user_key = $1 and s.machine_id = $2
         and ${SALE_IS_VEND_AS("s")}
         and s.occurred_at >= now() - interval '25 hours'
         and date_trunc('hour', s.occurred_at at time zone ${Z}) = hours.h
       group by hours.h
       order by hours.h`,
      [userKey, machineId],
    )) as { hod: number; vends: number; revenue: number }[];
    return rows.map((r) => ({ hod: r.hod, vends: r.vends, revenue: r.revenue }));
  } catch (e) {
    console.error("salesByHourLast24h failed", e);
    return [];
  }
}
