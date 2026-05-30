import "server-only";
import { dbConfigured, getSql, ensureSchema } from "@/lib/db";
import { cleanTz } from "@/lib/settings";
import type { Win } from "@/lib/window";

export type TaxSettings = {
  ratePct: number;
  taxablePct: number;
  inclusive: boolean;
};

const DEFAULTS: TaxSettings = {
  ratePct: 0,
  taxablePct: 100,
  inclusive: true,
};

function clampPct(n: number, max: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

export async function getTaxSettings(userKey: string, machineId: string): Promise<TaxSettings> {
  if (!dbConfigured() || !machineId) return DEFAULTS;
  await ensureSchema();
  const sql = getSql();
  try {
    const rows = (await sql`
      select rate_pct, taxable_pct, inclusive
      from tax_settings where user_key = ${userKey} and machine_id = ${machineId}
    `) as { rate_pct: number; taxable_pct: number; inclusive: boolean }[];
    if (!rows.length) return DEFAULTS;
    const r = rows[0];
    return {
      ratePct: Number(r.rate_pct ?? 0),
      taxablePct: Number(r.taxable_pct ?? 100),
      inclusive: r.inclusive ?? true,
    };
  } catch (e) {
    console.error("getTaxSettings failed", e);
    return DEFAULTS;
  }
}

export async function saveTaxSettings(
  userKey: string,
  machineId: string,
  s: TaxSettings,
): Promise<void> {
  if (!dbConfigured() || !machineId) return;
  await ensureSchema();
  const sql = getSql();
  const rate = clampPct(s.ratePct, 100);
  const taxable = clampPct(s.taxablePct, 100);
  await sql`
    insert into tax_settings (user_key, machine_id, rate_pct, taxable_pct, inclusive, updated_at)
    values (${userKey}, ${machineId}, ${rate}, ${taxable}, ${s.inclusive}, now())
    on conflict (user_key, machine_id) do update set
      rate_pct = excluded.rate_pct,
      taxable_pct = excluded.taxable_pct,
      inclusive = excluded.inclusive,
      updated_at = now()
  `;
}

export type TaxPeriodRow = {
  period: string;
  gross: number;
  taxable: number;
  tax: number;
  net: number;
  txns: number;
};

export type TaxReport = {
  hasData: boolean;
  txns: number;
  gross: number;
  taxableReceipts: number;
  tax: number;
  net: number;
  coveredFrom: string | null;
  coveredTo: string | null;
  granularity: "day" | "month";
  byPeriod: TaxPeriodRow[];
  byPayment: { method: string; txns: number; gross: number }[];
};

const EMPTY_REPORT: TaxReport = {
  hasData: false,
  txns: 0,
  gross: 0,
  taxableReceipts: 0,
  tax: 0,
  net: 0,
  coveredFrom: null,
  coveredTo: null,
  granularity: "day",
  byPeriod: [],
  byPayment: [],
};

/** Tax from a (tax-inclusive or -exclusive) gross, given the rate + taxable share. */
export function computeTax(
  gross: number,
  s: TaxSettings,
): { taxable: number; tax: number; net: number } {
  const r = s.ratePct / 100;
  const taxable = gross * (s.taxablePct / 100);
  const tax = r <= 0 ? 0 : s.inclusive ? taxable * (r / (1 + r)) : taxable * r;
  return { taxable, tax, net: gross - tax };
}

function monthLabel(ym: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${ym}-01T00:00:00Z`));
}

export async function taxReport(
  userKey: string,
  machineId: string,
  win: Win,
  s: TaxSettings,
  timezone: string,
): Promise<TaxReport> {
  if (!dbConfigured() || !machineId) return EMPTY_REPORT;
  await ensureSchema();
  const sql = getSql();
  const tz = cleanTz(timezone);
  const from = win.fromDate;
  const to = win.toDate;

  try {
  // Period bounds are interpreted in the machine's local timezone so a late-night
  // sale lands in the correct filing day.
  const totals = (await sql`
    select count(*)::int as txns,
           coalesce(sum(amount),0)::float as gross,
           to_char(min(occurred_at) at time zone ${tz}::text, 'YYYY-MM-DD') as cmin,
           to_char(max(occurred_at) at time zone ${tz}::text, 'YYYY-MM-DD') as cmax
    from sales
    where user_key = ${userKey} and machine_id = ${machineId}
      and occurred_at >= (${from}::date)::timestamp at time zone ${tz}::text
      and occurred_at <  ((${to}::date + 1)::timestamp) at time zone ${tz}::text
  `) as { txns: number; gross: number; cmin: string | null; cmax: string | null }[];
  const t = totals[0] ?? { txns: 0, gross: 0, cmin: null, cmax: null };
  if (!t.txns) return EMPTY_REPORT;

  const daily = (await sql`
    select to_char(date_trunc('day', occurred_at at time zone ${tz}::text), 'YYYY-MM-DD') as period,
           count(*)::int as txns,
           coalesce(sum(amount),0)::float as gross
    from sales
    where user_key = ${userKey} and machine_id = ${machineId}
      and occurred_at >= (${from}::date)::timestamp at time zone ${tz}::text
      and occurred_at <  ((${to}::date + 1)::timestamp) at time zone ${tz}::text
    group by date_trunc('day', occurred_at at time zone ${tz}::text)
    order by date_trunc('day', occurred_at at time zone ${tz}::text)
  `) as { period: string; txns: number; gross: number }[];

  const pay = (await sql`
    select coalesce(nullif(payment_method,''),'Unknown') as method,
           count(*)::int as txns,
           coalesce(sum(amount),0)::float as gross
    from sales
    where user_key = ${userKey} and machine_id = ${machineId}
      and occurred_at >= (${from}::date)::timestamp at time zone ${tz}::text
      and occurred_at <  ((${to}::date + 1)::timestamp) at time zone ${tz}::text
    group by 1 order by gross desc
  `) as { method: string; txns: number; gross: number }[];

  // Roll up to months for long ranges so the table stays readable.
  const spanDays =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  const granularity: "day" | "month" = spanDays > 92 ? "month" : "day";

  let periods: { period: string; gross: number; txns: number }[];
  if (granularity === "month") {
    const map = new Map<string, { gross: number; txns: number }>();
    for (const d of daily) {
      const ym = d.period.slice(0, 7);
      const cur = map.get(ym) ?? { gross: 0, txns: 0 };
      cur.gross += d.gross;
      cur.txns += d.txns;
      map.set(ym, cur);
    }
    periods = [...map.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([ym, v]) => ({ period: monthLabel(ym), gross: v.gross, txns: v.txns }));
  } else {
    periods = daily.map((d) => ({ period: d.period, gross: d.gross, txns: d.txns }));
  }

  const byPeriod: TaxPeriodRow[] = periods.map((p) => {
    const c = computeTax(p.gross, s);
    return { period: p.period, gross: p.gross, taxable: c.taxable, tax: c.tax, net: c.net, txns: p.txns };
  });

  const overall = computeTax(t.gross, s);
  return {
    hasData: true,
    txns: t.txns,
    gross: t.gross,
    taxableReceipts: overall.taxable,
    tax: overall.tax,
    net: overall.net,
    coveredFrom: t.cmin,
    coveredTo: t.cmax,
    granularity,
    byPeriod,
    byPayment: pay.map((p) => ({ method: p.method, txns: p.txns, gross: p.gross })),
  };
  } catch (e) {
    console.error("taxReport query failed", e);
    return EMPTY_REPORT;
  }
}
